# 9. 当前 API 基线

[返回章节目录](README.md)

## 9.1 规则接口

| 方法 | 路径 | 当前能力 |
|---|---|---|
| GET | `/api/rules` | 分页查询；支持名称、风险等级、动作、启用状态 |
| GET | `/api/rules/enabled` | 获取全部启用规则 |
| GET | `/api/rules/{id}` | 查询规则详情 |
| POST | `/api/rules` | 创建规则 |
| PUT | `/api/rules/{id}` | 更新规则 |
| DELETE | `/api/rules/{id}` | 删除规则 |
| PUT | `/api/rules/{id}/toggle` | 启用或停用 |
| PUT | `/api/rules/batch/enable` | 批量启用 |
| PUT | `/api/rules/batch/disable` | 批量停用 |

## 9.2 风险与统计接口

| 方法 | 路径 | 当前能力 |
|---|---|---|
| GET | `/api/risks` | 按用户、事件类型、等级、动作分页查询 |
| GET | `/api/risks/{id}` | 查询单条记录 |
| GET | `/api/stats/overview` | 今日概览和分布 |
| GET | `/api/stats/trend` | 近 7 日风险趋势 |
| GET | `/api/stats/top-rules` | 今日最终命中规则 Top 10 |

V1.0 接口统一返回结构：`code`、`message`、`data`、`requestId`，并补充参数校验、认证、授权、审计和 OpenAPI 文档。

## 9.3 SaaS 目标 API 分层

| API 域 | 路径示例 | 调用方 | 租户解析方式 |
|---|---|---|---|
| 平台控制面 | `/platform/api/v1/tenants` | 平台运营与运维 | 平台身份令牌，不接受租户角色 |
| 租户控制面 | `/tenant/api/v1/apps` | 租户工作台 | 当前租户访问令牌 |
| 风控业务面 | `/tenant/api/v1/rules`、`/risks` | 租户工作台 | 当前租户访问令牌 + 应用权限 |
| 开放接入面 | `/openapi/v1/events` | 租户业务系统 | API Key/OAuth Client 绑定租户、应用和环境 |
| 在线决策面 | `/openapi/v1/decisions/evaluate` | 租户在线业务 | 接入凭证 + 幂等键 + 场景权限 |
| 处置回传面 | `/openapi/v1/decisions/{id}/disposition` | 租户业务系统 | 接入凭证 + 决策归属校验 |
| 用量查询面 | `/tenant/api/v1/usage` | 租户管理员 | 当前租户访问令牌 |

API 设计约束：

- 租户身份以服务端验证后的令牌或凭证为准。`X-Tenant-Id` 如保留，只能用于与令牌声明交叉校验，不能作为授权依据。
- 用户切换租户后获取新的租户作用域令牌；后端不得让同一令牌通过请求参数访问多个租户。
- 所有创建类开放接口支持 `Idempotency-Key`，幂等记录也必须包含租户和应用作用域。
- 资源 ID 使用全局不可猜测 ID，但全局唯一不能替代租户归属校验。
- 平台 API 与租户 API 使用不同权限前缀、审计类型和限流策略。

---

