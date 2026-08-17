# 03. 身份与权限

[返回技术方案目录](README.md)

> 状态：评审稿  
> 设计原则：身份账号、租户成员关系、平台权限三者分离

## 1. 身份模型

~~~mermaid
erDiagram
    USER_ACCOUNT ||--o{ IDENTITY_LINK : has
    USER_ACCOUNT ||--o{ IDENTITY_SESSION : owns
    USER_ACCOUNT ||--o{ TENANT_MEMBERSHIP : joins
    TENANT ||--o{ TENANT_MEMBERSHIP : contains
    TENANT_MEMBERSHIP ||--o{ MEMBERSHIP_ROLE : grants
    ROLE ||--o{ MEMBERSHIP_ROLE : assigned
    ROLE ||--o{ ROLE_PERMISSION : includes
    PERMISSION ||--o{ ROLE_PERMISSION : mapped
    USER_ACCOUNT ||--o{ PLATFORM_ROLE_BINDING : platform_access
~~~

- UserAccount 是全局身份。
- TenantMembership 表示用户属于某租户及其成员状态。
- MembershipRole 绑定租户角色和可选应用/环境范围。
- PlatformRoleBinding 只授予平台权限，与租户角色分开。
- ServiceCredential 表示机器身份，不复用用户令牌。

## 2. 身份提供方案

V1.0 采用标准 OIDC/OAuth2 集成，不把密码学和企业 SSO 协议散落在业务代码中。

- 基础账号：邮箱/手机号验证、密码或验证码登录。
- MFA：TOTP 为基础能力，高危操作可强制重新认证。
- 企业 SSO：OIDC 优先，SAML 通过身份网关适配。
- SCIM：V1.1 支持企业成员自动同步。
- 服务身份：OAuth Client Credentials 或 API Key。
- Kafka：SASL Principal 映射到 ServiceCredential。

业务库保存用户主档、身份源引用、状态和安全元数据；密码哈希应由身份组件负责，禁止业务模块直接处理明文密码。

## 3. 令牌设计

### 3.1 用户 Access Token

建议声明：

~~~json
{
  "sub": "usr_01",
  "session_id": "ses_01",
  "actor_type": "USER",
  "tenant_id": "t_01",
  "membership_id": "mem_01",
  "platform_roles": [],
  "auth_time": 1710000000,
  "amr": ["pwd", "mfa"],
  "jti": "jwt_01",
  "iat": 1710000000,
  "exp": 1710000900
}
~~~

角色和数据范围不全部塞入长期 Token。网关按 membershipId + authorizationVersion 从短 TTL 缓存获取，角色变化后提升 authorizationVersion 并撤销旧会话。

### 3.2 服务令牌

- 绑定 tenantId、appId、environment 和 scopes。
- 不允许调用租户成员、账单等非授权接口。
- Client Secret 只展示一次，服务端保存哈希或 KMS 密文。
- 支持来源 IP、失效时间、轮换窗口和最近使用记录。
- PROD 与非 PROD 凭证完全独立。

## 4. 会话生命周期

| 事件 | Access Token | Refresh Token | 个人/API Token |
|---|---|---|---|
| 普通登出 | 撤销当前会话 | 撤销 | 不影响 |
| 修改密码 | 撤销其他会话 | 全部撤销 | 按策略提醒/撤销 |
| 启用 MFA | 重新认证 | 轮换 | 不影响服务凭证 |
| 成员禁用 | 当前租户上下文失效 | 对应租户失效 | 该成员创建的个人令牌失效 |
| 角色变更 | authorizationVersion 递增 | 可保留 | 权限缓存立即失效 |
| 租户暂停 | 只读/拒绝按状态策略 | 不删除 | 服务凭证拒绝新写入 |
| 账号封禁 | 全部失效 | 全部失效 | 个人令牌失效 |
| 所有权移交 | 强制 MFA 与审计 | 轮换高危会话 | 不自动移交个人令牌 |

## 5. 权限模型

权限编码：

~~~text
{namespace}:{resource}:{action}

tenant:rule:read
tenant:rule:edit
tenant:rule:publish
tenant:risk:export
tenant:credential:rotate
tenant:billing:read
platform:tenant:suspend
platform:plan:publish
platform:support:enter
~~~

### 5.1 权限判定顺序

1. 验证账号、会话和令牌状态。
2. 验证当前租户/平台上下文。
3. 验证 Membership 状态。
4. 验证 Role → Permission。
5. 验证应用、环境和数据范围。
6. 验证资源实际归属。
7. 验证高危操作条件：MFA、审批、双人复核。
8. 写入允许或拒绝审计。

### 5.2 预置租户角色

| 角色 | 典型权限 | 限制 |
|---|---|---|
| OWNER | 企业、成员、订阅、安全、所有应用 | 最后一个 Owner 不可删除 |
| ADMIN | 成员、应用、凭证、工作台配置 | 默认不能移交所有权 |
| RISK_OPERATOR | 规则草稿、测试、风险查看 | 不能审批自己的 PROD 发布 |
| RISK_APPROVER | 发布审批、回滚、全量效果 | 不自动拥有成员管理 |
| ANALYST | 风险、看板、标签、受控导出 | 敏感字段按范围脱敏 |
| REVIEWER | 审核队列与处置结论 | 只见分配案件 |
| DEVELOPER | 文档、凭证、调用日志、Webhook | 不见账单和业务敏感明细 |
| VIEWER | 授权范围只读 | 无导出和 Secret |

## 6. 高危操作

以下操作要求最近完成 MFA、填写原因并写审计；PROD 可配置双人审批：

- 发布/回滚包含 BLOCK、DISABLE、LIMIT 的规则。
- 创建或轮换生产凭证。
- 批量导出风险明细。
- 降级套餐或缩短数据保留。
- 暂停、恢复、注销租户。
- 进入支持会话。
- 修改 SSO、IP 白名单和加密密钥。
- 删除应用、环境或归档数据。

## 7. 授权缓存

- 缓存 Key：userId + tenantId + membershipId + authorizationVersion。
- 默认 TTL 5 分钟，并通过权限变更事件主动失效。
- 缓存不可用时，高危写操作失败关闭；普通只读可按短期本地缓存策略。
- 不缓存资源归属校验结果超过请求生命周期。
- 支持会话和租户状态每次请求强校验或使用极短 TTL。

## 8. 审计字段

每次身份和授权事件至少记录：

- eventId、occurredAt、requestId。
- actorType、actorId、sessionId。
- tenantId、membershipId、supportSessionId。
- resourceType、resourceId、action。
- permission、decision、denyReason。
- beforeHash/afterHash 或脱敏变更摘要。
- sourceIp、userAgent、deviceId。
- authMethods、riskSignals。
- 审计记录签名/哈希链字段。

## 9. 验收

- 用户切换租户后旧租户接口缓存和实时订阅全部失效。
- 角色收回在一分钟内对所有实例生效。
- 租户角色不能获得 platform:* 权限。
- 服务凭证不能访问未绑定的应用或环境。
- 高危操作缺少 MFA/审批时被拒绝并可追踪。
- 支持会话过期、撤销或超范围访问均被拒绝。

