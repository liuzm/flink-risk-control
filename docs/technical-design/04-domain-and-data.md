# 04 领域与数据模型设计

> 状态：评审稿（补全版）  
> 版本：v1.1  
> 适用数据库：MySQL 8.0+

## 1. 设计目标

这版数据库设计用于「面向多租户风控 SaaS」，要求：

- 完整支持租户隔离、应用接入、策略发布、决策、风险运营、计量计费、审计治理的端到端链路；
- 支持决策幂等、重放、回传、对账、服务降级；
- 保证多场景下字段可追溯（试用、接入、上线、异常、处置、账单、工单）；
- MySQL8.0 使用；不定义外键；通过 `tenant_id / app_id / scope` + 明确索引替代；
- 每个核心场景字段尽可能完整可落地。

## 2. 技术约束与建模规范

1. 字段规范
   - 全局 ID 使用业务内可读的 26 位 ID（如 `tenant_id`、`decision_id` 等）；
   - 时间统一 `DATETIME(6)`；
   - 多租户查询统一以 `tenant_id` 为左侧条件；应用域查询必须带 `tenant_id + app_id + environment`；
   - 业务事件/消息统一保留：`request_id`、`trace_id`、`correlation_id`；
   - 敏感字段只存脱敏或加密形态（`*_hash`、`*_ciphertext`）并记录密钥版本。

2. 审计与治理字段

所有高频业务表默认要求：

- `row_status`（ACTIVE / ARCHIVED / DELETED）；
- `created_at / created_by / updated_at / updated_by / deleted_at / deleted_by`；
- `row_version BIGINT`（用于乐观并发）；
- `request_id / trace_id / source_request_id`（跨链路串联）。

3. MySQL8 配置建议

- 字符集：`utf8mb4`，排序：`utf8mb4_0900_ai_ci`；
- 引擎：`InnoDB`；
- 不创建 `FOREIGN KEY`；外键语义记录在注释与事件模型；
- 高频表至少有时间索引（`xxx_at`）；关键唯一约束优先选择复合唯一（含 `tenant_id`）。

## 3. 领域边界（与平台能力映射）

- 身份/组织域：`tenant / workspace / member / role / permission`
- 接入域：`application / app_environment / api_credential / webhook_endpoint / webhook_delivery`
- 策略域：`rule_set / rule_definition / rule_version / rule_test_case / config_release / runtime_snapshot`
- 决策域：`decision_request / decision_fact / decision_rule_hit / decision_disposition / event_ingest`
- 风险运营域：`alert_rule / alert / incident / incident_timeline / risk_case / list_definition / list_entry / manual_feedback`
- 运维/支持域：`onboarding_task / onboarding_step / support_ticket / support_session / notification`
- 计量计费域：`plan / pricing_metric / plan_price_tier / tenant_subscription / entitlement_snapshot / usage_ledger / usage_daily_summary / invoice / invoice_item / billing_adapter_event / reconciliation_issue`
- 审计与安全域：`audit_log / auth_session / security_event / data_export_job`
- 异步基础设施域：`outbox_event / inbox_event / background_job`

## 4. 完整 DDL 实现清单（MySQL8，无 FK）

> 完整建库脚本见：`sql/riskflow_saas_mysql8_full_schema.sql`。
>
> 下面按业务域给出字段级设计，便于评审与场景验收。

### 4.1 身份与组织域

#### 4.1.1 `tenant`

- `tenant_id` `CHAR(26)` PK
- `tenant_code` `VARCHAR(64)` UNIQUE：租户唯一业务编码
- `tenant_name` `VARCHAR(128)` / `display_name`
- `tenant_type` `ENUM('ENTERPRISE','PLATFORM','ISV','TRIAL')`
- `tenant_tier` `ENUM('BASIC','PRO','GOLD','CUSTOM')`
- `status` `ENUM('PENDING','TRIAL','ACTIVE','PAUSED','SUSPENDED','RESTRICTED','CLOSED')`
- `industry` `VARCHAR(64)` / `company_domain`
- `country_code` `CHAR(2)` / `region` `VARCHAR(32)` / `timezone` `VARCHAR(64)`
- `billing_currency` `CHAR(3)` / `default_language` `VARCHAR(16)`
- `legal_entity_name` `VARCHAR(128)` / `business_registration_no` `VARCHAR(64)`
- `contact_name` `VARCHAR(64)` / `contact_email` `VARCHAR(128)` / `contact_phone` `VARCHAR(40)`
- `trial_start_at` / `trial_end_at` / `activated_at`
- `suspend_reason` `VARCHAR(255)` / `closing_reason`
- `is_data_masking_enabled` `TINYINT(1)` / `pii_retention_days` `INT`
- `compliance_profile_json` `JSON`（分级、审计要求）
- `metadata_json` `JSON`
- 通用治理字段：`row_status / created_at / created_by / updated_at / updated_by / deleted_at / deleted_by / row_version / request_id / trace_id`

**关键索引**：
- `UNIQUE KEY uk_tenant_code (tenant_code)`
- `INDEX idx_tenant_status_tier (tenant_tier, status)`
- `INDEX idx_tenant_region_status (region, status)`

#### 4.1.2 `workspace`

- `workspace_id` PK / `tenant_id`（需检索过滤）
- `workspace_code` / `workspace_name` / `description`
- `owner_member_id`（租户内工作空间管理员）
- `environment_quota_profile` `JSON`
- `is_default_workspace`、`is_isolated`、`max_members`、`max_apps`
- `status` / `suspend_reason` / `archived_reason`
- 通用治理字段

**关键索引**：
- `UNIQUE KEY uk_workspace_tenant_code (tenant_id, workspace_code)`
- `INDEX idx_workspace_status (tenant_id, status)`

#### 4.1.3 `platform_user`

- `user_id` PK、`tenant_bind_required`（是否只允许平台成员登录）
- `email / mobile_phone`（唯一性约束）
- `password_hash`、`password_version`
- `mfa_enabled`、`mfa_secret_ref`
- `display_name`、`avatar_url`
- `status`（`ACTIVE/INACTIVE/LOCKED`）
- `last_login_at` / `password_updated_at` / `lock_until`
- `login_fail_count` / `login_fail_reset_at`
- `last_password_breach_check_at`
- `user_profile_json`（扩展字段）
- 通用治理字段

**关键索引**：
- `UNIQUE KEY uk_platform_user_email (email)`
- `UNIQUE KEY uk_platform_user_phone (mobile_phone)`
- `INDEX idx_platform_user_status (status)`

#### 4.1.4 `tenant_member`

- `member_id` PK
- `tenant_id` / `user_id`
- `workspace_id`
- `member_name`、`member_email`（冗余快照）
- `member_type`（`HUMAN / SERVICE`）
- `status`（`PENDING/ACTIVE/PAUSED/LEFT`）
- `invited_at` / `joined_at` / `expired_at`
- `invitation_source` / `last_access_workspace_id`
- `identity_provider`、`provider_subject`
- `mfa_enforced`（该成员租户内是否强制）
- 通用治理字段

**关键索引**：
- `UNIQUE KEY uk_tenant_user (tenant_id, user_id)`
- `INDEX idx_member_user (user_id)`
- `INDEX idx_member_workspace (workspace_id, status)`

#### 4.1.5 `tenant_role` / `tenant_permission` / `tenant_role_permission` / `tenant_member_role`

- `tenant_role`: `role_id` / `tenant_id` / `role_code` / `name` / `scope_type`（租户/工作空间/应用）/ `scope_json` / `is_system_role` / `is_editable` / `effective_from/to`。
- `tenant_permission`: `permission_id` / `permission_code` / `resource_domain` / `action` / `effect` / `resource_scope_json` / `description`。
- `tenant_role_permission`: `relation_id` / `tenant_id` / `role_id` / `permission_id` / `granted_by` / `granted_at`。
- `tenant_member_role`: `member_role_id` / `tenant_id` / `member_id` / `role_id` / `workspace_id` / `app_id` / `expires_at` / `is_default`。

**关键索引**：
- `UNIQUE KEY uk_tenant_role_code (tenant_id, role_code)`
- `UNIQUE KEY uk_tenant_perm_code (tenant_id, permission_code)`
- `INDEX idx_role_perm_role (role_id)` / `INDEX idx_member_role_member (member_id, status)`

### 4.2 接入与应用域

#### 4.2.1 `application`

- `app_id` PK / `tenant_id` / `workspace_id`
- `app_code`（租户内唯一）`app_name`
- `app_type`（`ECOMMERCE/FINTECH/GAME/GENERAL`）
- `timezone` / `default_subject_type`
- `industry` / `risk_scenarios_json`
- `is_sandbox` / `is_demo` / `is_deprecated`
- `service_owner_user_id` / `security_owner_user_id`
- `contact_email` / `contact_phone`
- `data_retention_days` / `export_permission`
- `status`（`DRAFT/ONLINE/MAINTENANCE/OFFLINE`）
- 通用治理字段

**关键索引**：
- `UNIQUE KEY uk_tenant_workspace_app_code (tenant_id, workspace_id, app_code)`
- `INDEX idx_app_status_tier (tenant_id, status)`

#### 4.2.2 `app_environment`

- `environment_id` PK
- `tenant_id` / `app_id` / `workspace_id`
- `environment`（`dev/stage/preprod/prod`）
- `decision_mode`（`SYNC` / `STREAMING` / `HYBRID`）
- `fail_policy`（`FAIL_OPEN` / `FAIL_CLOSED` / `STATIC_ACTION`）
- `static_fail_action`（`ALLOW/REVIEW/BLOCK`）
- `active_snapshot_id` / `active_snapshot_version`
- `max_qps` / `max_burst` / `queue_timeout_ms`
- `circuit_breaker_window_sec` / `failure_threshold`
- `routing_namespace`
- `allowed_clients_json`（SDK/SDK版本白名单）
- `ip_region_restriction`
- `status` / `maintenance_mode`
- 通用治理字段

**关键索引**：
- `UNIQUE KEY uk_app_env_scope (tenant_id, app_id, environment)`
- `INDEX idx_env_status (tenant_id, status)`

#### 4.2.3 `api_credential`

- `credential_id` PK
- `tenant_id / app_id / environment_id`
- `credential_name` / `key_id`
- `credential_type`（`API_KEY/OAUTH_CLIENT/JWT`）
- `secret_hash` / `secret_kms_ref` / `secret_version`
- `allowed_subject_types_json`（如 `merchant/user`）
- `allowed_subject_key_hashes_json`
- `rate_limit_per_minute` / `rate_limit_per_hour`
- `scope_json`（允许的资源与操作）
- `rotate_interval_days` / `last_rotated_at` / `next_rotate_at`
- `valid_from` / `valid_to`
- `ip_whitelist_json`
- `last_used_at` / `last_used_ip_hash` / `last_error_at`
- `status`（`ACTIVE/ROTATING/EXPIRED/REVOKED`）
- 通用治理字段

**关键索引**：
- `UNIQUE KEY uk_credential_key_id (tenant_id, app_id, key_id)`
- `INDEX idx_credential_status_env (tenant_id, environment_id, status)`

#### 4.2.4 `webhook_endpoint`

- `webhook_id` PK
- `tenant_id / app_id / environment_id`
- `endpoint_name`
- `url` / `http_method`
- `event_filter_json`（接收哪些事件）
- `secret_ref` / `signature_algorithm`
- `retry_strategy_json`（重试间隔和最大重试）
- `timeout_ms` / `max_payload_size`
- `backoff_jitter` / `ssl_pinning`
- `status` / `is_critical` / `maintenance_enabled`
- 通用治理字段

#### 4.2.5 `webhook_delivery`

- `delivery_id` PK
- `tenant_id / app_id / environment_id`
- `webhook_id` / `event_type` / `source_topic`
- `decision_id` / `event_id` / `usage_event_id`
- `attempt_no` / `next_retry_at` / `retry_count`
- `request_id` / `trace_id`
- `http_status` / `request_body_hash`
- `response_status_code` / `response_body`（建议保留 2KB 摘要）
- `delivered_at` / `next_action`
- `delivery_status`（`PENDING/SUCCESS/FAILED/SKIPPED`）
- 通用治理字段

**关键索引**：
- `INDEX idx_wh_deliver_lookup (tenant_id, app_id, environment_id, delivery_status, next_retry_at)`
- `INDEX idx_wh_reference (webhook_id, source_topic, event_type)`

### 4.3 策略与发布域

#### 4.3.1 `rule_set`

- `rule_set_id` PK
- `tenant_id / workspace_id / app_id / environment_id`
- `rule_set_code`（租户内唯一）
- `rule_set_name`
- `scenario`（`LOGIN/OFFER/ORDER/ACTIVITY/CUSTOM`）
- `purpose`（`BLOCK/VERIFY/RISK_SCORE`）
- `status`（`DRAFT/VALIDATED/ONLINE/PAUSED/ARCHIVED`）
- `is_default_set`
- `effective_from` / `effective_to`
- `active_version_no` / `draft_version_no`
- `publish_blocked_reason` / `rollback_target_version_no`
- `tags_json`
- 通用治理字段

#### 4.3.2 `rule_definition`

- `rule_id` PK
- `rule_set_id` / `tenant_id / app_id / environment_id`
- `rule_code`（域内唯一）
- `rule_name` / `rule_category`（表达式/阈值/CEP/名单/模型）
- `rule_type`
- `action_recommendation`（推荐动作）
- `priority` / `risk_score_weight`
- `status`（`DRAFT/ACTIVE/DISABLED/DEPRECATED`）
- `current_version_no` / `active_version_no`
- `description` / `rationale`
- `risk_signals`（该规则依赖的信号）
- `risk_threshold` / `cooldown_sec`
- `target_subject_types`
- 通用治理字段

#### 4.3.3 `rule_version`

- `rule_version_id` PK
- `rule_id` / `tenant_id / app_id / environment_id`
- `version_no`
- `source_version_id`（回溯链）
- `dsl_language` / `dsl_text`
- `compiled_ir_json` / `compiled_checksum`
- `action_json`（输出动作映射）
- `feature_refs_json`
- `input_validation_schema`
- `dry_run_pass_rate`
- `unit_test_pass_rate`
- `compiled_runtime_version`
- `status`（`DRAFT/TESTING/APPROVED/REJECTED/ARCHIVED`）
- `effective_from` / `effective_to`
- `release_snapshot_id`
- `approved_by / approved_at`
- `publish_for_approval_reason`
- `rollback_group`
- 通用治理字段

**关键索引**：
- `UNIQUE KEY uk_rule_version_no (rule_id, version_no)`
- `INDEX idx_rule_status (tenant_id, rule_id, status)`

#### 4.3.4 `rule_test_case`

- `test_case_id` PK / `rule_id` / `rule_version_id`
- `case_code` / `case_name`
- `input_payload_json`
- `expected_action` / `expected_risk_level` / `expected_score`
- `expected_rule_should_hit` / `expected_reason_codes`
- `run_status` / `last_run_at` / `last_run_operator` / `last_run_build`
- `pass_rate` / `failure_reason`
- 通用治理字段

#### 4.3.5 `config_release` / `runtime_snapshot`

- `config_release`：
  - `release_id` PK；`tenant_id/workspace_id/app_id/environment_id`
  - `release_no`（发布单号）
  - `release_type`（FULL/INCREMENTAL/ROLLBACK/HOT_FIX）
  - `release_status`（`DRAFT/VALIDATING/APPROVING/APPROVED/DEPLOYING/ACTIVE/FAILED/ROLLED_BACK`）
  - `source_runtime_snapshot_id` / `target_runtime_snapshot_id`
  - `rollout_plan_json`（灰度、分组、时间窗）
  - `approve_channel` / `approval_flow_snapshot`
  - `publish_window_start` / `publish_window_end`
  - `expected_impact_tenant_app_envs`（范围）
  - `execute_lock_owner` / `rollback_trigger_condition`
  - 通用治理字段

- `runtime_snapshot`：
  - `snapshot_id` PK；`tenant_id/app_id/environment_id`
  - `release_id`
  - `snapshot_version`（`BIGINT`）
  - `snapshot_type`（`FULL/DELTA/COMPRESSED`）
  - `content_uri` / `content_size_bytes` / `content_sha256`
  - `schema_version` / `build_id` / `build_image_tag`
  - `snapshot_status`（`DRAFT/PUBLISHED/ACTIVE/DEPRECATED`）
  - `activated_at` / `deactivated_at` / `max_rule_count` / `rule_set_count`
  - `feature_flags_json`
  - `release_note` / `compiled_at`
  - 通用治理字段

**关键索引**：
- `UNIQUE KEY uk_snapshot_version_scope (tenant_id, app_id, environment_id, snapshot_version)`
- `INDEX idx_snapshot_status (tenant_id, snapshot_status, created_at)`

#### 4.3.6 `outbox_event`（策略发布事件写出）

- `outbox_id` PK
- `tenant_id / app_id / environment_id`
- `aggregate_type` / `aggregate_id`
- `event_type`
- `event_payload_json`
- `event_key`（幂等键）
- `topic_hint` / `partition_hint`
- `status`（`READY/PROCESSING/SENT/FAILED/DEAD_LETTER`）
- `send_count` / `max_send_count`
- `next_send_at` / `last_error`
- `created_at / next_attempt_at`
- 通用治理字段

### 4.4 决策域

#### 4.4.1 `event_ingest`

- `event_id` PK（业务事件 ID）
- `tenant_id / workspace_id / app_id / environment_id`
- `source_system`（网关/Kafka/Replay）
- `event_type`（登录/下单/活动等）
- `subject_type` / `subject_id_hash`
- `subject_fingerprint`
- `event_time` / `received_at` / `processed_at`
- `request_id` / `trace_id` / `correlation_id`
- `event_schema_code`
- `payload_ref` / `payload_hash`
- `payload_size_bytes`
- `schema_version`
- `dedupe_key` / `idempotent_window_ms`
- `enriched_subject_fields_json`（经脱敏后的关键字段）
- `validation_status`（`OK/INVALID/DUPLICATE/REJECTED`）
- `validation_errors_json`
- 通用治理字段

**关键索引**：
- `UNIQUE KEY uk_event_scope_eventid (tenant_id, app_id, environment_id, event_id)`
- `INDEX idx_event_time_subject (tenant_id, app_id, event_time)`

#### 4.4.2 `decision_request`

- `decision_request_id` PK / `tenant_id / app_id / environment_id`
- `request_id`（外部幂等键）
- `event_id` / `event_ingest_id`
- `request_type`（SYNC/ASYNC）
- `decision_mode`（SYNC/STREAM）
- `subject_type` / `subject_id_hash`
- `ip_hash / region / device_fingerprint`
- `client_app_version / sdk_version`
- `received_at` / `timeout_deadline_at`
- `idempotency_cache_hit`
- `request_status`（`RECEIVED/VALIDATED/REJECTED/RECALL`）
- `reject_code / reject_reason`
- `response_latency_budget_ms`
- 通用治理字段

**关键索引**：
- `UNIQUE KEY uk_decision_req_idem (tenant_id, app_id, environment_id, request_id)`
- `INDEX idx_decision_req_status (tenant_id, request_status, received_at)`

#### 4.4.3 `decision_fact`

- `decision_id` PK（稳定决策 ID）
- `tenant_id / workspace_id / app_id / environment_id`
- `decision_request_id` / `request_id`
- `event_id`
- `snapshot_id` / `rule_set_id`
- `subject_type` / `subject_id_hash`
- `decision_mode`（SYNC/STREAM/REPLAY）
- `risk_level`（`LOW/MEDIUM/HIGH/CRITICAL`）
- `risk_score`
- `final_action`（`ALLOW/REVIEW/CHALLENGE/BLOCK/FORBID`）
- `decision_status`（`DECIDED/DEGRADED/FAILED/ROLLED_BACK`）
- `decision_reason_codes_json`
- `explain_summary_json`
- `engine_version` / `feature_version`
- `latency_ms` / `queue_wait_ms`
- `is_fallback` / `fallback_reason`
- `processing_node`
- `snapshot_version`
- `result_expire_at`
- `decided_at`（执行最终时刻）
- `created_at` / `updated_at`

**关键索引**：
- `UNIQUE KEY uk_decision_request (tenant_id, app_id, environment_id, request_id)`
- `INDEX idx_decision_scope_time (tenant_id, app_id, environment_id, decided_at)`
- `INDEX idx_decision_subject (tenant_id, subject_type, subject_id_hash, decided_at)`

#### 4.4.4 `decision_rule_hit`

- `decision_rule_hit_id` PK
- `decision_id` / `rule_id` / `rule_version_id` / `rule_set_id`
- `rule_code`
- `is_hit`
- `calc_score`
- `score_weight`
- `action`
- `matched_reason_code`
- `reason_detail_json`
- `evaluation_latency_ms`
- `eval_node`
- `feature_snapshot_json`
- `create_at`

**关键索引**：
- `UNIQUE KEY uk_hit_uni (tenant_id, decision_id, rule_id, rule_version_id)`
- `INDEX idx_hit_decision (tenant_id, decision_id, is_hit)`

#### 4.4.5 `decision_disposition` 与 `decision_output`

- `decision_disposition`：
  - `disposition_id` PK
  - `tenant_id / app_id / environment_id`
  - `decision_id` / `request_id`
  - `source_system`（业务回传来源）
  - `executed_action`（`APPROVED/REJECTED/REVIEWED/TIMEOUT/ERROR`）
  - `execution_status`（`SUCCESS/FAILED/PARTIAL`）
  - `business_result` / `result_amount`
  - `business_order_id` / `merchant_reference`
  - `executed_at`
  - `evidence_json`
  - `disposition_confidence`
  - 通用治理字段

- `decision_output`：
  - `output_id` PK
  - `tenant_id / app_id / environment_id`
  - `decision_id`
  - `delivery_channel`（`REDIS/MYSQL/KAFKA/WEBHOOK`）
  - `payload_ref` / `payload_hash`
  - `delivery_status`（`READY/SENT/RETRY/SUCCESS/FAILED/DLQ`）
  - `attempt_count` / `max_attempt_count`
  - `next_retry_at`
  - `http_code` / `error_code` / `error_message`
  - `consumed_by`（下游消费者）/`consumer_group`
  - 通用治理字段

### 4.5 风险运营域

#### 4.5.1 `alert_rule` / `alert`

- `alert_rule`：
  - `alert_rule_id` PK；`tenant_id / app_id / environment_id`
  - `rule_name` / `scene`
  - `metric_code` / `expr_json` / `window_size_sec`
  - `threshold_type` / `threshold_value` / `operator`
  - `severity`
  - `silence_duration_sec` / `notify_channels_json`
  - `auto_close_rule` / `recover_condition`
  - `status`
  - `owner_team`
  - 通用治理字段

- `alert`：
  - `alert_id` PK；`tenant_id / app_id / environment_id`
  - `alert_rule_id`
  - `source_type`（`DECISION/USAGE/SYSTEM/BILLING`）
  - `source_ref_id`
  - `title` / `description`
  - `severity`
  - `status`（`OPEN/ACKNOWLEDGED/INVESTIGATING/RESOLVED/CLOSED`）
  - `owner_user_id` / `assignee_user_id`
  - `assigned_at` / `acknowledged_at` / `resolved_at`
  - `sla_due_at` / `sla_breached`
  - `incident_id`（可选）
  - 通用治理字段

#### 4.5.2 `incident` / `incident_timeline`

- `incident`：
  - `incident_id` PK；`tenant_id / workspace_id / app_id / environment_id`
  - `incident_type`（`PLATFOMR/DECISION/CONNECTIVITY/SECURITY/BILLING`）
  - `title` / `severity` / `priority`
  - `status`（`OPEN/INVESTIGATING/MITIGATING/WAITING_CUSTOMER/RESOLVED/CLOSED`）
  - `detected_at` / `acknowledged_at` / `resolved_at` / `closed_at`
  - `sla_target_minutes` / `sla_breach_reason`
  - `affected_scope_json`（受影响租户/应用/环境）
  - `business_impact` / `customer_impact`
  - `root_cause` / `current_hypothesis`
  - `mitigation_plan_json` / `postmortem_url`
  - `owner_user_id` / `commander_user_id` / `escalation_level`
  - 通用治理字段

- `incident_timeline`：
  - `timeline_id` PK；`incident_id`
  - `tenant_id`
  - `event_time` / `event_type`
  - `actor_type` / `actor_user_id`
  - `title` / `details_json`
  - `related_resource_type` / `related_resource_id`
  - `evidence_uri`
  - 通用治理字段

#### 4.5.3 `risk_case` / `risk_case_transition` / `manual_feedback`

- `risk_case`：
  - `case_id` PK；`tenant_id / app_id / environment_id`
  - `case_no`（租户内序号）
  - `case_type`（`FRAUD`/`ABUSE`/`ACCOUNT_TAKEOVER`/`MODEL_GAP`）
  - `subject_type` / `subject_id_hash`
  - `status`（`OPEN/ASSIGNED/IN_REVIEW/CLOSED/SUSPENDED`）
  - `priority`
  - `assigned_to / owner_team`
  - `due_at` / `closed_at`
  - `sla_target_hours` / `sla_breach`
  - `decision_count` / `hit_rule_count`
  - `final_decision` / `closing_reason`
  - 通用治理字段

- `risk_case_transition`：
  - `transition_id` PK；`case_id`
  - `from_status` / `to_status`
  - `transition_reason`
  - `operator_user_id`
  - `occurred_at`
  - `sla_after` / `next_due_at`
  - `evidence_json`

- `manual_feedback`：
  - `feedback_id` PK；`tenant_id / app_id / environment_id`
  - `decision_id` / `case_id` / `subject_id_hash`
  - `feedback_type`（`TRUE_POSITIVE/FALSE_POSITIVE/NEEDS_REVIEW/ESCALATE`）
  - `label` / `confidence`
  - `labeler_user_id` / `label_source`
  - `labeled_at`
  - `is_effective` / `supersedes_feedback_id`
  - `evidence_json`

#### 4.5.4 `list_definition` / `list_entry`

- `list_definition`：
  - `list_id` PK
  - `tenant_id / app_id / environment_id`
  - `list_name` / `list_type`（黑名单/白名单/观察名单）
  - `scene`（登录/下单/活动等）
  - `scope_type`（用户/设备/IP/设备指纹/交易）
  - `status`
  - `hash_algo`（sha256/sha1）
  - `default_match_action`
  - `auto_expire_days`
  - `version`
  - 通用治理字段

- `list_entry`：
  - `entry_id` PK
  - `list_id` / `tenant_id / app_id / environment_id`
  - `entry_key_hash` / `entry_key_masked`
  - `source_system`
  - `source_reference`
  - `risk_level_override`
  - `expire_at` / `effective_at`
  - `active`
  - `review_status`
  - `reviewer_user_id` / `reviewed_at`
  - `remark`
  - 通用治理字段

### 4.6 计量与计费域

#### 4.6.1 `plan` / `pricing_metric` / `plan_price_tier`

- `plan`：
  - `plan_id` PK / `plan_code`
  - `plan_name` / `plan_version`
  - `billing_cycle`（`MONTHLY/YEARLY/ANNUAL/TRIAL`）
  - `base_fee` / `currency`
  - `trial_days` / `included_decisions`
  - `included_events`
  - `max_qps_default`
  - `status`
  - `feature_flags_json`
  - 通用治理字段

- `pricing_metric`：
  - `metric_id` PK
  - `metric_code`（`decision_count / event_count / webhook_calls / rule_execution_ms`）
  - `metric_name` / `unit` / `default_unit_price`
  - `metric_scope`（租户/应用/环境）
  - `description`
  - `is_billable`
  - 通用治理字段

- `plan_price_tier`：
  - `plan_price_tier_id` PK
  - `plan_id` / `metric_id`
  - `tier_start` / `tier_end`
  - `unit_price` / `discount_rate`
  - `free_qty`
  - `currency`
  - `effective_from` / `effective_to`
  - 通用治理字段

#### 4.6.2 `tenant_subscription` / `entitlement_snapshot`

- `tenant_subscription`：
  - `subscription_id` PK
  - `tenant_id` / `plan_id`
  - `plan_version`
  - `subscription_status`（`TRIAL/ACTIVE/PAST_DUE/SUSPENDED/CANCELLED/EXPIRED`）
  - `billing_cycle` / `start_at` / `end_at`
  - `auto_renew` / `next_billing_at`
  - `trial_started_at` / `trial_ended_at`
  - `entitlement_snapshot_id`
  - `payment_provider` / `external_customer_id`
  - `cancel_reason` / `cancel_at`
  - `grace_period_end_at`
  - `risk_score_quota`
  - `decision_quota`
  - 通用治理字段

- `entitlement_snapshot`：
  - `snapshot_id` PK
  - `tenant_id` / `subscription_id`
  - `snapshot_period`
  - `snapshot_version`
  - `snapshot_json`（套餐权益、限制、配额）
  - `effective_from` / `effective_to`
  - `created_reason`
  - 通用治理字段

#### 4.6.3 `usage_ledger` / `usage_daily_summary` / `invoice` / `invoice_item`

- `usage_ledger`：
  - `usage_event_id` PK
  - `tenant_id / workspace_id / app_id / environment_id`
  - `billing_period`（`yyyy-mm`）
  - `metric_code`
  - `quantity`
  - `unit`
  - `unit_price`
  - `currency`
  - `price_dimension_json`（region / zone / subject）
  - `subject_type` / `subject_id_hash`
  - `source_type`（`DECISION/INGESTION/WEBHOOK/OUTPUT/ADMIN_ADJUST`）
  - `source_ref_id`
  - `happened_at` / `created_at`
  - `idempotency_key`（去重）
  - `reconciled_flag`
  - `request_id` / `trace_id`
  - 通用治理字段

- `usage_daily_summary`：
  - `summary_id` PK
  - `tenant_id / app_id / environment_id / metric_code`
  - `summary_date`
  - `decision_count` / `event_count` / `raw_event_count`
  - `cost_amount`
  - `currency`
  - `max_latency_ms`
  - `snapshot_version`
  - `period_aggregation_tag`

- `invoice`：
  - `invoice_id` PK
  - `tenant_id` / `subscription_id` / `period_start` / `period_end`
  - `invoice_no`（租户内唯一）
  - `status`（`DRAFT/ISSUED/PAID/OVERDUE/CANCELLED`）
  - `subtotal` / `discount` / `tax` / `total`
  - `currency`
  - `issue_at` / `due_at` / `paid_at`
  - `billing_address_json`
  - `payment_terms` / `invoice_channel`
  - `summary_json`
  - `request_id / trace_id`
  - 通用治理字段

- `invoice_item`：
  - `invoice_item_id` PK
  - `invoice_id`
  - `metric_code` / `description`
  - `quantity` / `unit_price` / `amount`
  - `unit`
  - `tax_rate`
  - `discount`
  - `usage_range_from` / `usage_range_to`
  - `adjustment_reason`
  - 通用治理字段

#### 4.6.4 `billing_adapter_event` / `reconciliation_issue`

- `billing_adapter_event`：
  - `billing_event_id` PK / `tenant_id / invoice_id`
  - `event_type`（`DRAFT_GENERATED/REVIEWED/SETTLED/PAID/REFUND/ADJUSTMENT`）
  - `direction`（`INBOUND/OUTBOUND`）
  - `provider`
  - `provider_tx_id` / `request_id`
  - `payload_json`
  - `status`（`PENDING/SENT/ACK/FAILED/RETRYING`）
  - `retry_count` / `next_retry_at`
  - `version` / `checksum`
  - 通用治理字段

- `reconciliation_issue`：
  - `issue_id` PK
  - `tenant_id / app_id / environment_id`
  - `issue_type`（`USAGE_MISMATCH/COUNTER_DIFF/ADAPTER_ERROR/BILLING_GAP/DECISION_MISSING`）
  - `severity`
  - `scope`
  - `entity_type`
  - `entity_id`
  - `status`（`OPEN/CONFIRMED/WORKING/RESOLVED/CLOSED`）
  - `owner_user_id` / `assignee_team`
  - `detected_at` / `expected_resolve_at` / `resolved_at`
  - `impact_radius_json`
  - `incident_id`（关联）
  - `remediation_plan_json`
  - 通用治理字段

### 4.7 审计、安全与合规域

#### 4.7.1 `audit_log`

- `audit_id` PK
- `tenant_id / workspace_id / app_id / environment_id`
- `actor_user_id` / `actor_type`（`USER/SYSTEM/AUTO`）
- `resource_type` / `resource_id`
- `operation`
- `request_method` / `request_uri` / `http_status`
- `result`（`SUCCESS/FAIL`）
- `result_code` / `result_message`
- `before_snapshot_hash` / `after_snapshot_hash`
- `change_fields_json`
- `ip_hash` / `ua_hash`
- `request_id` / `trace_id`
- `created_at`

#### 4.7.2 `security_event`

- `security_event_id` PK
- `tenant_id` / `app_id`
- `event_type`（`LOGIN_FAIL` / `KEY_ABUSE` / `IP_ANOMALY` / `PERMISSION_ESCALATION`）
- `risk_level`
- `subject_id_hash`
- `source_ip_hash` / `device_fingerprint`
- `policy`
- `action`（`ALERTED/BLOCKED/THROTTLED`）
- `event_payload_json`
- `resolved`
- `resolved_at`
- `resolver`
- 通用治理字段

#### 4.7.3 `auth_session` / `data_export_job`

- `auth_session`：会话上下文（`session_id`、`access_token_hash`、`refresh_token_hash`、`login_ip_hash`、`mfa_verified`、`last_seen_at`、`expires_at`、`is_for_api`、`idle_timeout_at`）。
- `data_export_job`：导出工单（`export_id`、`tenant_id`、`resource_type`、`scope_json`、`export_format`、`status`、`file_uri`、`expired_at`、`requester_user_id`、`checksum`、`rows_count`）。

### 4.8 运维支撑域

#### 4.8.1 `onboarding_task` / `onboarding_step`

- `onboarding_task`：
  - `task_id` PK
  - `tenant_id`
  - `task_type`（`TRIAL_SETUP/PRODUCTION_ONLINE/SECURITY_HARDEN/COMPLIANCE_AUDIT`）
  - `status`（`NEW/IN_PROGRESS/WAIT_REVIEW/BLOCKED/DONE/FAILED`）
  - `owner_user_id` / `reviewer_user_id`
  - `current_step_code` / `failure_reason`
  - `sla_due_at`
  - `completion_percent`
  - `related_support_ticket_id`
  - 通用治理字段

- `onboarding_step`：
  - `step_id` PK
  - `task_id`
  - `step_code` / `step_name`
  - `step_status`
  - `step_executor`
  - `expected_input_json`
  - `actual_output_json`
  - `start_at / done_at / due_at`
  - `retry_count / blocking_reason`
  - 通用治理字段

#### 4.8.2 `support_ticket` / `support_session`

- `support_ticket`：
  - `ticket_id` PK / `tenant_id`
  - `request_channel`（电话/邮件/工单）
  - `priority` / `severity`
  - `status`（`OPEN/IN_PROGRESS/WAITING_CUSTOMER/RESOLVED/CLOSED`）
  - `category`（`接入/规则/稳定性/计费/安全/合同`）
  - `subject` / `description`
  - `related_resource_type`
  - `related_resource_id`
  - `reporter_user_id` / `assignee_user_id`
  - `sla_due_at` / `resolved_at`
  - `incident_id`（可关联）
  - 通用治理字段

- `support_session`：
  - `session_id` PK
  - `ticket_id`
  - `tenant_id`
  - `supporter_user_id`
  - `session_mode`（`READONLY_LIVE` / `INVESTIGATION`）
  - `start_at` / `end_at`
  - `scope_resources_json`
  - `allowed_ips_json`
  - `result`

#### 4.8.3 `notification`

- `notification_id` PK
- `tenant_id / workspace_id / app_id`
- `topic_type`（公告/告警/账号变更）
- `title` / `summary` / `detail`
- `level`
- `target_scope_json`（按角色/标签/单体）
- `published_at` / `expire_at`
- `read_count` / `unread_count`
- `channel` / `ack_required`
- 通用治理字段

### 4.9 异步基础设施域

#### 4.9.1 `inbox_event`

- `inbox_id` PK
- `tenant_id / topic / partition / offset`
- `message_key`
- `event_id` / `event_type`
- `trace_id`
- `consumer_group`
- `status`（`NEW/PROCESSING/CONSUMED/DLQ`）
- `consume_count`
- `next_retry_at`
- `last_error`
- `received_at` / `processed_at`
- 通用治理字段

#### 4.9.2 `background_job`

- `job_id` PK
- `tenant_id`（可选）
- `job_type`（`REPLAY/RECONCILIATION/ARCHIVE/RETENTION`）
- `job_scope_json`
- `execution_mode`（`MANUAL/SCHEDULED/WEBHOOK_TRIGGER`）
- `status`（`QUEUED/RUNNING/SUCCEEDED/FAILED/TERMINATED`）
- `scheduled_at` / `started_at` / `finished_at`
- `timeout_s`
- `progress_percent`
- `affected_rows`
- `error_summary`
- 通用治理字段

## 5. 索引、分区与高可用建议（无 FK 方案）

1. 高并发与范围查询优先级
- 决策、命中、事件、用量、审计、Webhook 投递使用复合索引：
  - `(tenant_id, app_id, environment, occurred_at)`
  - `(tenant_id, request_id)`
  - `(tenant_id, subject_id_hash)`
- 对高频场景建议至少加一个“时间”前置复合索引，并为大表按月进行归档或分区。

2. 重要唯一性约束（无 FK）
- `tenant`：`tenant_code`
- `workspace`：`tenant_id + workspace_code`
- `application`：`tenant_id + workspace_id + app_code`
- `decision_request`：`tenant_id + app_id + environment_id + request_id`
- `decision_fact`：`tenant_id + app_id + environment_id + request_id`
- `usage_ledger`：`tenant_id + idempotency_key`
- `invoice`：`tenant_id + invoice_no`
- `support_ticket`：`tenant_id + external_ticket_no`

3. 数据保留与归档
- 决策明细、规则命中、事件原文建议 30~90 天热数据 + 归档到对象存储；
- 审计与安全日志建议保留 365 天以上（根据合规要求可上调）；
- 告警/事件按 `resolved_at` + `retention_days` 自动清理；
- 对账与计量明细保留 2 年。

## 6. 与现有实现的映射

- `risk_result`（现有）可替换为 `decision_fact` + `decision_rule_hit`。
- `rule_config`（现有）可替换为 `rule_definition + rule_version + rule_test_case`。
- MySQL 现有测试表保留兼容，后续建议逐步迁移到本域模型。

---

> 下一步建议：我会基于本文件同步提交 `sql/riskflow_saas_mysql8_full_schema.sql`（无外键 DDL），并补充“每个高并发表”的分区和性能参数。
