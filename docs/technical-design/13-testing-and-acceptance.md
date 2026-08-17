# 13 测试与技术验收

> 状态：评审稿  
> 版本：v0.1

## 1. 测试分层

| 层级 | 目标 | 建议工具 |
|---|---|---|
| 单元测试 | 领域规则、编译器、聚合、权限 | JUnit 5、Mockito |
| 属性/模糊测试 | DSL、事件模式、幂等边界 | jqwik/QuickTheories、fuzzer |
| 组件测试 | MySQL/Redis/Kafka/Flink 交互 | Testcontainers、Flink Test Harness |
| 契约测试 | HTTP、Kafka、Webhook、SDK | OpenAPI/Schema compatibility |
| 集成测试 | 控制面到数据面 | Docker/K8s 临时环境 |
| E2E | 租户全流程 | Playwright + API runner |
| 性能测试 | 吞吐、时延、状态、容量 | k6/Gatling、自定义 Kafka 发生器 |
| 故障测试 | 降级、恢复、数据完整性 | Chaos 工具 + Runbook |
| 安全测试 | 越权、注入、供应链 | SAST/DAST/SCA/渗透 |

## 2. 关键测试模型

每个需求至少关联：

- requirementId。
- API/事件/数据对象。
- 正常测试。
- 权限与跨租户测试。
- 幂等/重试测试。
- 失败/恢复测试。
- 指标和审计断言。

规则测试样例本身是产品数据，随规则版本保存；平台回归套件则独立版本化。

## 3. 多租户隔离测试

为 tenant A/B 创建相同 appCode、subjectId、ruleCode 和 eventId，验证：

- API 列表、详情、更新、删除均不能越权。
- 猜测资源 ID 返回 404。
- Redis 特征、幂等和窗口状态不冲突。
- Kafka ACL 与消息 scope 不串租。
- Flink key、CEP 状态、Broadcast 快照和 Sink 唯一键隔离。
- 导出、搜索、日志、指标、Webhook 和备份恢复不串租。
- 平台支持会话过期后立即失效。

隔离测试是每次发布阻断门禁，不只做一次渗透测试。

## 4. 策略与发布测试

### 4.1 编译器

- 未知变量、类型错误、禁用函数和循环引用。
- AST 深度、集合大小、正则复杂度和执行预算。
- 相同输入生成相同 checksum。
- 不同 compiler/runtime 版本兼容矩阵。
- 恶意表达式无法访问文件、网络、反射或进程。

### 4.2 发布

- PREPARE 重复、乱序、丢失与超时。
- 部分实例 READY/ACTIVE、实例扩缩容和租约过期。
- 灰度分桶稳定、自动暂停和人工继续。
- ACTIVATE 过程中实例重启。
- 回滚到较低版本的显式授权和幂等。
- 控制面期望版本与实际版本最终一致。

## 5. 在线决策测试

- 相同 requestId/相同载荷返回相同结果。
- 相同 requestId/不同载荷返回冲突。
- 快照切换过程中单请求只使用一个版本。
- 特征 BEFORE/AFTER 更新顺序符合定义。
- 规则优先级、terminal、动作矩阵和白名单覆盖。
- Redis/Kafka/模型超时分别触发正确降级。
- 事实发布失败不被静默当作成功。
- 日志、trace 和响应不泄露敏感字段。

## 6. Flink 测试

使用 Keyed/Broadcast ProcessFunction harness、CEP 测试与 MiniCluster：

- 事件时间、watermark、idle partition。
- 重复、乱序、allowed lateness、late side output。
- 不同租户同 subjectId 状态隔离。
- Broadcast PREPARE/ACTIVATE 版本单调与原子切换。
- Checkpoint/restore 后状态、计时器和输出一致。
- TaskManager 重启、Kafka 再均衡、Sink 重试。
- 热 Key、CEP 部分匹配爆炸和状态 TTL。
- Savepoint 从上一版本恢复的兼容性。

确定性测试固定事件时间、watermark 和 snapshotVersion，禁止依赖墙上时钟。

## 7. 数据与计量测试

- 数据库迁移可重入、可暂停，前后记录数和校验和一致。
- Outbox 重复发布、Inbox 去重和死信恢复。
- decision fact、usage ledger 与 audit log 不可变。
- 迟到用量在结账前重算、结账后生成调整项。
- Redis 配额丢失后由 ledger 校准。
- 请求、判定、用量、账单四方对账差异可发现。
- 归档恢复与租户删除覆盖所有副本。
- 账单状态机/计费适配器回执幂等测试：重放事件不改变账务事实与账单最终状态。

## 8. 性能场景

基础目标：

- 在线决策：10k EPS，总 P95 ≤ 200 ms、P99 ≤ 350 ms。
- 单租户：1k EPS，突发 3 倍持续 5 分钟。
- 流式：10k EPS，event-to-decision P95 ≤ 10 秒。
- 配置：300 条规则快照，发布 P95 ≤ 5 分钟。
- 控制台：核心查询 P95 ≤ 1 秒。
- 批量事件：500 条/批，验证吞吐与部分失败。

测试必须包含：

- 常态、预测峰值 2 倍、单租户噪声邻居。
- 规则数/特征数/事件大小阶梯。
- 6—24 小时 soak test，观察内存、状态和延迟漂移。
- Redis 慢、Kafka lag、checkpoint 变大等受压场景。

报告记录代码、镜像、配置、数据集、基础设施、运行时间和原始结果，确保可复现。

## 9. 安全与恢复测试

- OIDC、MFA、token audience/expiry、HMAC replay。
- IDOR、批量越权、上传、SSRF、XSS/CSRF、注入。
- Secret、依赖、镜像、SBOM 与签名门禁。
- MySQL PITR、Kafka/Redis/Flink 恢复和对象存储版本恢复。
- 单可用区故障、实例滚动升级和错误配置回滚。
- 恢复后核对租户隔离、快照版本、消息水位和账本完整性。

## 10. 发布质量门禁

### 必须阻断

- 单元/组件/契约/E2E 失败。
- 跨租户隔离失败。
- 不兼容 API、Kafka 或 Flink 状态变化未提供迁移。
- 性能低于门槛或错误预算策略不满足。
- 高危漏洞、生产 Secret、未签名镜像。
- 无法完成发布回滚或数据库恢复演练。

### 可带风险接受

仅允许非安全、非隔离、非账务完整性的已知问题；必须记录负责人、影响、补偿措施、到期时间和审批人。

## 11. V1 技术验收清单

- 平台管理员、租户管理员、分析员和只读角色权限正确。
- 租户创建—应用接入—规则测试—审批—发布—判定—告警—反馈—用量链路贯通。
- 在线与流式判定都带完整 scope、snapshotVersion 和 trace。
- 发布可以灰度、暂停、继续、回滚，且控制面显示真实实例状态。
- 重复/乱序/迟到/故障不破坏判定事实和用量幂等。
- SLO 仪表盘、告警、Runbook、备份恢复和值班机制可用。
- 从当前 demo 数据迁移到默认租户后结果核对一致。

## 12. SaaS 闭环专项验收

新增必测项（与 PRD AC-Sxx/Txx 对齐）：

- 开通任务链路可重放：失败点可恢复，完成后产生日志与报告。
- 支持会话仅限白名单字段读，过期自动失效。
- 订单/告警事件回传处置可覆盖超时、重复、冲突场景。
- 开发者沙箱可用最小事件集完成 `evaluate`、`events`、`disposition` 三链路。
- 通知中心能按租户分组重试与停用。
- SDK 兼容性：接口新增字段不影响旧客户端运行；不兼容变更触发主版本升级。
- 公告与工单流程：公告发布必须可追踪受影响租户、发布时间线和恢复时点。
- API 版本弃用流程生效，关键接口 6 个月兼容期内不下线。
- incident 统一闭环验收：告警归一后必须形成 incident timeline 且最终闭环状态可核验。
- 计费断路演练：适配器回执超时不影响决策可用性，但必须触发回执告警和工单。

## 13. 上线前计费与 incident 演练清单（SRE Playbook）

### 13.1 计费适配器失效演练（每月）

目标：验证账单链路在支付/税务适配器异常时，决策面仍可用且可恢复。

步骤：

- 在 staging 先冻结 `billing-adapter`，保留 `metering-billing-core` 正常运行。
- 发起一笔新账单 `DRAFT -> REVIEWED -> EXPORTED`。
- 阻断模拟回执 10 分钟，观察：
  - 计费事件持续产生且进入重试队列。
  - 控制台出现非阻塞告警（告警渠道与工单）。
  - 决策 API P95 与事件接入成功率无明显下降。
- 释放阻断后，验证：
  - 回执 `ACK` / `FAILED` 被幂等消费。
  - `reconciliation_issue` 自动降级关闭。
  - incident timeline 具有发现、恢复、复盘三段记录。

验收标准：

- 决策可用性不降级到“全局拒绝”。
- 告警触发时间小于 3 分钟。
- 回执恢复后 10 分钟内无重复结算。

### 13.2 对账与账单一致性演练（每两周）

目标：验证 `usage ledger / invoice / adapter event / incident` 的一致性可被检测和修复。

步骤：

- 注入可控丢数（例如 0.5% 事件），并记录 `usageEventId` 采样。
- 执行 24 小时对账任务。
- 校验自动产出 `USAGE_MISMATCH` 与处理人分派。
- 人工触发一次账单调整（ADJUSTMENT）并观察:
  - 账单状态机仍保持单向流转；
  - 同一 issue 不产生重复冲正。

验收标准：

- 对账差异在 30 分钟内被识别。
- 调整记录可追溯调整依据、处理人、时间戳和重放防护。

### 13.3 Incident timeline 回放演练（每季度）

目标：确保一次完整事件闭环可复盘。

步骤：

- 选择最近一个真实工单：包含告警 + 工单 + 支持会话 + 公告三类记录。
- 手动重放事件到 staging 的 incident pipeline。
- 验证时间线输出字段：
  - alertId、ticketId、releaseId、decision snapshotVersion。
  - first response time、mitigate duration、MTTR、恢复确认人。
- 复现跨租户告警去重与单租户告警聚合行为。

验收标准：

- timeline 可按时间顺序完整显示 5 大事件节点（告警、确认、缓解、恢复、复盘）。
- 复盘页面能导出不可改写报告（含责任链和根因证据）。

### 13.4 平台支持会话演练（每月）

目标：验证支持权限“可控越权”。

步骤：

- 模拟售后工单触发支持会话，核验字段白名单。
- 会话中查询日志、配置与事件时，只允许 whitelisted 读。
- 到期后立即执行：
  - 会话失效。
  - 重新鉴权失败。
  - 与该会话相关的审计日志入库。

验收标准：

- 会话到期后 3 秒内全部字段访问被拒绝。
- 未绑定工单无法创建新支持会话。
