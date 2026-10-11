# 架构决策记录（ADR）

[返回技术方案目录](../README.md)

本目录记录影响多个模块、后续迁移成本较高或存在明显方案取舍的技术决策。

## 决策索引

| 编号 | 决策 | 状态 |
|---|---|---|
| 001 | [控制面采用模块化单体](ADR-001-modular-monolith-control-plane.md) | 已接受 |
| 002 | [租户上下文只能由可信边界生成](ADR-002-trusted-tenant-context.md) | 已接受 |
| 003 | [运行时配置采用不可变快照](ADR-003-versioned-runtime-snapshot.md) | 已接受 |
| 004 | [共享 Schema 与资源路由](ADR-004-shared-schema-resource-routing.md) | 已接受 |
| 005 | [在线与流式决策独立运行](ADR-005-separate-online-and-streaming-decision.md) | 已接受 |
| 006 | [计量采用不可变用量账本](ADR-006-immutable-usage-ledger.md) | 已接受 |
| 007 | [SaaS 平台边界与租户生命周期](ADR-007-saas-platform-architecture-and-tenant-lifecycle.md) | 已接受 |
| 008 | [计费外部适配与故障事件管理边界分离](ADR-008-billing-adapter-and-incident-management.md) | 已接受 |
| 009 | [OpenAPI 对外与 Dubbo 内部服务契约分层](ADR-009-openapi-vs-dubbo-contract.md) | 已接受 |

## 命名规则

文件名使用：ADR-编号-简短主题.md，例如：

- ADR-001-tenant-context-propagation.md
- ADR-002-rule-distribution-model.md
- ADR-003-shared-vs-dedicated-runtime.md

## ADR 模板

每个 ADR 包含：

1. 状态：提议、已接受、已废弃或被替代。
2. 背景：问题、约束和触发原因。
3. 决策：最终采用的方案。
4. 备选方案：评估过但未采用的方案。
5. 影响：收益、代价、风险和迁移要求。
6. 验证：如何证明决策有效。
7. 关联：对应 PRD、技术章节、任务和后续 ADR。
