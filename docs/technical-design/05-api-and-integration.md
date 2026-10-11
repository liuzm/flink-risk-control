# 05 API 与集成契约

> 状态：评审稿  
> 版本：v0.1

## 1. API 分层

| 层级 | 前缀/协议 | 使用方 | 认证 |
|---|---|---|---|
| 管理开放 API | `/openapi/v1` | 客户与第三方 | OAuth2 Client Credentials |
| 在线决策 API | `/decision/v1` | 客户业务服务 | HMAC 或 OAuth2 |
| 事件接入 API | `/ingestion/v1` | 服务端/采集端 | HMAC |
| 控制台 API | `/console/api/v1` | 官方前端 | OIDC 会话 |
| 内部服务 API | Apache Dubbo（Triple / Dubbo 协议） | 平台服务 | mTLS + 工作负载身份 |
| 事件契约 | Kafka | 控制面/数据面 | ACL + mTLS/SASL |

外部请求必须经网关；内部 API 不暴露公网。`tenantId` 由凭证映射得到，不接受普通请求头覆盖。

### 1.1 对外 OpenAPI 与内部 Dubbo 的边界约定

项目采用“双轨 API 契约”：

- 对外（Tenant/合作方）：**OpenAPI + HTTPS**，统一走网关，面向版本化 REST 契约和生命周期管理。
- 内部（平台模块共用服务、横向调用）：**Apache Dubbo**，用于底层服务 API 协议统一和低延迟调用。

适用规则：

1. 只要是“对外可见能力”，必须有 OpenAPI 与版本化文档。
2. 只要是“同平台服务内部共享能力”，优先通过 Dubbo 接口发布，避免重复序列化与重复鉴权约定。
3. OpenAPI 与 Dubbo 的模型字段必须保持语义一致，关键主键/错误码共享 `riskflow-api-contract` 基础领域对象。
4. 内部服务不得直接调用数据库做跨模块业务逻辑，必须走服务契约（即使当前仍是同进程模块）。

## 2. HTTP 通用规范

请求头包括 `Authorization`、`X-App-Id`、`X-Environment`、`X-Request-Id`、`Idempotency-Key` 和 W3C `traceparent`。HMAC 模式另需 key id、时间戳、nonce 和签名。

成功响应：

~~~json
{
  "requestId": "req_01...",
  "data": {},
  "meta": {"nextCursor": null}
}
~~~

失败响应：

~~~json
{
  "requestId": "req_01...",
  "error": {
    "code": "RULE_VALIDATION_FAILED",
    "message": "规则校验失败",
    "details": [{"path": "condition", "reason": "unknown_feature"}],
    "retryable": false
  }
}
~~~

- 400 参数或表达式错误；401 凭证无效；403 权限/套餐越权。
- 跨租户资源访问与不存在统一返回 404。
- 409 用于版本冲突和幂等键载荷不一致。
- 429 用于租户/应用限流或额度耗尽；503 表示无法安全降级。
- 列表使用 cursor，默认 20、最大 200。
- 资源返回 `ETag`，更新使用 `If-Match`。
- 异步任务返回 202 和 `operationId`。

## 3. 在线决策 API

`POST /decision/v1/evaluate`

~~~json
{
  "requestId": "pay_20260816_00001",
  "event": {
    "eventId": "evt_01...",
    "eventType": "payment.submit",
    "occurredAt": "2026-08-16T10:01:02.123+08:00",
    "subject": {"type": "ACCOUNT", "id": "user_10001"},
    "attributes": {
      "amount": 1999.00,
      "currency": "CNY",
      "deviceId": "dev_xxx",
      "ip": "203.0.113.1"
    }
  },
  "context": {"channel": "APP", "scenario": "PAYMENT"},
  "options": {"explain": true, "timeoutMs": 180}
}
~~~

约束：正文最大 32 KB；`requestId` 在作用域内至少 24 小时唯一；事件类型必须注册；客户端超时不高于环境上限。

~~~json
{
  "requestId": "pay_20260816_00001",
  "data": {
    "decisionId": "dec_01...",
    "riskLevel": "HIGH",
    "riskScore": 86,
    "action": "CHALLENGE",
    "reasonCodes": ["DEVICE_BURST", "HIGH_AMOUNT"],
    "snapshotVersion": 1042,
    "degraded": false,
    "latencyMs": 27
  }
}
~~~

相同作用域、`requestId` 和载荷哈希返回首次结果；相同键但载荷不同返回 `IDEMPOTENCY_CONFLICT`。默认不返回内部表达式或敏感特征，`explain` 仅返回公开原因码。

## 4. 异步事件接入

- `POST /ingestion/v1/events`：返回 202 代表已可靠接收，不代表完成判定。
- `POST /ingestion/v1/events:batch`：单批最多 500 条或 5 MB。
- 批量响应逐条返回 ACCEPTED/DUPLICATE/REJECTED，不因单条错误回滚整批。
- schema 校验在进入 Kafka 前完成；无法解码的消息进入 DLQ。
- 重复 `eventId` 返回首次接收结果，不重复计量。

### 4.1 处置回传与结果对账

```text
POST /decision/{decisionId}/disposition
POST /openapi/v1/decisions/{decisionId}/disposition
```

请求体：

~~~json
{
  "decisionId": "dec_01...",
  "requestId": "pay_20260816_00001",
  "idempotencyId": "cb_01...",
  "executedAction": "BLOCK",
  "businessResult": "REJECTED",
  "executedAt": "2026-08-16T10:03:00.000Z",
  "externalReference": "order_ref_2026",
  "resultPayloadHash": "sha256:..."
}
~~~

约束：

- `decisionId` 与 `requestId` 二选一；至少一项必须提交。
- 返回 `202` 代表接收，异步参与对账，不阻塞下游决策。
- 同一 `idempotencyId` 24 小时内可重复提交，载荷冲突返回 `IDEMPOTENCY_CONFLICT`。
- 回传失败可重试，业务系统应保存回执 `dispositionEventId`。
- 平台提供回传缺失清单下载能力（租户与平台侧均可）。

## 5. 配置管理 API

核心资源：

- `/applications`、`/applications/{appId}/environments`
- `/strategy-sets`、`/rules`、`/rules/{id}/versions`
- `/rules/{id}:validate`、`/rules/{id}:simulate`
- `/releases`、`/releases/{id}:approve`
- `/releases/{id}:activate`、`/releases/{id}:rollback`

创建发布单只冻结源修订，不直接生效；审批与激活必须分离。所有写操作支持 `Idempotency-Key` 和乐观锁。

## 6. 反馈、名单与 Webhook

风险反馈 `POST /openapi/v1/feedback` 保存外部 ID、决策 ID、标签、标签发生时间和证据来源。反馈只追加；修正记录引用 `supersedesFeedbackId`。

名单批量导入采用异步任务：文件扫描 → 模式校验 → 重复预检 → 用户确认 → 写入与审计。

Webhook 支持：

- `decision.completed`、`alert.created`、`case.updated`
- `release.completed`、`quota.threshold_reached`

采用至少一次投递和唯一 `webhookEventId`。重试间隔 1m、5m、30m、2h、12h；2xx 成功，3xx 不跳转。连续失败后停用端点并通知管理员。签名覆盖时间戳和原始正文。

### 6.1 处置回传 Webhook

回传 Webhook 事件：

- `decision.disposition.required`
- `decision.disposition.received`
- `decision.disposition.mismatch`

用于平台内对账与补偿，建议与 `notification.completed` 共用同一重试器以统一熔断策略。

### 6.2 通知与消息

- `GET /notifications`
  - 查询租户消息中心消息，支持 `type`、`severity`、`status`、`channel`、`cursor`。
- `POST /notifications/{id}:ack`
  - 归档/确认已读。
- `GET /notifications/{id}`
  - 查询消息正文、关联对象与跳转 URL。
- `GET /notifications/templates`
  - 列出消息偏好与默认关闭项，账号安全/生产故障等强制消息可被策略锁定不得关闭。

### 6.3 告警与工单

- `POST /alert-rules`
  - 告警规则 CRUD，按指标、持续时长和恢复条件配置。
- `POST /support-tickets`
  - 创建工单（分类、优先级、SLA、描述、附件）。
- `GET /support-tickets`
  - 按租户、状态、负责人和截止时间过滤工单。
- `PATCH /support-tickets/{ticketId}`
  - 更新状态、负责人、SLA、处置结果。
- `POST /support-tickets/{ticketId}:assign`
  - 工单分配/接管。
- `POST /support-tickets/{ticketId}:comment`
  - 增加评论并写入服务记录。
- `POST /support-sessions`
  - 平台支持会话，绑定工单、字段白名单和到期时间。
- `DELETE /support-sessions/{sessionId}`
  - 主动回收支持会话，后续权限字段立刻失效。

### 6.4 故障/事件管理

- `GET /incidents`
  - 支持按严重级别、状态、影响范围、负责人和时间窗查询。
- `POST /incidents/{incidentId}:ack`
  - 记录确认与第一响应时间，写入响应 SLA 。
- `POST /incidents/{incidentId}:escalate`
  - 触发升级通道与值班联系人。
- `PATCH /incidents/{incidentId}`
  - 更新故障摘要、根因、状态、恢复说明和影响范围。
- `GET /incidents/{incidentId}:timeline`
  - 返回处理时间线（告警、变更、发布、支持会话）。
- `GET /incidents/{incidentId}:fingerprints`
  - 获取聚合分组标签，支持告警相似度与重复抑制。

### 6.5 计费与账单（V1.0）

- `GET /billing/plans`
  - 查询可订阅计划版本与权益码（含公开对账口径）。
- `GET /billing/contracts`
  - 查询租户合同与服务条款；V1.0 仅读写操作由平台后台管理员执行。
- `GET /billing/subscription`
  - 查询当前计费周期、权益快照、到期与状态。
- `GET /billing/usage-ledger`
  - 按 metricCode、时间窗、sourceId 聚合或查询明细。
- `GET /billing/invoices`
  - 查询用量账单与金额明细（未出账/已出账/已确认）。
- `POST /billing/invoices/{invoiceId}:request-refund`
  - 建议只在内部财务工具链调用，记录冲正链路和审批。
- `GET /billing/reconciliation-issues`
  - 查询计量差异、外部回执异常、退款异常，按租户/严重级别/状态过滤。
- `GET /billing/reconciliation-issues/{issueId}`
  - 查看差异明细、处理日志、关联 incident、建议调整和归档证据。
- `GET /billing/adapter-events`
  - 查账务适配器事件（状态、重试次数、响应码、调用来源）。
- `POST /billing/adapter-events/{adapterEventId}:ack`
  - 将异常事件标记为已人工确认，开启临时风控兜底。

## 7. 开发者能力

开发者中心目标是“接入一次可跑通三种链路”：

- 同步决策评估。
- 事件流异步接入。
- 决策处置回传。

建议最小资源：

- API 运行时（版本和签名示例）。
- Webhook 签名验证工具。
- 错误码手册（按可重试/不可重试分类）。
- 速率上限与压测脚本。

沙箱能力：

- `POST /sandbox/v1/bootstrap`：创建租户级沙箱环境。
- `POST /sandbox/v1/trace`：回放一批事件，返回 trace 与命中明细。
- `POST /sandbox/v1/decision/evaluate`：与生产接口同参同签，隔离结果空间。
- `GET /sandbox/v1/scenario:templates`：标准场景模板。

沙箱必须支持：

- 同样的鉴权流程和幂等语义。
- 不计费且不写生产账单。
- 与生产同规则语义（快照版本化后可复现）。
- 限时生命周期，过期自动销毁数据。

## 8. API 兼容性与版本治理

- 接口版本按主版本分离：`v1`、`v2`，`v3` 由架构评审后启用。
- 字段新增允许追加，字段语义不允许反向兼容。
- 错误码分组：`_RETRYABLE`、`_INVALID`、`_POLICY`、`_TENANT`。
- SDK 文档与变更日志自动与 OpenAPI 绑定发布。
- CI 阶段执行：  
  - OpenAPI 向后兼容检查。  
  - 关键字段回归测试（含 409/429/503 语义）。  
  - 示例项目编译与回归。  
- 公开弃用至少 6 个月，并在响应头 + 控制台公告 + 开发者邮件中提示。

## 9. HMAC 规范

规范化字符串：

~~~text
HTTP_METHOD
CANONICAL_PATH
SHA256(BODY)
TIMESTAMP
NONCE
KEY_ID
~~~

使用 HMAC-SHA256，时间偏差默认不超过 5 分钟，nonce 10 分钟内不可重复，支持新旧密钥重叠轮换 7 天。签名失败不暴露具体不匹配字段。

## 10. Kafka 契约

| Topic | Key | 内容 | 默认保留 |
|---|---|---|---|
| risk.event.v1 | tenant/app/env/subject | 标准业务事件 | 7 天 |
| risk.config.command.v1 | tenant/app/env | 配置命令 | 30 天 |
| risk.config.ack.v1 | runtime instance | 加载回执 | 30 天 |
| risk.decision.fact.v1 | scope/decision | 判定事实 | 30 天 |
| risk.alert.v1 | scope/alert | 告警 | 30 天 |
| risk.usage.v1 | tenant/metric | 用量流水 | 90 天 |
| risk.billing.event.v1 | tenant/billing | 计费适配器事件（draft/reviewed/issued/paid） | 180 天 |
| risk.billing.reconciliation.v1 | tenant/reconciliation | 对账/冲减建议 | 365 天 |
| risk.incident.v1 | tenant/incident | incident 生命周期变更 | 365 天 |
| risk.dlq.v1 | original topic/partition | 失败消息 | 30 天 |

统一消息头：

~~~json
{
  "eventId": "evt_01...",
  "eventType": "risk.decision.fact.v1",
  "schemaVersion": 1,
  "tenantId": "ten_01...",
  "workspaceId": "ws_01...",
  "appId": "app_01...",
  "environment": "prod",
  "occurredAt": "2026-08-16T10:01:02.123Z",
  "producedAt": "2026-08-16T10:01:02.130Z",
  "traceId": "4bf92f...",
  "producer": "decision-service"
}
~~~

Schema Registry 执行向后兼容检查；不兼容变化必须升级主版本/topic。消费者先按 schemaVersion 解码，再做业务校验。

## 11. 重试、版本与治理

- URL 仅在不兼容变化时升级主版本；字段只追加，不改变既有含义。
- 决策超时重试必须复用同一 `requestId`。
- GET、PUT、DELETE 和带幂等键 POST 可按 `Retry-After` 重试。
- 限流按凭证、租户、应用、接口、并发和套餐额度组合执行。
- OpenAPI、JSON Schema/Protobuf 是契约单一事实源。
- CI 检查破坏性变更、错误码、样例和 SDK 契约测试。
- 对外 API 弃用期不少于 6 个月，并通过响应头、控制台和邮件通知。

## 12. Kafka 运行参数（计费/incident 关键链路）

针对 `risk.billing.*` 与 `risk.incident.v1` 给出推荐生产参数（V1 起步值）：

### 12.1 Topic 与分区策略

| Topic | 分区 | 副本 | Key 建议 | 保留期 | 说明 |
|---|---:|---:|---|---:|---|
| risk.billing.event.v1 | 12（按租户 hash） | 3 | tenantId + billingEventId | 180 天 | 计费事件与回执，支持幂等重放 |
| risk.billing.reconciliation.v1 | 6（按 tenantId） | 3 | tenantId + issueType | 365 天 | 对账任务输出，偏低吞吐但高保真 |
| risk.incident.v1 | 12（按 tenantId） | 3 | tenantId + incidentId | 365 天 | incident 生命周期与 timeline |
| risk.billing.event.dlq.v1 | 6 | 3 | 原 topic + partition | 30 天 | 计费事件投递失败兜底 |
| risk.incident.dlq.v1 | 4 | 3 | 原 topic + partition | 30 天 | incident 事件处理失败兜底 |

### 12.2 Producer 配置（建议）

```properties
acks=all
retries=Integer.MAX_VALUE
max.in.flight.requests.per.connection=5
enable.idempotence=true
delivery.timeout.ms=120000
linger.ms=20
batch.size=32768
compression.type=lz4
transactional.id=risk-billing-producer
```

- 同时开启幂等与事务可以降低重复投递下游副作用；  
- `billingEventId` / `incidentId` 在业务层仍需 `dedupe` 表二次防护。

### 12.3 Consumer 组参数（建议）

#### 计费事件消费者组（`metering-billing-core`）

```properties
enable.auto.commit=false
isolation.level=read_committed
max.poll.records=500
max.poll.interval.ms=300000
session.timeout.ms=10000
heartbeat.interval.ms=3000
fetch.min.bytes=1024
fetch.max.wait.ms=500
```

重试策略：`1m -> 5m -> 30m -> 2h -> 6h`，超过后转 `risk.billing.event.dlq.v1`。  
死信消息保留 `cause + stack + sourceOffset + payload`，用于人工重放。

#### incident 事件消费者组（告警编排 + 工单系统）

```properties
enable.auto.commit=false
max.poll.records=200
max.poll.interval.ms=420000
isolation.level=read_uncommitted
```

重试策略：`30s -> 3m -> 20m -> 2h`，累计失败进入 `risk.incident.dlq.v1`；  
重试超过阈值时自动触发 `P1` 告警，要求 15 分钟内人工接手。

### 12.4 重放与幂等执行约束

- 所有消费者在提交 offset 前必须先通过 `inbox_dedupe`/`idempotency_key` 确认事件未处理过；
- 回执事件（`RETRY`/`FAILED`）入 `billing_adapter_event` 表后由调度器按租户+发票隔离更新；
- 计费回执重放时必须保证：
  - 同一 `billingEventId` 只产生一次 `in_progress -> ack` 的状态变化；
  - 重放窗口内不会触发 `invoice_line` 重复插入；
  - 同一 `incidentId` 的 timeline 顺序由数据库唯一约束保护（`tenantId + incidentId + eventType + occurredAt`）。
