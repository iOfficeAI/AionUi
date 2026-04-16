# 技术方案审查意见 — 评审员 B

## 审查结论：有条件通过

整体方案架构合理、改动可控，数据层向后兼容策略正确。但有几处事实性错误和一个架构遗漏需要修正后方可进入开发。

---

## 准确率验证

### 文件路径

| 方案引用                                                          | 实际情况                              | 结论 |
| ----------------------------------------------------------------- | ------------------------------------- | ---- |
| `src/common/types/teamTypes.ts`                                   | 存在，`TeamAgent` 定义在第 54-64 行   | 正确 |
| `src/common/types/acpTypes.ts`                                    | 存在，`AcpModelInfo` 定义在第 1069 行 | 正确 |
| `src/common/adapter/ipcBridge.ts`                                 | 存在                                  | 正确 |
| `src/process/team/mcp/team/TeamMcpServer.ts`                      | 存在                                  | 正确 |
| `src/process/team/mcp/team/teamMcpStdio.ts`                       | 存在                                  | 正确 |
| `src/process/team/mcp/guide/TeamGuideMcpServer.ts`                | 存在                                  | 正确 |
| `src/process/team/prompts/leadPrompt.ts`                          | 存在                                  | 正确 |
| `src/process/team/prompts/toolDescriptions.ts`                    | 存在                                  | 正确 |
| `src/process/team/prompts/teamGuidePrompt.ts`                     | 存在                                  | 正确 |
| `src/process/team/TeamSessionService.ts`                          | 存在                                  | 正确 |
| `src/process/team/TeamSession.ts`                                 | 存在                                  | 正确 |
| `src/renderer/pages/team/components/TeamCreateModal.tsx`          | 存在                                  | 正确 |
| `src/renderer/pages/team/components/AddAgentModal.tsx`            | 存在                                  | 正确 |
| `src/renderer/utils/model/agentTypes.ts`                          | 存在                                  | 正确 |
| `src/common/config/storage.ts`                                    | 存在                                  | 正确 |
| `src/process/services/database/schema.ts`                         | 存在                                  | 正确 |
| `src/common/utils/teamModelUtils.ts` (新文件)                     | 合理位置                              | OK   |
| `src/renderer/pages/team/components/TeamModelSelect.tsx` (新文件) | 合理位置                              | OK   |

### 行号验证

| 方案引用                                                       | 实际情况                                                 | 结论                  |
| -------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| schema.ts line 87 — `agents TEXT`                              | 实际在第 86 行                                           | 偏差 1 行，不影响理解 |
| ipcBridge.ts line 1276 — `ICreateTeamParams`                   | 实际在第 1276 行                                         | 正确                  |
| ipcBridge.ts line 1289-1310 — `team` 对象                      | 实际 1289-1311                                           | 基本正确              |
| teamMcpStdio.ts line 152-169 — `team_spawn_agent`              | 实际在第 152-169 行                                      | 正确                  |
| TeamMcpServer.ts line 23 — `SpawnAgentFn`                      | 实际在第 23 行                                           | 正确                  |
| TeamMcpServer.ts line 329-364 — `handleSpawnAgent`             | 实际在第 329-364 行                                      | 正确                  |
| TeamMcpServer.ts line 410-416 — `handleTeamMembers`            | 实际在第 410-417 行                                      | 基本正确              |
| TeamSessionService.ts line 740-761 — `spawnAgent` closure      | 实际在第 740-762 行                                      | 基本正确              |
| TeamSessionService.ts line 286-339 — `buildConversationParams` | 实际在第 286-339 行                                      | 正确                  |
| storage.ts lines 66-72 — model config                          | `acp.cachedModels` 在第 68 行，`model.config` 在第 73 行 | 基本正确              |
| leadPrompt.ts line 34-36 — availableTypesSection               | 实际在第 33-36 行                                        | 偏差 1 行             |
| leadPrompt.ts line 72-76 — workflow instructions               | 实际在第 72 行                                           | 正确                  |
| teamGuidePrompt.ts line 52-56 — example table                  | 实际在第 52-53 行                                        | 正确                  |

### 类型名/函数名验证

| 方案引用                                                                                | 实际情况                                                                                                                | 结论                         |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `SpawnAgentFn` 类型签名 `(agentName: string, agentType?: string) => Promise<TeamAgent>` | 实际一致（第 23 行）                                                                                                    | 正确                         |
| `ICreateTeamParams.agents` 类型为 `TeamAgent[]`                                         | 实际为 `import('@process/team/types').TeamAgent[]`，而 `@process/team/types` 是 `@/common/types/teamTypes` 的 re-export | 正确（效果一致）             |
| `IAddTeamAgentParams.agent` 类型为 `Omit<TeamAgent, 'slotId'>`                          | 实际为 `Omit<import('@process/team/types').TeamAgent, 'slotId'>`                                                        | 正确（效果一致）             |
| `AcpModelInfo` interface                                                                | 实际存在（acpTypes.ts 第 1069 行），包含 `currentModelId`, `availableModels`, `canSwitch` 等                            | 正确                         |
| `IProvider` interface                                                                   | 实际存在（storage.ts 第 481 行）                                                                                        | 正确                         |
| `AcpAvailableModel` 有 `id` 和 `name` 字段                                              | 实际有 `id`, `modelId`, `name`，但没有 `label`                                                                          | 见下方问题                   |
| `LeadPromptParams.availableAgentTypes` 类型                                             | 实际为 `Array<{ type: string; name: string }>`，无 `models` 字段                                                        | 与扩展方案一致               |
| mailbox 表有 `files` 列                                                                 | 实际 schema 中**无** `files` 列                                                                                         | 调研报告错误，不影响技术方案 |

### 代码片段验证

| 方案引用                                                        | 实际情况                                                                                     | 结论                             |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| 调研报告中 mailbox 表 schema 含 `files TEXT`                    | 实际 schema.ts 第 95-107 行 mailbox 表无 `files` 列                                          | **调研报告错误**，但不影响本方案 |
| `isTeamCapableBackend` 调用方式                                 | 实际一致                                                                                     | 正确                             |
| `resolvePreferredAcpModelId` 逻辑                               | 实际先查 `acp.config[backend].preferredModelId`，再查 `cachedModels[backend].currentModelId` | 与方案描述一致                   |
| `buildConversationParams` 中 `currentModelId: preferredModelId` | 实际在第 329 行                                                                              | 正确                             |

---

## 肯定的部分

1. **向后兼容策略正确**：`model` 为 optional 字段 + JSON 列自动包含新字段 = 不需要 DB migration，这是最干净的做法。

2. **复用现有基础设施**：方案正确识别了 `acp.cachedModels`、`model.config`、`resolvePreferredAcpModelId` 这些现有机制，没有重复造轮子。model 数据已经存在于 config 系统中，只需要在 team 链路上穿透。

3. **分层改动清晰**：数据层 → MCP 层 → Prompt 层 → UI 层，每层改动独立，blast radius 可控。

4. **三进程隔离遵守良好**：`teamModelUtils.ts` 放在 `src/common/utils/` 可同时被 renderer 和 main process 使用；UI 组件只在 renderer 层；MCP server 只在 main process 层。

5. **降级策略合理**：model 不可用时不做前端校验，交给 ACP 后端自行降级，与 solo chat 行为一致。

6. **`availableAgentTypes` 的数据流完整识别**：正确找到了 `TeammateManager.ts` 第 164-171 行是构建 `availableAgentTypes` 的实际位置（而不是方案 5.4 中说的 `TeamSession.ts`）。

---

## 必须修改的问题

### M1：`availableAgentTypes` 构建位置错误

方案 Section 5.4 写：

> **File**: `src/process/team/TeamSession.ts` (where `buildLeadPrompt` is called)

**实际情况**：`buildLeadPrompt` 不在 `TeamSession.ts` 中调用。调用链是：

```
TeammateManager.ts:174 → buildRolePrompt() → leadPrompt.ts:19 buildLeadPrompt()
```

`availableAgentTypes` 的构建在 `TeammateManager.ts` 第 164-171 行：

```typescript
let availableAgentTypes: Array<{ type: string; name: string }> | undefined;
if (agent.role === 'lead') {
  const cachedInitResults = await ProcessConfig.get('acp.cachedInitializeResult');
  availableAgentTypes = acpDetector
    .getDetectedAgents()
    .filter((a) => isTeamCapableBackend(a.backend, cachedInitResults))
    .map((a) => ({ type: a.backend, name: a.name }));
}
```

**修改要求**：将方案 5.4 的改动位置改为 `src/process/team/TeammateManager.ts`（约第 168-171 行）。需要在这里读取 `acp.cachedModels` 并将 models 数组附加到每个 agent type entry 上。同时需要同步修改 `BuildRolePromptParams`（在 `buildRolePrompt.ts` 第 9 行）中 `availableAgentTypes` 的类型定义。

### M2：`getTeamAvailableModels` 中 `AcpAvailableModel` 字段名不匹配

方案 Section 2.2 的实现代码：

```typescript
return acpModelInfo.availableModels.map((m) => ({
  id: m.id,
  label: m.label || m.id,
}));
```

**实际情况**：`AcpAvailableModel` 类型定义（acpTypes.ts 第 1034-1038 行）为：

```typescript
export interface AcpAvailableModel {
  id?: string;
  modelId?: string; // OpenCode uses modelId instead of id
  name?: string;
}
```

没有 `label` 字段，有 `name` 字段和兼容的 `modelId` 字段。

但 `AcpModelInfo.availableModels` 的类型（第 1075 行）是 `Array<{ id: string; label: string }>`，这是经过 UI 标准化后的格式。所以方案中使用 `m.label` 是正确的，因为它读的是 `AcpModelInfo` 而不是原始的 `AcpAvailableModel`。

**结论**：经进一步验证，这不是错误。`AcpModelInfo.availableModels` 已经是标准化后的 `{ id: string; label: string }[]`。收回此项。

~~**修改要求**~~：无需修改。

### M3（替换 M2）：`SpawnAgentFn` 类型签名需同步修改 `TeamSession.ts`

方案只提到修改 `TeamMcpServer.ts` 中的 `SpawnAgentFn` 类型（第 23 行），但 `TeamSession.ts` 第 14 行有一个**独立的** `SpawnAgentFn` 类型定义：

```typescript
type SpawnAgentFn = (agentName: string, agentType?: string) => Promise<TeamAgent>;
```

两处定义不是共享的，都需要添加 `model?: string` 参数。

**修改要求**：在文件变更列表中补充 `src/process/team/TeamSession.ts` 的修改（修改 `SpawnAgentFn` 类型 + 更新 `TeamMcpServer` 构造参数中 `spawnAgent` 的传递）。

### M4：`buildConversationParams` 中 model override 逻辑描述不精确

方案 Section 4.4 写：

```typescript
const preferredModelId =
  agent.model || // NEW
  (getConversationTypeForBackend(backend) === 'acp' ? await this.resolvePreferredAcpModelId(backend) : undefined);
```

**实际代码**（TeamSessionService.ts 第 306-307 行）：

```typescript
const preferredModelId =
  getConversationTypeForBackend(backend) === 'acp' ? await this.resolvePreferredAcpModelId(backend) : undefined;
```

这行的结果最终传给 `buildAgentConversationParams({ currentModelId: preferredModelId })`，最终写入 `extra.currentModelId`。对于 ACP 后端，`currentModelId` 会被注入到 `session/new` 请求中，这是正确的注入点。

但方案还写了 Gemini/Aionrs 的 override：

```typescript
if (agent.model && type === 'gemini') {
  model = { ...model, useModel: agent.model };
}
```

这里的 `model` 变量实际来自 `this.resolveConversationModel()`（第 310-314 行），类型是 `TProviderWithModel`。直接 spread override `useModel` 在技术上可行，但应该发生在 `resolveConversationModel` 返回之后、`buildAgentConversationParams` 调用之前（第 310-316 行之间）。

**修改要求**：明确 model override 的插入位置在第 314-316 行之间，且需同时处理 ACP（通过 `currentModelId` 参数）和 Gemini/Aionrs（通过修改 `model.useModel`）两条路径。当前描述的代码片段位置模糊。

---

## 建议修改的问题

### S1：新工具函数 `getTeamAvailableModels` 的 Gemini model 取值逻辑

方案 Section 2.2 对 Gemini 的处理：

```typescript
if (backend === 'gemini') {
  const geminiProviders = (providers || []).filter(
    (p) => p.enabled !== false && (p.platform === 'gemini' || p.platform === 'gemini-with-google-auth')
  );
  return geminiProviders.flatMap((p) => p.model.filter(...).map(...));
}
```

`IProvider.model` 是 `string[]`（存的是 model ID 列表如 `['gemini-2.5-pro', 'gemini-2.0-flash']`），所以 `map((m) => ({ id: m, label: m }))` 的 label 就是原始的 model ID 字符串。这在 UI 上不够友好（用户看到的是 `gemini-2.5-pro` 而不是 `Gemini 2.5 Pro`）。

**建议**：考虑后续版本添加 model display name 映射，V1 用 ID 作为 label 可以接受。

### S2：`getTeamAvailableModels` 中 Aionrs 处理过于宽泛

```typescript
if (backend === 'aionrs') {
  const provider = (providers || []).find((p) => p.enabled !== false && p.model?.length);
  ...
}
```

取第一个 enabled provider 而不是特定的 Aionrs provider。如果用户配置了多个 provider（比如一个 OpenAI 一个 Aionrs），可能取到错误的 provider。

**建议**：过滤时增加 platform 判断，或者直接使用 `resolveDefaultAionrsModel` 的逻辑（虽然那个也是取第一个 provider）。当前与 `resolveDefaultAionrsModel` 行为一致，所以 V1 可以接受，但应留 TODO。

### S3：`TeamModelSelect` 组件需要处理 loading 状态

`ConfigStorage.get('acp.cachedModels')` 是异步操作。在数据还没返回时，model dropdown 不应该显示空白或闪烁。

**建议**：在 `TeamModelSelect` 组件中添加 loading 状态处理。

### S4：UI 层应考虑已有 team 的模型展示

方案 Section 6.4 只简单提了一句"show the model alongside the agent type"。实际上在 Team 页面的 member list（可能在 `TeamTabs.tsx` 或 `TeamChatView.tsx`）展示 model 时，需要处理旧团队 `model` 为 `undefined` 的情况——是显示 "Default" 还是留空。

**建议**：统一约定 `model === undefined` 时 UI 显示 `(default)`。

### S5：Prompt 中的 model 推荐可能导致 Agent 选错 model

Lead prompt 中加入 model list 后，Agent 可能推荐不存在的 model（大模型幻觉）。特别是当 `cachedModels` 为空时，prompt 里没有 model 列表，但 Agent 仍可能在 `team_spawn_agent` 中传入幻觉 model ID。

**建议**：在 `handleSpawnAgent` 中做轻量级 model 校验（类似 `agentType` 的校验），如果 model 明显不属于该 backend 的 availableModels，打 warning log 但不阻塞（让后端自行降级）。

---

## 遗漏项

### O1：`buildRolePrompt.ts` 的类型定义需要同步更新

`BuildRolePromptParams`（`buildRolePrompt.ts` 第 9 行）中 `availableAgentTypes` 的类型是 `Array<{ type: string; name: string }>`，需要同步改为 `Array<{ type: string; name: string; models?: string[] }>`。方案只提到了 `LeadPromptParams` 的改动，漏掉了这个中间类型。

**文件**：`src/process/team/prompts/buildRolePrompt.ts`

### O2：`TeammateManager.ts` 未在文件变更列表中

`TeammateManager.ts` 是实际构建 `availableAgentTypes` 的地方（第 164-171 行），也是读取 `cachedModels` 并注入 model 列表的地方。方案的文件变更列表（Section 9）完全没有提到这个文件。

**文件**：`src/process/team/TeammateManager.ts`

### O3：`TeamSession.ts` 中 `SpawnAgentFn` 类型未在文件变更列表中

同 M3，方案遗漏了 `TeamSession.ts` 第 14 行的 `SpawnAgentFn` 类型定义。

### O4：用户中途切换已有 team member 的 model 未覆盖

目标文档需求 3 写："用户可以查看和切换 team 成员的模型"。方案只覆盖了**创建时**选择 model（TeamCreateModal、AddAgentModal、team_spawn_agent），但没有覆盖**运行中**切换 model 的场景。

如果要支持运行中切换：

- 需要新增 IPC 接口（如 `team.setAgentModel`）
- 需要更新 DB 中的 agents JSON
- 需要重建对应 conversation 的 agent task（让新 model 在下一次 wake 时生效）

**建议**：如果 V1 只做创建时选择，需在目标文档中明确标注需求 3 的范围为"创建时选择"。如果要做运行中切换，需要补充这部分设计。

### O5：`ICreateTeamParams` 和 `IAddTeamAgentParams` 实际导入路径

方案 Section 3.1 说 `ICreateTeamParams.agents` 类型是 `TeamAgent[]`，自动包含 `model`。这是正确的，但需要注意：`ipcBridge.ts` 中的导入是 `import('@process/team/types').TeamAgent`，而 `@process/team/types` re-export 自 `@/common/types/teamTypes`。修改 `@/common/types/teamTypes.ts` 中的 `TeamAgent` 类型后，两边都会自动生效。方案没有错，但应明确说明这个 re-export 关系以避免实现时困惑。

### O6：`teamGuidePrompt.ts` 中的 model 列——现阶段不需要

方案 Section 5.3 建议在 team guide prompt 的 example table 中加 Model 列。但 `aion_create_team` 创建的 team 只有一个 leader，且 leader 的 model 由 solo agent 自身配置决定。在 solo → team 转换场景中，model 选择发生在后续 lead 调用 `team_spawn_agent` 时。因此在 guide prompt 中加 Model 列反而可能误导用户以为创建 team 时需要指定每个成员的 model。

**建议**：V1 阶段不修改 `teamGuidePrompt.ts`，保持 guide prompt 简洁。Model 选择的引导全部在 lead prompt 中完成。
