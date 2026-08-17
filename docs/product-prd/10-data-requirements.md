# 10. 数据需求

[返回章节目录](README.md)

## 10.1 SaaS 控制面数据

建议新增以下核心实体：

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `tenant` | `id`、`code`、`name`、`status`、`region`、`timezone`、`isolation_level` | 租户主档 |
| `user_account` | `id`、登录标识、身份源、状态 | 平台级身份账号，不直接承载租户权限 |
| `tenant_membership` | `tenant_id`、`user_id`、状态、加入时间 | 用户与租户的多对多关系 |
| `role` / `permission` | 权限命名空间、作用域、系统预置标记 | 平台与租户角色分域 |
| `membership_role` | 成员、角色、应用和环境范围 | 租户内授权关系 |
| `workspace` / `application` | `tenant_id`、编码、状态 | 租户业务资源层级 |
| `app_environment` | 应用、环境、接入状态、资源路由 | DEV/TEST/PROD 隔离 |
| `api_credential` | 归属、范围、密文/哈希、过期时间、状态 | API、OAuth、Kafka 凭证 |
| `plan` / `plan_version` | 套餐、版本、状态 | 套餐版本化定义 |
| `entitlement` | 功能编码、配额项、限制方式 | 功能和数值权益 |
| `subscription` | 租户、套餐版本、周期、状态 | 租户订阅关系 |
| `tenant_quota_override` | 配额项、覆盖值、原因、有效期 | 租户个性化额度 |
| `tenant_runtime_profile` | 租户作用域、配置版本、资源路由、快照、校验和、状态 | 控制面编译给数据面的不可变运行档案 |
| `config_release` | 目标作用域、旧/新版本、组件 ACK、发布状态 | 跟踪配置生效和回滚 |
| `resource_route` | 隔离等级、Kafka/Flink/DB/Redis 路由、有效期 | 共享或专属资源选择依据 |
| `usage_ledger` | 租户、指标、时间桶、数量、来源幂等键 | 不可变用量账本 |
| `idempotency_record` | 租户、应用、环境、幂等键、原响应、过期时间 | 防止开放接口重复处理 |
| `audit_log` | 主体、租户、资源、动作、前后值、结果 | 平台和租户全量审计 |
| `support_session` | 工单、租户、授权人、范围、有效期 | 平台支持租户的受控会话 |
| `lead` / `trial_application` | 来源、联系人、状态、负责人、转化租户 | 官网线索和试用申请 |
| `invitation` | 租户、邀请人、接收标识、角色、到期时间、状态 | 成员邀请及接受流程 |
| `identity_session` / `mfa_factor` | 用户、设备、会话、认证方式、撤销状态 | 登录安全与全局会话管理 |
| `onboarding_progress` | 租户、里程碑、完成时间、来源对象 | 首次激活和客户成功漏斗 |
| `contract` / `billing_account` | 租户、主体、周期、币种、付款条款 | 商务合同和账单账户 |
| `bill` / `bill_line` / `adjustment` | 账期、状态、用量快照、金额、冲正 | 可追溯账单及修正 |
| `webhook_endpoint` / `webhook_delivery` | 作用域、订阅事件、签名密钥、投递结果 | 回调配置、重试和重放 |
| `api_request_log` | 请求、租户、应用、环境、接口、耗时、结果 | 开发者调用观察与问题定位 |
| `notification` / `delivery_record` | 类型、接收人、通道、去重键、投递状态 | 站内及多通道消息 |
| `alert_rule` / `incident` | 指标、阈值、指纹、级别、状态、影响范围 | 告警聚合与故障管理 |
| `support_ticket` / `ticket_comment` | 租户、分类、优先级、SLA、负责人、状态 | 客户服务闭环 |
| `service_announcement` | 影响范围、发布时间、状态、内容版本 | 维护、故障和产品公告 |
| `feature_flag` | 功能、目标套餐/租户/区域、有效期、状态 | 功能灰度和产品治理 |
| `product_template` | 类型、场景、版本、发布状态、内容引用 | 规则、策略和场景模板 |

## 10.2 租户业务数据约束

- `rule_config`、规则版本、策略集、风险结果、审核、Webhook、导出任务等所有租户业务表强制包含 `tenant_id`。
- 应用级数据同时包含 `workspace_id`、`app_id`、`environment`；字段非空规则由资源类型决定。
- 唯一约束采用租户作用域，例如规则名称唯一键为 `tenant_id + app_id + environment + name + version`。
- 查询索引以 `tenant_id` 为首列，再结合应用、环境、时间和业务检索字段设计。
- 分库分表路由首先使用 `tenant_id`，企业专属租户可映射到独立数据源。
- 禁止业务表以固定默认租户填充缺失上下文；历史数据迁移必须建立明确的系统租户或迁移租户映射。

## 10.3 规则数据

当前 `rule_config` 已包含名称、表达式、等级、动作、权重、启用状态和描述。V1.0 建议补充：

- `tenant_id`、`workspace_id`、`app_id`、`environment`：租户及应用作用域。
- `scene_type`：场景类型。
- `pattern_types`：适用模式集合。
- `version`：发布版本。
- `status`：生命周期状态。
- `priority`：稳定决胜优先级。
- `effective_time`、`expire_time`：生效与失效时间。
- `created_by`、`updated_by`、`published_by`、`published_at`。
- `change_reason`：变更原因。

另建规则版本表和规则操作审计表，禁止仅依赖当前行保存历史。

## 10.4 风险结果数据

当前 `risk_result` 已包含用户、事件、类型、等级、分数、动作、详情和创建时间。V1.0 建议补充：

- `tenant_id`、`workspace_id`、`app_id`、`environment`：强制隔离和查询作用域。
- `decision_id`：决策唯一 ID。
- `request_id`、`correlation_id`：同步调用和跨链路关联 ID。
- `pattern_type`：模式编码。
- `source_event_ids`：参与判断的来源事件 ID。
- `matched_rule_ids`、`final_rule_id`、`rule_version`。
- `engine_status`、`degrade_reason`。
- `decision_status`、`delivery_status`、`reason_code`：决策与分发状态及稳定原因码。
- `rule_snapshot_version`、`effective_config_version`：实际执行版本。
- `disposition_status`、`disposition_result`、`disposition_time`。
- `redis_status`、`kafka_status`、`mysql_status`。
- `occur_time`、`decision_time`：区分业务发生时间与系统处理时间。

## 10.5 数据保留与租户删除

- Redis 决策缓存默认 1 小时，可按场景配置。
- MySQL 风险明细默认在线保留 180 天，之后归档；实际周期由合规和数据量评审确认。
- 审计日志默认保留 1 年。
- IP、设备、地址等敏感字段应加密存储或脱敏展示，并设置访问审计。
- 数据保留周期受套餐和合规上限共同控制，套餐升级可延长后续数据保留，但不得自动恢复已清理数据。
- 租户进入 `CLOSING` 后提供一次完整导出窗口；进入 `DELETED` 后按数据清单清理业务表、缓存、Topic、对象文件、搜索索引和备份引用。
- 删除任务生成不可篡改的执行报告，记录各存储介质的删除状态；法定必须保留的审计数据与业务数据分库存放并持续脱敏。

---

