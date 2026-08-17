# 01. 目标系统架构

[返回技术方案目录](README.md)

> 状态：评审稿  
> 关联 PRD：第 1、6、7、8、11、13 章

## 1. 架构结论

V1.0 采用“模块化控制面 + 独立在线决策服务 + Flink 流式数据面”的三部分架构。

- 控制面优先采用模块化单体，保证事务一致性和交付速度。
- 在线决策服务独立部署，避免管理操作和报表查询影响低延迟链路。
- Flink 作业独立运行，只消费已验证的运行快照，不实时查询控制面数据库。
- Kafka 作为控制面与数据面的配置、事实、计量和补偿事件总线。
- MySQL 保存权威业务事实，Redis 只承担缓存、低延迟状态和实时限流。
- 企业租户通过 ResourceRoute 从共享池迁移到专属 Topic、作业、Redis 或数据库。
- 对外接入统一走 OpenAPI 网关；平台内若发生服务拆分，底层共享服务接口采用 Dubbo 进行内网 RPC 通信，实现契约统一与低延迟调用。

## 2. 系统上下文

~~~mermaid
flowchart LR
    USER["平台与租户用户"] --> WEB["Ant Design Pro / 体验控制台 + 官网"]
    BIZ["租户业务系统"] --> GW["API Gateway"]
    DEV["租户 Kafka Producer"] --> KIN["Kafka 接入网关"]

    WEB --> CP["Control Plane API"]
    GW --> OD["Online Decision Service"]
    KIN --> KAFKA["Kafka Event Bus"]

    CP --> MYSQL["MySQL Control & Business DB"]
    CP --> REDIS["Redis"]
    CP --> KAFKA
    CP --> OBJ["Object Storage"]

    OD --> SNAP["Runtime Snapshot Cache"]
    OD --> FEATURE["Online Feature Store"]
    OD --> KAFKA

    KAFKA --> FLINK["Flink Risk Runtime"]
    FLINK --> REDIS
    FLINK --> MYSQL
    FLINK --> KAFKA

    KAFKA --> WORKER["Async Worker"]
    WORKER --> MYSQL
    WORKER --> NOTIFY["Email / SMS / IM / Webhook"]

    CP --> OBS["Logs / Metrics / Traces / Audit"]
    OD --> OBS
    FLINK --> OBS

## 2.1 平台边界与责任映射

SaaS 平台按职责分为四类能力边界：

- 平台运营面：租户、订阅、工单、支持、告警和计费入口。
- 租户运营面：成员、角色、应用、环境、规则、风险看板。
- 接入面：事件、凭证、SDK、Decision API、Webhook。
- 运行面：Flink CEP、在线决策、消息分发、异步任务与外部回调。

职责边界映射到技术模块：

| 能力域 | 模块 | 资源可见性 |
|---|---|---|
| 平台运营 | tenant-iam, entitlement, metering-billing, notification-support | 全平台元数据与授权后租户元数据 |
| 租户运营 | tenant-iam, strategy, release, risk-ops | 仅本租户 scope |
| 接入与执行 | application, identity, online-decision, flink-runtime | 本租户 app/environment scope |
| 基础治理 | identity, audit-governance, observability | 全量可观测，但按租户隔离聚合 |

该分层与 [ADR-007](adr/ADR-007-saas-platform-architecture-and-tenant-lifecycle.md) 一致：平台能力与租户能力使用统一作用域模型衔接，但不共享权限视图。
~~~

## 3. 逻辑分层

| 层级 | 组件 | 职责 |
|---|---|---|
| 体验层 | 官网、平台端、租户端、开发者中心 | 页面、交互、租户/应用/环境上下文 |
| 边缘层 | WAF、API Gateway、Kafka 接入网关 | TLS、认证、限流、幂等、TenantContext 注入 |
| 控制面 | IAM、Tenant、Entitlement、Application、Strategy、Release、RiskOps、Billing、Support | 管理权威配置和业务流程 |
| 在线决策面 | Decision API、Feature Runtime、Rule Runtime、Decision Resolver | 在同步预算内返回决策 |
| 流式数据面 | Kafka、Flink CEP、Rule Broadcast、Decision Sink | 识别跨事件序列并输出风险事实 |
| 异步任务面 | Outbox Relay、Webhook、Notification、Export、Metering Aggregator | 重试、补偿、聚合和长任务 |
| 数据底座 | MySQL、Redis、Object Storage、Kafka | 权威事实、缓存、文件和事件 |
| 治理底座 | KMS、Audit、Observability、Feature Flag | 安全、审计、监控和灰度 |

## 4. 控制面模块

控制面先作为一个 Spring Boot 部署单元，但代码、数据库访问和事件以领域模块隔离。

| 模块 | 权威数据 | 对外能力 | 禁止行为 |
|---|---|---|---|
| identity | 用户、身份源、会话、MFA | 登录回调、账户安全 | 不保存租户角色 |
| tenant-iam | 租户、成员、角色、邀请 | 租户与授权管理 | 不判断套餐权益 |
| entitlement | 套餐、订阅、权益、配额 | 权益查询、订阅变更 | 不直接改运行时 |
| application | 工作空间、应用、环境、凭证 | 接入资源管理 | 不保存规则内容 |
| strategy | 策略、规则、版本、测试 | 草稿、校验、回放 | 不直接推送 Flink |
| release | 发布单、快照、ACK、运行档案 | 发布、灰度、回滚 | 不修改规则草稿 |
| risk-ops | 风险、审核、处置、反馈 | 检索、标注、审核 | 不修改历史决策 |
| metering-billing | 用量、账单、冲正 | 用量查询、账单生成 | 不参与实时决策 |
| notification-support | 消息、告警、工单、支持会话 | 投递与客户服务 | 不绕过授权读明文 |
| audit-governance | 审计、数据请求、功能开关 | 审计检索、数据治理 | 审计不可被普通业务删除 |

模块间通过应用服务或领域事件交互；禁止跨模块 Mapper/Repository 直接写入其他模块表。

## 5. 部署单元

| 部署单元 | 状态 | 扩展方式 | 数据依赖 |
|---|---|---|---|
| risk-web-frontend | 无状态 | CDN + 水平扩展 | Control Plane API |
| risk-api-gateway | 无状态 | 水平扩展 | Redis 限流、IAM 公钥 |
| risk-control-plane | 轻状态 | 水平扩展 | MySQL、Redis、Kafka |
| risk-online-decision | 无状态/本地缓存 | 按 QPS 水平扩展 | Redis Feature、Kafka |
| risk-config-distributor | 无状态 | 主备/水平扩展 | MySQL Outbox、Kafka |
| risk-async-worker | 无状态 | 按队列积压扩展 | Kafka、MySQL、对象存储 |
| flink-shared-pool-* | 有状态 | Slot/并行度/资源池扩展 | Kafka、State Backend |
| flink-dedicated-* | 有状态 | 企业租户独立扩展 | 专属 Topic 与 State |
| observability stack | 平台服务 | 按数据量扩展 | 日志、指标、追踪存储 |

## 6. 核心同步链路

~~~mermaid
sequenceDiagram
    participant B as Business
    participant G as Gateway
    participant D as Decision Service
    participant F as Feature Store
    participant R as Rule Runtime
    participant K as Kafka

    B->>G: Evaluate + Credential + Idempotency-Key
    G->>G: Auth / TenantContext / Quota
    G->>D: Trusted DecisionRequest
    D->>F: Read and update bounded features
    F-->>D: FeatureSnapshot
    D->>R: Evaluate Active Snapshot
    R-->>D: Matched rules + final action
    D-->>G: DecisionResponse
    G-->>B: action / reason / versions
    D-->>K: DecisionFact + UsageEvent
~~~

同步响应不等待 MySQL 风险明细、Webhook 或统计聚合。异步留痕失败进入 Kafka 重试，不重新执行租户业务动作。

## 7. 核心异步链路

~~~mermaid
sequenceDiagram
    participant P as Tenant Producer
    participant I as Ingest Gateway
    participant K as Kafka
    participant F as Flink
    participant S as Decision Sinks
    participant C as Control Plane

    P->>I: Event + Credential
    I->>I: Validate / Tenant Envelope / Deduplicate
    I->>K: Trusted EventEnvelope
    K->>F: Partitioned Event
    F->>F: Watermark / CEP / Rules
    F->>K: DecisionFact
    K->>S: Persist / Cache / Webhook
    S->>C: Risk record and delivery status
~~~

## 8. 一致性边界

- 租户、成员和订阅变更使用 MySQL 本地事务。
- 跨模块事件采用 Transactional Outbox，保证数据库提交后最终发布。
- 规则发布不使用分布式事务，采用不可变快照、组件 ACK 和状态机。
- 决策事实不可修改；处置结果和投递状态作为关联事实追加。
- MySQL、Redis、Kafka 三路输出不承诺原子提交，通过稳定 decisionId 幂等和补偿收敛。
- 配额判断使用近实时计数，账单使用不可变账本，两者最终对账。

## 9. 高可用与降级

| 故障 | 目标行为 |
|---|---|
| 控制面不可用 | 数据面继续使用最后稳定 RuntimeProfile |
| MySQL 短时不可用 | 禁止新管理写入；在线决策不依赖实时 MySQL |
| Redis Feature 不可用 | 按场景执行 VERIFY_ONLY/FAIL_OPEN/FAIL_CLOSED |
| Kafka 不可用 | 同步响应按策略继续；事实进入本地有界缓冲或失败告警 |
| 规则快照加载失败 | 保持旧版本，不切换空快照 |
| 单租户流量异常 | 租户限流/熔断，不拖垮共享池 |
| 单 Sink 失败 | 标记 DELIVERY_PARTIAL 并异步补偿 |

## 10. 关键技术决策

- ADR-001：V1.0 控制面采用模块化单体。
- ADR-002：TenantContext 必须由受信任入口生成。
- ADR-003：运行配置通过版本化快照和 Kafka 发布。
- ADR-004：标准租户共享 Schema，ResourceRoute 支持专属资源。
- ADR-005：同步决策服务与 Flink 流式检测分离。
