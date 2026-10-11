# 11 可观测性与 SRE 设计

> 状态：评审稿  
> 版本：v0.1

## 1. 目标

平台必须回答四个问题：

1. 当前是否可用、影响哪些租户和场景？
2. 一次请求/事件在哪一环节变慢或失败？
3. 控制面期望配置与各运行实例实际版本是否一致？
4. 故障时能否按 Runbook 在目标时间内恢复？

统一采用 OpenTelemetry 采集 trace、metric、log，时间同步使用 NTP，所有服务输出 UTC 时间戳。

## 2. 关联标识

| 标识 | 范围 |
|---|---|
| traceId | 一次跨服务调用链 |
| requestId | 客户同步请求 |
| eventId | 业务/平台事件 |
| decisionId | 判定事实 |
| releaseId | 发布流程 |
| snapshotVersion | 运行时配置 |
| jobId/checkpointId | Flink 作业恢复 |
| tenant/app/env | 业务作用域 |

完整 tenantId 适合结构化日志、trace 和受控分析；Prometheus 指标只使用 tenant tier、region、runtime pool 等低基数标签。需要单租户排查时通过 exemplar/trace 或日志查询，避免指标系统基数失控。

## 3. 服务 SLI/SLO

| 服务 | SLI | SLO |
|---|---|---|
| 在线决策 | 非平台错误成功率 | 月度 ≥ 99.95% |
| 在线决策 | 服务端时延 | P95 ≤ 200 ms，P99 ≤ 350 ms |
| 控制台/API | 可用性 | 月度 ≥ 99.9% |
| 流式判定 | event-to-decision lag | P95 ≤ 10 s |
| 配置发布 | 请求到全量激活 | P95 ≤ 5 min |
| 事件接入 | 可靠接收成功率 | ≥ 99.95% |
| 计量 | 可核对完整率 | ≥ 99.99% |
| Webhook | 首次投递时效 | P95 ≤ 60 s |
| 计费适配器 | 回执一致性 | 外部回执成功率 ≥ 99.95% |

错误预算消耗过快时暂停高风险发布，优先处理可靠性问题。降级成功与正常成功分开统计。

## 4. 指标体系

### 4.1 RED

每个同步服务：

- request rate、error rate、duration。
- 按 API、状态码族、runtime pool、region、tenant tier。
- 幂等命中/冲突、限流、降级、依赖熔断。
- JVM heap、GC pause、线程池、连接池和 event loop。

### 4.2 USE

基础设施：

- CPU、内存、磁盘、网络的 utilization/saturation/errors。
- Kafka broker、partition、consumer lag、ISR。
- Redis 内存、eviction、命中率、慢命令、复制延迟。
- MySQL QPS、连接、慢查询、锁等待、复制延迟。
- 对象存储错误与吞吐。

### 4.3 Flink

- records in/out、source lag、watermark lag。
- busy/backpressured/idle 时间。
- checkpoint 成功率、时长、对齐、大小。
- restart、savepoint、state size、热 Key。
- late event、DLQ、规则错误、snapshot version mismatch。

### 4.4 业务健康

- action/risk level 比例与突变。
- 规则命中率、零命中和异常高命中。
- 人工审核积压与 SLA。
- 发布成功率、回滚率、版本漂移。
- 用量延迟、对账差异和配额拒绝率。
- 账单草稿生成与回执回写成功率。

业务指标用于检测，不直接作为账单事实。

## 5. 日志规范

结构化 JSON 必须包含 timestamp、level、service、environment、traceId、operation、result、errorCode；按需包含 tenantId/appId/requestId/eventId/decisionId/releaseId/snapshotVersion。

禁止记录：

- 明文 token、secret、身份证、银行卡和完整密码。
- 未脱敏事件正文。
- 原始规则上下文中的高敏字段。
- 数据库连接串中的凭证。

异常栈只在内部日志保留，API 返回稳定错误码。重复异常按指纹采样，安全与审计事件禁止采样。

## 6. Trace 设计

- 接受并验证 W3C traceparent；不可信 baggage 不传播权限信息。
- Kafka producer 注入 trace context，consumer 创建新 span 并建立 link。
- 关键 span：auth、quota、idempotency、snapshot lookup、feature fetch、rule evaluate、model call、fact publish。
- 正常流量按低比例采样；错误、降级、慢请求、发布和支持会话 100% 保留。
- trace 中敏感 attribute 使用哈希或枚举。

## 7. 告警分级

| 级别 | 示例 | 响应 |
|---|---|---|
| SEV1 | 跨租户风险、决策全面不可用、事实大面积丢失 | 5 分钟响应，立即指挥 |
| SEV2 | 单地域/大客户不可用、错误预算快速燃烧 | 15 分钟响应 |
| SEV3 | 容量逼近、单依赖降级、发布失败 | 工作时间或值班处理 |
| SEV4 | 趋势、优化项 | 进入迭代 |

优先使用多窗口 burn-rate 告警，而不是单点阈值。告警必须包含影响、当前值、SLO、仪表盘、最近发布和 Runbook 链接。

## 8. 仪表盘

- 平台总览：SLO、流量、错误、时延、降级和错误预算。
- 决策链路：各阶段时延、动作分布、幂等、特征和模型。
- Flink：lag、watermark、checkpoint、反压、状态和版本。
- 发布：各作用域期望/实际快照、回执和灰度指标。
- 租户健康：单租户流量、额度、错误、P95 与版本。
- 计量：使用延迟、ledger 水位、对账差异和账单状态。
- 安全：认证失败、密钥、支持会话、导出和异常访问。
- 财务：账单草稿、计费事件延迟、回执失败率、退款异常、reconciliation_issue 数量。

## 9. Runbook 与值班

最少 Runbook：

- 在线决策 P95 升高。
- Redis、Kafka、MySQL 故障。
- Flink checkpoint 连续失败/严重反压。
- 配置版本漂移或发布卡住。
- Outbox/消费积压。
- 单租户流量异常或热 Key。
- 用量对账不平。
- 疑似跨租户访问或密钥泄露。
- 计费适配器回执超时、失败风暴。

每份 Runbook包含症状、影响判定、立即缓解、诊断步骤、回滚/恢复、验证和升级路径。禁止把破坏性命令做成未经确认的一键脚本。

## 10. 容量与演练

- 每周预测 4 周容量，关注 Kafka partition、Flink state、Redis memory、MySQL IOPS、对象存储和决策实例。
- 常态目标资源利用率 40%—60%，预留单可用区故障余量。
- 每季度进行 Redis/Kafka/Flink/数据库恢复和区域故障演练。
- 每次大版本发布前执行容量回归和降级演练。

## 11. 仪表盘增强：计费与 incident 视图

- 计费看板：账单草稿率、回执延迟分位、退款失败率、reconciliation_issue。
- incident 看板：按严重级别、影响范围、超时率、平均恢复时长。
- 复盘看板：每次 incident 的 MTTD/MTTR、发布影响、SLA 命中率。

## 12. 验收

- 可从客户 requestId 在 10 分钟内定位到完整决策链和快照。
- SLO、错误预算、发布和 Flink 版本漂移均有可用仪表盘和告警。
- 指标标签基数有预算和 CI/运行时保护。
- 故障告警能直接关联 Runbook、最近发布和影响范围。
- 至少一次端到端故障演练验证发现、响应、恢复和复盘流程。
- 计费适配器失效演练覆盖告警、人工介入和回溯闭环。
- incident timeline 可回放且可关联告警、工单、支持会话与公告。
