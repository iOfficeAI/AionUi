# 验收报告 — Team Model Switching

## 验收结论：通过（有一项低优先级遗漏）

功能整体实现完整，数据流从 UI 到 MCP 到 Prompt 到 Service 全链路贯通，类型检查和全部测试均通过。发现 1 项低优先级遗漏（agent 恢复路径不保留 model），1 项纯视觉瑕疵。

---

## 验收标准逐条检查

对照 `00-goal.md` 4 条验收标准：

| #   | 验收标准                      | 结论     | 证据                                                                                                                                                                                                           |
| --- | ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 推荐阵容接口/逻辑包含模型推荐 | **通过** | `leadPrompt.ts` L35-38 在 Available Agent Types section 中输出每个 backend 的 models 列表；L86-91 有 Model Selection Guidelines；`TeammateManager.ts` L168-176 从 `acp.cachedModels` 读取模型列表注入到 prompt |
| 2   | agent 定义中包含可用模型枚举  | **通过** | `teamModelUtils.ts` 的 `getTeamAvailableModels` 按 ACP/Gemini/Aionrs 三种路径枚举模型；UI 层 `TeamModelSelect.tsx` 通过此函数加载可用模型并渲染下拉列表                                                        |
| 3   | 模型选择在 UI 上可操作        | **通过** | `TeamCreateModal.tsx` L249-255 渲染 `TeamModelSelect`；`AddAgentModal.tsx` L129-140 渲染 `TeamModelSelect`；两处均有 `selectedModel` state 和 reset 逻辑                                                       |
| 4   | 现有功能无回归                | **通过** | `tsc --noEmit` 零错误；`bun run test` 4166/4166 通过（48 skipped, 22 todo）；`model` 字段为 optional，所有现有代码路径中 `undefined` 走原有默认逻辑                                                            |

---

## 代码完整性检查

### 数据层

| 文件                                | 结论     | 详情                                                            |
| ----------------------------------- | -------- | --------------------------------------------------------------- |
| `src/common/types/teamTypes.ts` L64 | **通过** | `model?: string` 存在于 `TeamAgent` 类型，optional 保证向后兼容 |

### 工具函数

| 文件                                          | 结论     | 详情                                                                                                                                               |
| --------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/common/utils/teamModelUtils.ts` (新文件) | **通过** | 导出 `TeamAvailableModel` 类型、`getTeamAvailableModels`、`getTeamDefaultModelId`；ACP/Gemini/Aionrs 三条路径逻辑正确；null/undefined 安全处理完备 |

### MCP 层

| 文件                                                  | 结论     | 详情                                                                                                                 |
| ----------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/process/team/mcp/team/teamMcpStdio.ts` L165-171  | **通过** | `model: z.string().optional()` 添加到 `team_spawn_agent` Zod schema                                                  |
| `src/process/team/mcp/team/TeamMcpServer.ts` L23      | **通过** | `SpawnAgentFn` 类型签名: `(agentName: string, agentType?: string, model?: string) => Promise<TeamAgent>`             |
| `src/process/team/mcp/team/TeamMcpServer.ts` L329-361 | **通过** | `handleSpawnAgent`: L333 提取 model，L346-354 轻量级 model 校验（warning log 不阻塞），L361 传递 model 到 spawnAgent |
| `src/process/team/mcp/team/TeamMcpServer.ts` L422-431 | **通过** | `handleTeamMembers`: model 存在时追加 `, model: ${a.model}`，不存在时无后缀                                          |
| `src/process/team/TeamSession.ts` L14                 | **通过** | `SpawnAgentFn` 类型签名与 `TeamMcpServer.ts` L23 完全一致                                                            |

### 服务层

| 文件                                              | 结论     | 详情                                                                                          |
| ------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- | --- | ----------------------------------- |
| `src/process/team/TeamSessionService.ts` L749     | **通过** | `spawnAgent` 闭包签名: `async (agentName: string, agentType?: string, model?: string)`        |
| `src/process/team/TeamSessionService.ts` L760     | **通过** | `model` 传入 `addAgent` 的参数对象                                                            |
| `src/process/team/TeamSessionService.ts` L306-308 | **通过** | ACP 路径: `agent.model                                                                        |     | `优先于`resolvePreferredAcpModelId` |
| `src/process/team/TeamSessionService.ts` L311     | **通过** | `model` 变量用 `let` 声明，允许后续覆盖                                                       |
| `src/process/team/TeamSessionService.ts` L317-323 | **通过** | Gemini/Aionrs 路径: 当 `agent.model` 存在且 type 为 gemini/aionrs 时，`model.useModel` 被覆盖 |

### Prompt 层

| 文件                                                     | 结论     | 详情                                                                                       |
| -------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `src/process/team/prompts/leadPrompt.ts` L7              | **通过** | `availableAgentTypes` 类型包含 `models?: string[]`                                         |
| `src/process/team/prompts/leadPrompt.ts` L35-38          | **通过** | 每个 agent type 后面输出 `(models: ...)`                                                   |
| `src/process/team/prompts/leadPrompt.ts` L75             | **通过** | Workflow step 5 包含 "recommended model"                                                   |
| `src/process/team/prompts/leadPrompt.ts` L86-91          | **通过** | `## Model Selection Guidelines` section 完整                                               |
| `src/process/team/prompts/buildRolePrompt.ts` L9         | **通过** | `availableAgentTypes` 类型包含 `models?: string[]`                                         |
| `src/process/team/prompts/toolDescriptions.ts` L10-11,16 | **通过** | 提及 model 参数，提供使用指导                                                              |
| `src/process/team/TeammateManager.ts` L165-176           | **通过** | 读取 `acp.cachedModels`，将 `availableModels` 映射为 `models: string[]` 注入到 lead prompt |

### UI 层

| 文件                                                                              | 结论     | 详情                                                                                                          |
| --------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `src/renderer/pages/team/components/TeamModelSelect.tsx` (新文件)                 | **通过** | 使用 Arco `<Select>`，`allowClear`，`placeholder="(default)"`，loading/cleanup 处理正确                       |
| `src/renderer/pages/team/components/TeamCreateModal.tsx` L52,73-75,118,249-255    | **通过** | `selectedModel` state、agent 切换 reset、传递到 agents.push、条件渲染 `TeamModelSelect`                       |
| `src/renderer/pages/team/components/AddAgentModal.tsx` L14,22,40-42,47,53,129-140 | **通过** | `onConfirm` 类型包含 `model?: string`、state 管理、reset、传递                                                |
| `src/renderer/pages/team/TeamPage.tsx` L34,117,518,531                            | **通过** | `onAddAgent` 类型包含 `model?: string`；L117 显示 `agent.model ?? '(default)'`；L531 `model: data.model` 传递 |

### 测试

| 文件                                         | 结论     | 详情                                                                                                       |
| -------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `tests/unit/teamModelUtils.test.ts` (新文件) | **通过** | 22 个测试用例，覆盖 ACP/Gemini/Aionrs/unknown backends、null/undefined inputs、优先级链、边界场景；无 mock |

---

## 数据流验证

model 字段从 UI 到 MCP 的完整路径：

### 路径 1: UI 创建团队 (TeamCreateModal)

```
TeamCreateModal.tsx (selectedModel state)
  → agents.push({ model: selectedModel }) [L118]
  → ipcBridge.team.create.invoke({ agents }) [L121]
  → ICreateTeamParams.agents (TeamAgent[]) — model 通过类型链自动包含
  → TeamSessionService.createTeam
    → buildConversationParams({ agent }) [L520]
      → agent.model || resolvePreferredAcpModelId [L306-308] (ACP path)
      → model = { ...model, useModel: agent.model } [L317-323] (Gemini/Aionrs path)
  → conversation 创建时携带 model 配置
```

### 路径 2: UI 添加成员 (AddAgentModal)

```
AddAgentModal.tsx (selectedModel state)
  → onConfirm({ model: selectedModel }) [L53]
  → TeamPage.handleAddAgent [L518]
    → addAgent({ model: data.model }) [L531]
  → ipcBridge.team.addAgent.invoke — IAddTeamAgentParams.agent 包含 model
  → TeamSessionService.addAgent → addAgentUnsafe
    → buildConversationParams [L659]
    → newAgent = { ...agent } (model 通过 spread 保留) [L672]
```

### 路径 3: Lead 通过 MCP 工具 spawn agent

```
Lead prompt 包含 Available Agent Types + model 列表
  → Lead 调用 team_spawn_agent(name, agent_type, model)
  → teamMcpStdio.ts Zod schema 验证 model [L165-171]
  → TCP → TeamMcpServer.handleSpawnAgent
    → model 提取 [L333]
    → 轻量级 model 校验 (warning log) [L346-354]
    → spawnAgent(name, agentType, model) [L361]
  → TeamSession.SpawnAgentFn (类型一致) [L14]
  → TeamSessionService.spawnAgent 闭包 [L749]
    → addAgent({ model }) [L760]
    → (同路径 2 的后续流程)
```

### 路径 4: team_members 工具显示 model

```
任意 agent 调用 team_members
  → TeamMcpServer.handleTeamMembers [L422-431]
  → agents.map 输出 `, model: ${a.model}` (存在时)
```

---

## 测试验证

- **tsc --noEmit**: 通过（零错误）
- **bun run test**: 4166/4166 通过（48 skipped, 22 todo），409 test files，0 failures

---

## 遗漏项

### 遗漏 1（低优先级）：`buildRecoveredAgent` 不保留 model

**文件**: `src/process/team/TeamSessionService.ts` L400-424

`buildRecoveredAgent` 方法在从 conversation 恢复 `TeamAgent` 时，构建的对象不包含 `model` 字段（L413-423）。当团队 agents 数组为空触发 `repairTeamAgentsIfMissing` 路径时，恢复的 agent 会丢失 model 信息。

**影响范围**: 仅在极端场景下触发（团队 DB 的 agents 数组被清空，需要从 conversation 反向重建）。正常使用不受影响，因为 agents 数组持久化在 DB 的 JSON 列中，已包含 model 字段。

**修复建议**: 在 `buildRecoveredAgent` 中从 conversation extra 读取 `currentModelId` 并映射到 `model` 字段。但这需要确认 conversation extra 中是否存储了该信息，当前实现中 `currentModelId` 仅在 ACP 路径传入 `buildAgentConversationParams`，不一定回写到 conversation record。因此这是一个 V2 范围内的改进点。

---

## 视觉瑕疵

### 瑕疵 1（cosmetic）：AddAgentModal model label 空渲染

**文件**: `src/renderer/pages/team/components/AddAgentModal.tsx` L129-140

当 `selectedKey` 存在但所选 backend 无可用模型时（`TeamModelSelect` 返回 `null`），"Model" label 仍然渲染但下方无内容。不影响功能。

---

## 建议

1. **V2 优先考虑 runtime model switching**: 目标文档的第 3 条需求是"用户可以查看和切换 team 成员的模型"。V1 只实现了创建时选择，运行时切换已正确标注为 V2 scope。这是正确的 scope 管理。

2. **Gemini/Aionrs 模型在 lead prompt 中缺失**: `TeammateManager.ts` 当前只读取 `acp.cachedModels`，Gemini/Aionrs 模型不会出现在 lead prompt 的 Available Agent Types 列表中。技术方案 Section 5.4 Note 中已明确说明这是 V1 的有意选择。V2 可补充。

3. **AddAgentModal cosmetic fix**: 可将 L129-140 的 model 区域整体由 `TeamModelSelect` 内部控制渲染（或在外部也检查 models.length），避免空 label。
