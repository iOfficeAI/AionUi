# ACP 重构 — 技术文档

AionUi ACP 层全面重构的设计文档，供实现阶段的开发者和新加入团队的成员参考。

## 文档导航

| #   | 文档                                           | 内容                                                        | 建议阅读顺序   |
| :-- | :--------------------------------------------- | :---------------------------------------------------------- | :------------- |
| 1   | [当前问题分析](01-current-problems.md)         | 现有 ACP 实现的 6 大架构问题，为什么需要重构                | 先读，理解动机 |
| 2   | [参考实现分析](02-reference-implementation.md) | acpx (OpenClaw) 架构分析，可借鉴的设计模式                  | 了解参考系     |
| 3   | [架构设计](03-architecture-design.md)          | 三层架构、7 态状态机、26 个文件、23 条不变量、20 项共识决议 | 核心，通读     |
| 4   | [类型目录与不变量](04-type-catalog.md)         | 45 个 TypeScript 类型定义 + 23 条编号不变量                 | 实现时查阅     |
| 5   | [测试计划](05-test-plan.md)                    | 4 层测试模型 (T1-T4)、130+ 用例、回归策略                   | 写测试前读     |
| 6   | [场景走查](06-scenario-walkthrough.md)         | 10 个端到端场景，含时序图和异常路径                         | 理解运行时行为 |

## 迁移状态

### Phase 1: Feature Flag 切换（当前）

新 ACP 模块通过 `AcpAgentV2` 兼容适配器接入。新旧代码路径共存。

**启用新路径：**

```bash
AION_ACP_V2=1 bun run start
```

**回滚到旧路径：**

```bash
# 不设置环境变量即使用旧路径（默认）
bun run start
```

**相关文件：**

- `src/process/acp/compat/` — 适配器层（新增）
- `src/process/task/AcpAgentManager.ts` — `initAgent()` 中的 feature flag 分支
- `src/process/agent/acp/` — 旧模块（未修改，仍为默认路径）
- `src/process/acp/` — 新模块（仅 flag 开启时使用）

**详细计划：** `docs/superpowers/plans/2026-04-15-acp-integration-phases.md`

## 快速入口

- **我是新人，想快速了解项目** → 读 Doc 1 → Doc 3 (Section 1-2)
- **我要开始写代码** → Doc 3 (完整) → Doc 4 (查类型) → Doc 6 (查流程)
- **我要写测试** → Doc 5 → Doc 4 Part 2 (不变量) → Doc 6 (场景)
- **我想理解某个具体流程** → Doc 6 对应场景
