# 02. 多租户架构

[返回技术方案目录](README.md)

> 状态：评审稿  
> 最高优先级：跨租户数据泄露为零

## 1. 隔离单位

运行作用域定义为：

TenantScope = tenantId + workspaceId + appId + environment

其中 tenantId、appId、environment 为运行链路必填；V1.0 默认工作空间可以隐藏，但数据模型保留 workspaceId。

业务主体状态 Key 定义为：

SubjectScope = TenantScope + subjectType + subjectId

任何 CEP、在线特征、幂等、缓存和风险查询不得只使用 userId 或 eventId。

## 2. TenantContext

~~~text
TenantContext
- tenantId
- workspaceId
- appId
- environment
- actorType: USER | SERVICE | PLATFORM_SUPPORT
- actorId
- membershipId
- roles[]
- dataScopes[]
- credentialId
- requestId
- supportSessionId?
- issuedAt / expiresAt
~~~

### 2.1 上下文生成

| 入口 | 可信来源 | 处理方式 |
|---|---|---|
| 租户 Web | 登录令牌中的 tenant/membership | 网关校验后注入 |
| 平台 Web | 平台令牌中的 platform roles | 生成 PlatformContext，不伪造 TenantContext |
| Decision API | API Key/OAuth Client 绑定关系 | 服务端解析 tenant/app/env |
| Kafka 接入 | SASL Principal/接入凭证 | 接入网关生成可信事件信封 |
| 异步任务 | 持久化任务记录 | 调度器恢复作用域，不继承线程残留 |
| Webhook 重试 | delivery 记录 | 使用原始租户作用域和 endpoint 绑定 |
| 支持会话 | 平台身份 + 租户授权票据 | 生成限时、只读、全审计上下文 |

请求 Body 中的 tenantId 只用于一致性校验，不能覆盖凭证绑定值。

### 2.2 传播方式

- HTTP：内部请求头携带签名后的上下文摘要；外部客户端不能直接设置内部头。
- Kafka：EventEnvelope/DecisionFact 的 header 和 payload 都包含 scope，消费者校验一致性。
- 异步线程：使用显式参数或任务对象，不依赖 ThreadLocal 跨线程传播。
- 数据访问：Repository 方法必须接收 Scope，或从已校验上下文获取。
- 日志追踪：记录 tenantId 哈希/受控标识、appId、environment、requestId，不记录 Secret。

## 3. 分层隔离策略

| 层级 | V1.0 强制措施 | 二次防线 |
|---|---|---|
| 网关 | 凭证绑定 Scope、状态和权限 | Body/Header 一致性校验 |
| 服务 | 方法级权限、资源归属校验 | 平台/租户权限命名空间分离 |
| MySQL | tenant_id 首列条件与组合索引 | MyBatis 拦截器 + Repository 显式 Scope |
| Redis | rf:{tenant}:{app}:{env}: 前缀 | 封装 KeyBuilder，禁止裸 Key |
| Kafka | ACL + 可信 EventEnvelope | 消费端 Scope/Topic 路由复核 |
| Flink Keyed State | Scope + subject 组合 Key | Serializer 版本与状态测试 |
| Broadcast State | RuntimeScope → Snapshot | 版本、签名和 tenant 校验 |
| 对象存储 | tenants/{tenantId}/... | 短期签名 URL + 下载再鉴权 |
| 搜索/分析 | 租户分区键 | 查询服务强制过滤 |
| 导出 | 任务绑定租户与筛选快照 | 文件路径隔离、一次性下载 |
| 监控 | 租户安全聚合 | 高基数数据进入日志/分析存储 |

## 4. 数据库隔离

### 4.1 标准租户

V1.0 使用共享 MySQL 集群和共享 Schema：

- 所有租户业务表 tenant_id 非空。
- 应用级表同时包含 app_id 和 environment。
- 唯一键必须包含 tenant_id；应用级唯一键继续包含 app_id/environment。
- 高频查询索引以 tenant_id 开头。
- 更新和删除必须同时包含主键与 tenant_id。
- 不提供无 Scope 的业务 Repository 方法。
- 批处理按租户分片执行，禁止先查全量再在内存过滤。

示例索引：

~~~sql
UNIQUE KEY uk_rule_scope_version
  (tenant_id, app_id, environment, rule_code, version);

KEY idx_risk_scope_time
  (tenant_id, app_id, environment, decision_time, id);
~~~

### 4.2 企业专属租户

ResourceRoute 决定 DB Route、Redis Route、Kafka Route 和 Flink Pool。业务代码不根据套餐写 if/else，而是调用 TenantResourceRouter。

升级流程：

1. 冻结目标租户结构变更。
2. 建立专属资源并完成基线校验。
3. 全量复制 + 增量 CDC/双写。
4. 校验规则数、风险数、决策哈希和用量。
5. 灰度切换读，再切换写。
6. 更新 RuntimeProfile 并观察。
7. 保留回滚窗口后释放旧路由。

## 5. Redis 隔离

统一 KeyBuilder：

~~~text
rf:{tenantId}:{appId}:{env}:{domain}:{resource}
~~~

示例：

- 风险缓存：rf:t1:a1:prod:risk:{decisionId}
- 在线特征：rf:t1:a1:prod:feature:{subjectType}:{subjectId}:{featureCode}
- 幂等：rf:t1:a1:prod:idempotency:{keyHash}
- 配额：rf:t1:a1:prod:quota:{metric}:{window}
- 配置：rf:t1:a1:prod:runtime:{version}

要求：

- 禁止 KEYS 和跨租户 SCAN。
- Lua 脚本的所有 Key 必须处于同一 TenantScope。
- TTL 由领域策略设置，不能依赖 Redis 默认。
- 企业专属 Redis 由 ResourceRoute 透明选择。

## 6. Kafka 隔离

### 6.1 Topic 策略

| 隔离级别 | 输入 Topic | 输出 Topic |
|---|---|---|
| 共享 | rf.events.{scene}.v1 | rf.decisions.v1 |
| 增强 | rf.tenant.{tenant}.events.v1 | rf.tenant.{tenant}.decisions.v1 |
| 专属 | 专属集群/命名空间 | 专属集群/命名空间 |

共享 Topic 的 Message Key：

tenantId|appId|environment|subjectType|subjectId

### 6.2 可信事件信封

~~~json
{
  "schemaVersion": "1.0",
  "tenantId": "t_01",
  "appId": "app_01",
  "environment": "PROD",
  "eventId": "evt_01",
  "eventType": "LOGIN",
  "subjectType": "USER",
  "subjectId": "u_01",
  "occurredAt": 1710000000000,
  "ingestedAt": 1710000000100,
  "credentialId": "cred_01",
  "traceId": "trace_01",
  "attributes": {}
}
~~~

tenantId/appId/environment 由接入网关注入。直接 Kafka 接入也必须通过 ACL 和受控 Producer SDK 生成可信信封。

## 7. Flink 状态隔离

现状 keyBy(userId) 必须改为 TenantSubjectKey：

~~~text
TenantSubjectKey {
  tenantId,
  appId,
  environment,
  subjectType,
  subjectId
}
~~~

- CEP State、去重 State、计数 State 和定时器都使用该 Key。
- 状态序列化器固定字段顺序并设置 schemaVersion。
- 规则 Broadcast State 使用 MapStateDescriptor<RuntimeScope, RuleSnapshot>。
- 单租户规则更新只替换对应 RuntimeScope。
- 任何缺失 Scope 的事件进入安全死信，不进入默认租户。
- State TTL 必须大于最长 CEP 窗口和允许迟到时间，并留恢复余量。

## 8. 平台支持访问

平台人员不能直接切换成租户管理员。支持访问需要同时满足：

1. 有效平台客服/运维身份。
2. 有效工单。
3. 租户所有者或管理员授权。
4. 明确资源范围、字段范围和有效期。
5. 默认只读，生产敏感字段脱敏。
6. 页面持续显示支持模式。
7. 每次请求写 supportSessionId 和审计日志。
8. 租户可随时撤销，超时自动失效。

## 9. 防越权测试矩阵

- A 令牌访问 B 的规则 ID、风险 ID、成员 ID、导出 ID。
- A 的 API Key 声明 B 的 tenantId。
- DEV 凭证访问 PROD 资源。
- 平台普通运营读取租户规则表达式。
- 支持会话过期后继续访问。
- 下载 URL 被其他租户复用。
- Redis Key、Kafka 消息和 Flink State 使用相同业务 ID 的跨租户碰撞。
- 批量接口混入其他租户 ID。
- WebSocket/SSE 在切换租户后继续推送旧租户数据。

所有用例必须返回无权限或资源不存在，并生成安全审计。

