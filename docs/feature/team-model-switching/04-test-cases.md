# 测试用例 — Team Model Switching

## 单元测试

### UT-1: getTeamAvailableModels — ACP backend 有 cachedModels 时返回标准化模型列表

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `cachedModels['claude']` 包含 `availableModels: [{ id: 'claude-sonnet-4', label: 'Claude Sonnet 4' }, { id: 'claude-haiku-3.5', label: 'Claude Haiku 3.5' }]`
  - `providers` 为空数组
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('claude', cachedModels, [])`
- **预期结果**：
  - 返回 `[{ id: 'claude-sonnet-4', label: 'Claude Sonnet 4' }, { id: 'claude-haiku-3.5', label: 'Claude Haiku 3.5' }]`

---

### UT-2: getTeamAvailableModels — ACP backend 模型 label 为空时回退到 id

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `cachedModels['codex']` 包含 `availableModels: [{ id: 'codex-mini', label: '' }]`
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('codex', cachedModels, [])`
- **预期结果**：
  - 返回 `[{ id: 'codex-mini', label: 'codex-mini' }]`（label 为空字符串时回退到 id）

---

### UT-3: getTeamAvailableModels — ACP backend cachedModels 的 availableModels 为空数组时返回空

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `cachedModels['claude']` 包含 `availableModels: []`
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('claude', cachedModels, [])`
- **预期结果**：
  - 返回 `[]`

---

### UT-4: getTeamAvailableModels — cachedModels 为 null 时返回空数组

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：无
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('claude', null, [])`
- **预期结果**：
  - 返回 `[]`

---

### UT-5: getTeamAvailableModels — cachedModels 为 undefined 时返回空数组

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：无
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('claude', undefined, [])`
- **预期结果**：
  - 返回 `[]`

---

### UT-6: getTeamAvailableModels — Gemini backend 从 providers 中正确过滤模型

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `providers` 包含一个 Gemini provider：`{ platform: 'gemini', enabled: true, model: ['gemini-2.5-pro', 'gemini-2.0-flash'], modelEnabled: { 'gemini-2.5-pro': true, 'gemini-2.0-flash': true } }`
  - `cachedModels` 为 `{}`（无 ACP 数据）
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('gemini', {}, providers)`
- **预期结果**：
  - 返回 `[{ id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }, { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash' }]`

---

### UT-7: getTeamAvailableModels — Gemini backend 识别 gemini-with-google-auth platform

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `providers` 包含 `{ platform: 'gemini-with-google-auth', enabled: true, model: ['gemini-2.5-pro'] }`
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('gemini', {}, providers)`
- **预期结果**：
  - 返回 `[{ id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }]`

---

### UT-8: getTeamAvailableModels — Gemini backend 排除 enabled === false 的 provider

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `providers` 包含两个：
    - `{ platform: 'gemini', enabled: false, model: ['gemini-2.5-pro'] }`（禁用）
    - `{ platform: 'gemini', enabled: true, model: ['gemini-2.0-flash'] }`（启用）
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('gemini', {}, providers)`
- **预期结果**：
  - 返回 `[{ id: 'gemini-2.0-flash', label: 'gemini-2.0-flash' }]`
  - 不包含 `gemini-2.5-pro`

---

### UT-9: getTeamAvailableModels — Gemini backend 排除 modelEnabled[m] === false 的模型

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `providers` 包含 `{ platform: 'gemini', enabled: true, model: ['gemini-2.5-pro', 'gemini-2.0-flash'], modelEnabled: { 'gemini-2.5-pro': true, 'gemini-2.0-flash': false } }`
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('gemini', {}, providers)`
- **预期结果**：
  - 返回 `[{ id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }]`
  - 不包含被禁用的 `gemini-2.0-flash`

---

### UT-10: getTeamAvailableModels — Aionrs backend 取第一个 enabled provider 的模型

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `providers` 包含两个：
    - `{ platform: 'openai-compatible', enabled: true, model: ['gpt-4o', 'gpt-4o-mini'] }`
    - `{ platform: 'openai-compatible', enabled: true, model: ['another-model'] }`
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('aionrs', {}, providers)`
- **预期结果**：
  - 返回 `[{ id: 'gpt-4o', label: 'gpt-4o' }, { id: 'gpt-4o-mini', label: 'gpt-4o-mini' }]`
  - 只取第一个 enabled provider

---

### UT-11: getTeamAvailableModels — Aionrs backend 无 enabled provider 时返回空数组

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `providers` 包含 `{ platform: 'openai-compatible', enabled: false, model: ['gpt-4o'] }`
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('aionrs', {}, providers)`
- **预期结果**：
  - 返回 `[]`

---

### UT-12: getTeamAvailableModels — Aionrs backend 排除 modelEnabled === false 的模型

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `providers` 包含 `{ enabled: true, model: ['gpt-4o', 'gpt-4o-mini'], modelEnabled: { 'gpt-4o': true, 'gpt-4o-mini': false } }`
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('aionrs', {}, providers)`
- **预期结果**：
  - 返回 `[{ id: 'gpt-4o', label: 'gpt-4o' }]`

---

### UT-13: getTeamAvailableModels — 未知 backend 返回空数组

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `cachedModels` 为 `{}`，`providers` 为 `[]`
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('custom', {}, [])`
- **预期结果**：
  - 返回 `[]`

---

### UT-14: getTeamAvailableModels — providers 为 null 时 Gemini 返回空数组

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：无
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('gemini', {}, null)`
- **预期结果**：
  - 返回 `[]`

---

### UT-15: getTeamAvailableModels — providers 为 undefined 时 Aionrs 返回空数组

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamAvailableModels`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：无
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('aionrs', {}, undefined)`
- **预期结果**：
  - 返回 `[]`

---

### UT-16: getTeamDefaultModelId — 优先返回 acpConfig 的 preferredModelId

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamDefaultModelId`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `acpConfig = { claude: { preferredModelId: 'claude-sonnet-4' } }`
  - `cachedModels = { claude: { currentModelId: 'claude-haiku-3.5', availableModels: [] } }`
- **测试步骤**：
  1. 调用 `getTeamDefaultModelId('claude', cachedModels, acpConfig)`
- **预期结果**：
  - 返回 `'claude-sonnet-4'`（优先使用 preferredModelId）

---

### UT-17: getTeamDefaultModelId — preferredModelId 为空时回退到 currentModelId

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamDefaultModelId`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `acpConfig = { claude: {} }`（无 preferredModelId）
  - `cachedModels = { claude: { currentModelId: 'claude-haiku-3.5', availableModels: [] } }`
- **测试步骤**：
  1. 调用 `getTeamDefaultModelId('claude', cachedModels, acpConfig)`
- **预期结果**：
  - 返回 `'claude-haiku-3.5'`

---

### UT-18: getTeamDefaultModelId — 两者都为空时返回 undefined

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamDefaultModelId`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `acpConfig = { claude: {} }`
  - `cachedModels = { claude: { availableModels: [] } }`（无 currentModelId）
- **测试步骤**：
  1. 调用 `getTeamDefaultModelId('claude', cachedModels, acpConfig)`
- **预期结果**：
  - 返回 `undefined`

---

### UT-19: getTeamDefaultModelId — cachedModels 为 null 且 acpConfig 为 null 时返回 undefined

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamDefaultModelId`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：无
- **测试步骤**：
  1. 调用 `getTeamDefaultModelId('claude', null, null)`
- **预期结果**：
  - 返回 `undefined`

---

### UT-20: getTeamDefaultModelId — 查询不存在的 backend 时返回 undefined

- **对应 Task**：Task 8 / Task 2
- **测试对象**：`getTeamDefaultModelId`
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `acpConfig = { claude: { preferredModelId: 'claude-sonnet-4' } }`
  - `cachedModels = { claude: { currentModelId: 'claude-haiku-3.5', availableModels: [] } }`
- **测试步骤**：
  1. 调用 `getTeamDefaultModelId('unknown-backend', cachedModels, acpConfig)`
- **预期结果**：
  - 返回 `undefined`（该 backend 不在 config 中）

---

### UT-21: TeamAgent 类型 — model 字段可选，向后兼容

- **对应 Task**：Task 1
- **测试对象**：`TeamAgent` 类型序列化/反序列化
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：无
- **测试步骤**：
  1. 构造一个不含 `model` 字段的 `TeamAgent` 对象并 `JSON.stringify`
  2. `JSON.parse` 还原后断言 `model` 为 `undefined`
  3. 构造一个含 `model: 'claude-sonnet-4'` 的 `TeamAgent` 对象并 `JSON.stringify`
  4. `JSON.parse` 还原后断言 `model` 为 `'claude-sonnet-4'`
- **预期结果**：
  - 不含 model 的旧数据反序列化后 `model === undefined`
  - 含 model 的新数据反序列化后 `model === 'claude-sonnet-4'`

---

### UT-22: handleTeamMembers — 有 model 时输出包含 model 信息

- **对应 Task**：Task 3
- **测试对象**：`TeamMcpServer.handleTeamMembers`
- **测试文件**：`tests/unit/team-TeamMcpServer.test.ts`（扩展已有文件）
- **前置条件**：
  - `getAgents()` 返回一个含 `model: 'claude-sonnet-4'` 的 agent
- **测试步骤**：
  1. 通过 TCP 调用 `team_members` 工具
- **预期结果**：
  - 返回字符串包含 `model: claude-sonnet-4`

---

### UT-23: handleTeamMembers — 无 model 时输出不包含 model 字段

- **对应 Task**：Task 3
- **测试对象**：`TeamMcpServer.handleTeamMembers`
- **测试文件**：`tests/unit/team-TeamMcpServer.test.ts`
- **前置条件**：
  - `getAgents()` 返回一个不含 `model` 字段的 agent
- **测试步骤**：
  1. 通过 TCP 调用 `team_members` 工具
- **预期结果**：
  - 返回字符串不包含 `, model:`

---

### UT-24: handleSpawnAgent — model 参数正确传递给 spawnAgent 回调

- **对应 Task**：Task 3
- **测试对象**：`TeamMcpServer.handleSpawnAgent`
- **测试文件**：`tests/unit/team-TeamMcpServer.test.ts`
- **前置条件**：
  - mock `spawnAgent` 回调，记录入参
- **测试步骤**：
  1. 通过 TCP 调用 `team_spawn_agent`，传入 `{ name: 'Researcher', agent_type: 'claude', model: 'claude-sonnet-4' }`
- **预期结果**：
  - `spawnAgent` 被调用，参数为 `('Researcher', 'claude', 'claude-sonnet-4')`

---

### UT-25: handleSpawnAgent — model 为空时传递 undefined 给 spawnAgent 回调

- **对应 Task**：Task 3
- **测试对象**：`TeamMcpServer.handleSpawnAgent`
- **测试文件**：`tests/unit/team-TeamMcpServer.test.ts`
- **前置条件**：
  - mock `spawnAgent` 回调
- **测试步骤**：
  1. 通过 TCP 调用 `team_spawn_agent`，传入 `{ name: 'Worker', agent_type: 'claude' }`（无 model 参数）
- **预期结果**：
  - `spawnAgent` 被调用，第三个参数为 `undefined`

---

### UT-26: handleSpawnAgent — model 不在可用列表中时发出 warning 但不阻塞

- **对应 Task**：Task 3
- **测试对象**：`TeamMcpServer.handleSpawnAgent`（S5 轻量校验）
- **测试文件**：`tests/unit/team-TeamMcpServer.test.ts`
- **前置条件**：
  - `ProcessConfig.get('acp.cachedModels')` 返回 `{ claude: { availableModels: [{ id: 'claude-sonnet-4' }] } }`
  - mock `console.warn`
- **测试步骤**：
  1. 调用 `team_spawn_agent`，传入 `{ name: 'Agent', agent_type: 'claude', model: 'hallucinated-model' }`
- **预期结果**：
  - `console.warn` 被调用，包含 `hallucinated-model` 和 `not in available models`
  - `spawnAgent` 仍然被调用（不阻塞）

---

### UT-27: buildLeadPrompt — availableAgentTypes 包含 models 列表时输出模型信息

- **对应 Task**：Task 4
- **测试对象**：`buildLeadPrompt`
- **测试文件**：`tests/unit/process/team/teammatePrompt.test.ts`（扩展已有文件）
- **前置条件**：
  - `availableAgentTypes` 包含 `[{ type: 'claude', name: 'Claude', models: ['claude-sonnet-4', 'claude-haiku-3.5'] }]`
- **测试步骤**：
  1. 调用 `buildLeadPrompt({ teammates: [], availableAgentTypes })`
- **预期结果**：
  - 返回的 prompt 字符串包含 `(models: claude-sonnet-4, claude-haiku-3.5)`
  - 包含 `## Model Selection Guidelines`

---

### UT-28: buildLeadPrompt — availableAgentTypes 的 models 为空数组时不显示模型括号

- **对应 Task**：Task 4
- **测试对象**：`buildLeadPrompt`
- **测试文件**：`tests/unit/process/team/teammatePrompt.test.ts`
- **前置条件**：
  - `availableAgentTypes` 包含 `[{ type: 'gemini', name: 'Gemini', models: [] }]`
- **测试步骤**：
  1. 调用 `buildLeadPrompt({ teammates: [], availableAgentTypes })`
- **预期结果**：
  - 返回的 prompt 中 gemini 行不包含 `(models:` 字串

---

### UT-29: buildLeadPrompt — availableAgentTypes 无 models 字段时不显示模型括号

- **对应 Task**：Task 4
- **测试对象**：`buildLeadPrompt`
- **测试文件**：`tests/unit/process/team/teammatePrompt.test.ts`
- **前置条件**：
  - `availableAgentTypes` 包含 `[{ type: 'codex', name: 'Codex' }]`（无 models 字段）
- **测试步骤**：
  1. 调用 `buildLeadPrompt({ teammates: [], availableAgentTypes })`
- **预期结果**：
  - 返回的 prompt 中 codex 行不包含 `(models:` 字串

---

### UT-30: TEAM_SPAWN_AGENT_DESCRIPTION — 包含 model 相关描述

- **对应 Task**：Task 4
- **测试对象**：`TEAM_SPAWN_AGENT_DESCRIPTION` 常量
- **测试文件**：`tests/unit/process/team/teamMcpToolDescriptions.test.ts`（扩展已有文件）
- **前置条件**：无
- **测试步骤**：
  1. 导入 `TEAM_SPAWN_AGENT_DESCRIPTION`
  2. 断言字符串内容
- **预期结果**：
  - 包含 `model` 关键字
  - 包含 `recommended model`

---

## 集成测试

### IT-1: team_spawn_agent MCP 工具 — model 参数端到端穿透

- **对应 Task**：Task 3 + Task 5
- **测试对象**：`team_spawn_agent` 从 MCP schema → handleSpawnAgent → spawnAgent 闭包 → addAgent
- **测试范围**：`teamMcpStdio.ts`、`TeamMcpServer.ts`、`TeamSessionService.ts`
- **测试文件**：`tests/integration/team-mcp-server.test.ts`（扩展已有文件）
- **测试步骤**：
  1. 启动 TeamMcpServer，绑定 TCP 端口
  2. 创建 TCP 客户端连接
  3. 发送 `team_spawn_agent` 请求：`{ name: 'Coder', agent_type: 'claude', model: 'claude-sonnet-4' }`
  4. 验证 `spawnAgent` 回调接收到的参数
- **预期结果**：
  - `spawnAgent` 被调用，第三个参数为 `'claude-sonnet-4'`
  - 返回的 agent 对象中 `model === 'claude-sonnet-4'`

---

### IT-2: team_spawn_agent MCP 工具 — 不传 model 时使用默认值

- **对应 Task**：Task 3 + Task 5
- **测试对象**：`team_spawn_agent` 无 model 参数的降级行为
- **测试范围**：`teamMcpStdio.ts`、`TeamMcpServer.ts`、`TeamSessionService.ts`
- **测试文件**：`tests/integration/team-mcp-server.test.ts`
- **测试步骤**：
  1. 启动 TeamMcpServer
  2. 发送 `team_spawn_agent` 请求：`{ name: 'Helper', agent_type: 'claude' }`（无 model）
  3. 验证 `spawnAgent` 回调的参数
- **预期结果**：
  - `spawnAgent` 被调用，第三个参数为 `undefined`

---

### IT-3: buildConversationParams — ACP 路径 agent.model 覆盖 preferredModelId

- **对应 Task**：Task 5
- **测试对象**：`TeamSessionService.buildConversationParams` ACP 路径
- **测试范围**：`TeamSessionService.ts`
- **测试文件**：`tests/unit/process/teamSessionService.test.ts`（扩展已有文件）
- **测试步骤**：
  1. 构造一个 `TeamAgent`，`agentType: 'claude'`，`model: 'claude-haiku-3.5'`
  2. 设置 `resolvePreferredAcpModelId` 返回 `'claude-sonnet-4'`（用户偏好的默认模型）
  3. 调用 `buildConversationParams`
- **预期结果**：
  - 返回的 params 中 `currentModelId === 'claude-haiku-3.5'`（agent.model 优先于 preferredModelId）

---

### IT-4: buildConversationParams — ACP 路径 agent.model 为 undefined 时回退到 preferredModelId

- **对应 Task**：Task 5
- **测试对象**：`TeamSessionService.buildConversationParams` ACP 路径向后兼容
- **测试范围**：`TeamSessionService.ts`
- **测试文件**：`tests/unit/process/teamSessionService.test.ts`
- **测试步骤**：
  1. 构造一个 `TeamAgent`，`agentType: 'claude'`，`model: undefined`
  2. 设置 `resolvePreferredAcpModelId` 返回 `'claude-sonnet-4'`
  3. 调用 `buildConversationParams`
- **预期结果**：
  - 返回的 params 中 `currentModelId === 'claude-sonnet-4'`（回退到 preferredModelId）

---

### IT-5: buildConversationParams — Gemini 路径 agent.model 覆盖 useModel

- **对应 Task**：Task 5
- **测试对象**：`TeamSessionService.buildConversationParams` Gemini 路径
- **测试范围**：`TeamSessionService.ts`
- **测试文件**：`tests/unit/process/teamSessionService.test.ts`
- **测试步骤**：
  1. 构造一个 `TeamAgent`，`agentType: 'gemini'`，`model: 'gemini-2.0-flash'`
  2. 设置 `resolveConversationModel` 返回 `{ useModel: 'gemini-2.5-pro', ... }`
  3. 调用 `buildConversationParams`
- **预期结果**：
  - 返回的 params 中 `model.useModel === 'gemini-2.0-flash'`（agent.model 覆盖了 resolveConversationModel 的结果）

---

### IT-6: buildConversationParams — Aionrs 路径 agent.model 覆盖 useModel

- **对应 Task**：Task 5
- **测试对象**：`TeamSessionService.buildConversationParams` Aionrs 路径
- **测试范围**：`TeamSessionService.ts`
- **测试文件**：`tests/unit/process/teamSessionService.test.ts`
- **测试步骤**：
  1. 构造一个 `TeamAgent`，`agentType: 'aionrs'`，`model: 'gpt-4o-mini'`
  2. 设置 `resolveConversationModel` 返回 `{ useModel: 'gpt-4o', ... }`
  3. 调用 `buildConversationParams`
- **预期结果**：
  - 返回的 params 中 `model.useModel === 'gpt-4o-mini'`

---

### IT-7: buildConversationParams — Gemini 路径 agent.model 为 undefined 时不覆盖

- **对应 Task**：Task 5
- **测试对象**：`TeamSessionService.buildConversationParams` Gemini 向后兼容
- **测试范围**：`TeamSessionService.ts`
- **测试文件**：`tests/unit/process/teamSessionService.test.ts`
- **测试步骤**：
  1. 构造一个 `TeamAgent`，`agentType: 'gemini'`，`model: undefined`
  2. 设置 `resolveConversationModel` 返回 `{ useModel: 'gemini-2.5-pro', ... }`
  3. 调用 `buildConversationParams`
- **预期结果**：
  - 返回的 params 中 `model.useModel === 'gemini-2.5-pro'`（保持原有行为）

---

### IT-8: TeammateManager — lead prompt 中包含各 backend 的可用模型列表

- **对应 Task**：Task 4
- **测试对象**：`TeammateManager` 构建 lead 的 `availableAgentTypes` 时附带模型
- **测试范围**：`TeammateManager.ts`、`leadPrompt.ts`
- **测试文件**：`tests/unit/team-TeammateManager.test.ts`（扩展已有文件）
- **测试步骤**：
  1. mock `ProcessConfig.get('acp.cachedModels')` 返回 `{ claude: { availableModels: [{ id: 'claude-sonnet-4' }, { id: 'claude-haiku-3.5' }] } }`
  2. mock `acpDetector.getDetectedAgents()` 返回 `[{ backend: 'claude', name: 'Claude' }]`
  3. 触发 lead agent 的 prompt 构建
- **预期结果**：
  - 构建的 `availableAgentTypes` 中 claude 条目包含 `models: ['claude-sonnet-4', 'claude-haiku-3.5']`

---

### IT-9: TeammateManager — cachedModels 为空时 models 为空数组

- **对应 Task**：Task 4
- **测试对象**：`TeammateManager` 构建 lead 的 `availableAgentTypes` 降级行为
- **测试范围**：`TeammateManager.ts`
- **测试文件**：`tests/unit/team-TeammateManager.test.ts`
- **测试步骤**：
  1. mock `ProcessConfig.get('acp.cachedModels')` 返回 `null`
  2. 触发 lead agent 的 prompt 构建
- **预期结果**：
  - 构建的 `availableAgentTypes` 中每个条目的 `models` 为 `[]`

---

### IT-10: 创建团队完整流 — model 从 ICreateTeamParams 持久化到 DB 再读回

- **对应 Task**：Task 1 + Task 5
- **测试对象**：`TeamAgent.model` 数据持久化完整性
- **测试范围**：`teamTypes.ts`、DB schema、`TeamSessionService.ts`
- **测试文件**：`tests/integration/team-real-components.test.ts`（扩展已有文件）
- **测试步骤**：
  1. 构造 `ICreateTeamParams`，leader agent 含 `model: 'claude-sonnet-4'`
  2. 调用创建团队 IPC
  3. 从 DB 读取团队数据
  4. 解析 `agents` JSON 列
- **预期结果**：
  - 读回的 leader agent 的 `model` 字段为 `'claude-sonnet-4'`

---

## UI 交互测试

### UI-1: TeamModelSelect — backend 有可用模型时渲染 Select 组件

- **对应 Task**：Task 6
- **测试对象**：`TeamModelSelect` 组件
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`（扩展已有文件）
- **前置条件**：
  - mock `ConfigStorage.get('acp.cachedModels')` 返回含 claude 模型的数据
- **测试步骤**：
  1. 渲染 `<TeamModelSelect backend="claude" value={undefined} onChange={fn} />`
  2. 等待异步加载完成
- **预期结果**：
  - Select 组件渲染，包含 `claude-sonnet-4` 等选项
  - placeholder 为 `(default)`

---

### UI-2: TeamModelSelect — backend 无可用模型时不渲染

- **对应 Task**：Task 6
- **测试对象**：`TeamModelSelect` 组件
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`
- **前置条件**：
  - mock `ConfigStorage.get('acp.cachedModels')` 返回 `{}`
- **测试步骤**：
  1. 渲染 `<TeamModelSelect backend="custom" value={undefined} onChange={fn} />`
  2. 等待异步加载完成
- **预期结果**：
  - 组件返回 `null`，页面上无 Select 元素

---

### UI-3: TeamModelSelect — backend 变化时重新加载模型列表

- **对应 Task**：Task 6
- **测试对象**：`TeamModelSelect` 组件 useEffect 依赖
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`
- **前置条件**：
  - mock cachedModels 包含 claude 和 gemini 不同的模型列表
- **测试步骤**：
  1. 渲染 `<TeamModelSelect backend="claude" ...>`
  2. 等待加载，验证选项为 claude 模型
  3. 更新 props `backend="gemini"`
  4. 等待加载，验证选项变为 gemini 模型
- **预期结果**：
  - 模型列表随 backend 切换而更新

---

### UI-4: TeamModelSelect — allowClear 功能：选中后可清空

- **对应 Task**：Task 6
- **测试对象**：`TeamModelSelect` allowClear 行为
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`
- **前置条件**：
  - backend 有可用模型
- **测试步骤**：
  1. 渲染 `<TeamModelSelect backend="claude" value="claude-sonnet-4" onChange={fn} />`
  2. 点击清除按钮
- **预期结果**：
  - `onChange` 被调用，参数为 `undefined`

---

### UI-5: TeamCreateModal — 切换 agent type 时重置 model 选择

- **对应 Task**：Task 7
- **测试对象**：`TeamCreateModal` 中 selectedModel 状态管理
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`
- **前置条件**：
  - 有多个可用 agent type（claude, codex）
- **测试步骤**：
  1. 打开 TeamCreateModal
  2. 选择 claude agent type
  3. 选择 model `claude-sonnet-4`
  4. 切换 agent type 到 codex
- **预期结果**：
  - model 选择被重置为 `undefined`（显示 placeholder `(default)`）

---

### UI-6: TeamCreateModal — 创建团队时 model 字段传入 IPC 参数

- **对应 Task**：Task 7
- **测试对象**：`TeamCreateModal.handleCreate`
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`
- **前置条件**：
  - 选择了 agent type 和 model
- **测试步骤**：
  1. 打开 TeamCreateModal
  2. 输入 team name
  3. 选择 claude agent type
  4. 选择 model `claude-sonnet-4`
  5. 点击创建
- **预期结果**：
  - IPC 调用参数中 leader agent 的 `model` 为 `'claude-sonnet-4'`

---

### UI-7: TeamCreateModal — 不选 model 时传递 undefined

- **对应 Task**：Task 7
- **测试对象**：`TeamCreateModal.handleCreate` 默认行为
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`
- **前置条件**：
  - 选择了 agent type 但未选 model
- **测试步骤**：
  1. 打开 TeamCreateModal
  2. 输入 team name
  3. 选择 claude agent type（不选 model）
  4. 点击创建
- **预期结果**：
  - IPC 调用参数中 leader agent 的 `model` 为 `undefined`

---

### UI-8: AddAgentModal — 选择 agent type 后出现 model 下拉

- **对应 Task**：Task 7
- **测试对象**：`AddAgentModal` 集成 `TeamModelSelect`
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`
- **前置条件**：
  - 有可用 agent type 和对应模型
- **测试步骤**：
  1. 打开 AddAgentModal
  2. 选择一个 agent type
- **预期结果**：
  - 模型下拉出现，显示该 backend 的可用模型

---

### UI-9: AddAgentModal — 切换 agent type 时重置 model

- **对应 Task**：Task 7
- **测试对象**：`AddAgentModal` selectedModel 状态
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`
- **前置条件**：
  - 有多个可用 agent type
- **测试步骤**：
  1. 打开 AddAgentModal
  2. 选择 claude，选 model `claude-sonnet-4`
  3. 切换到 gemini
- **预期结果**：
  - model 被重置为 `undefined`

---

### UI-10: AddAgentModal — onConfirm 回调包含 model 参数

- **对应 Task**：Task 7
- **测试对象**：`AddAgentModal.handleConfirm`
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`
- **前置条件**：
  - mock `onConfirm` 回调
- **测试步骤**：
  1. 打开 AddAgentModal
  2. 输入 agent name，选择 agent type，选择 model
  3. 点击确认
- **预期结果**：
  - `onConfirm` 被调用，参数中 `model` 为选择的模型 ID

---

### UI-11: TeamPage 成员列表 — 有 model 时显示模型 ID

- **对应 Task**：Task 7
- **测试对象**：TeamPage 成员列表渲染
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`
- **前置条件**：
  - 团队有一个 agent，`model: 'claude-sonnet-4'`
- **测试步骤**：
  1. 渲染 TeamPage
  2. 查看成员列表区域
- **预期结果**：
  - 页面上显示 `claude-sonnet-4`

---

### UI-12: TeamPage 成员列表 — model 为 undefined 时显示 (default)

- **对应 Task**：Task 7
- **测试对象**：TeamPage 成员列表渲染
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`
- **前置条件**：
  - 团队有一个 agent，`model: undefined`
- **测试步骤**：
  1. 渲染 TeamPage
  2. 查看成员列表区域
- **预期结果**：
  - 页面上显示 `(default)`

---

## 回归测试

### RT-1: 现有团队无 model 字段 — 创建和运行不受影响

- **对应 Task**：Task 1 / Task 5（向后兼容性）
- **测试目的**：确保数据库中已存在的团队（agents JSON 不含 model 字段）能正常加载和运行
- **测试步骤**：
  1. 准备一条旧格式的 agents JSON（无 model 字段）：
     ```json
     [
       {
         "slotId": "s1",
         "conversationId": "c1",
         "role": "lead",
         "agentType": "claude",
         "agentName": "Leader",
         "conversationType": "acp",
         "status": "idle"
       }
     ]
     ```
  2. 写入 DB 的 teams 表
  3. 读取团队数据，反序列化为 `TeamAgent[]`
  4. 调用 `buildConversationParams` 为该 agent 构建会话参数
- **预期结果**：
  - 反序列化成功，`agent.model === undefined`
  - `buildConversationParams` 正常运行，回退到 preferredModelId 或 backend 默认值
  - 无异常抛出

---

### RT-2: team_spawn_agent 不传 model — 行为与修改前一致

- **对应 Task**：Task 3（向后兼容性）
- **测试目的**：确保老版本 lead prompt（不传 model 参数）调用 `team_spawn_agent` 时行为不变
- **测试步骤**：
  1. 通过 TCP 调用 `team_spawn_agent`：`{ name: 'Worker', agent_type: 'claude' }`
  2. 验证 spawnAgent 回调参数
  3. 验证返回的 agent 对象
- **预期结果**：
  - `spawnAgent` 第三个参数为 `undefined`
  - 返回的 agent 的 `model` 为 `undefined`
  - 行为与新增 model 参数前完全一致

---

### RT-3: SpawnAgentFn 两处类型定义保持同步

- **对应 Task**：Task 3
- **测试目的**：确保 `TeamMcpServer.ts` 和 `TeamSession.ts` 中的 `SpawnAgentFn` 类型签名一致，防止类型漂移
- **测试步骤**：
  1. `tsc --noEmit` 通过
  2. 读取 `TeamMcpServer.ts` 第 22-23 行的 `SpawnAgentFn` 类型
  3. 读取 `TeamSession.ts` 第 13-14 行的 `SpawnAgentFn` 类型
  4. 对比签名
- **预期结果**：
  - 两处签名完全一致：`(agentName: string, agentType?: string, model?: string) => Promise<TeamAgent>`

---

### RT-4: 现有 team_members 输出格式 — 无 model 时保持原格式

- **对应 Task**：Task 3
- **测试目的**：确保无 model 的 agent 在 `team_members` 输出中不出现多余的 `, model:` 后缀
- **测试步骤**：
  1. 构造 agents 列表，均无 model 字段
  2. 调用 `handleTeamMembers`
- **预期结果**：
  - 输出格式为 `- AgentName (type: claude, role: lead, status: idle)`
  - 不包含 `model` 字串

---

### RT-5: ICreateTeamParams / IAddTeamAgentParams 自动继承 model 字段

- **对应 Task**：Task 1
- **测试目的**：确保 IPC bridge 类型通过 re-export 链自动包含 model
- **测试步骤**：
  1. `tsc --noEmit` 通过
  2. 在类型层面验证 `ICreateTeamParams.agents[0]` 可以赋值含 `model` 的对象
  3. 在类型层面验证 `IAddTeamAgentParams.agent` 可以赋值含 `model` 的对象
- **预期结果**：
  - 类型检查通过，无编译错误

---

### RT-6: 现有单元测试全部通过

- **对应 Task**：所有 Task
- **测试目的**：确保本次改动不破坏任何已有测试
- **测试步骤**：
  1. 运行 `bun run test`
- **预期结果**：
  - 所有已有测试通过，无新增 failure

---

## 端到端测试

### E2E-1: 创建团队 → 选模型 → spawn agent → 验证 model 传递

- **对应 Task**：Task 1 + Task 3 + Task 5 + Task 7（全链路）
- **测试对象**：完整的模型选择流程
- **测试文件**：`tests/e2e/specs/team-model-switching.e2e.ts`（新文件）
- **测试步骤**：
  1. 打开 TeamCreateModal
  2. 输入 team name，选择 claude agent type
  3. 从 model 下拉选择 `claude-sonnet-4`
  4. 点击创建团队
  5. 验证团队创建成功，leader agent 的 model 为 `claude-sonnet-4`
  6. 进入团队页面，查看成员列表
  7. 验证 leader 显示的模型为 `claude-sonnet-4`
  8. 通过 lead agent 发起 `team_spawn_agent`，指定 `model: 'claude-haiku-3.5'`
  9. 验证新 agent 的 model 为 `claude-haiku-3.5`
  10. 调用 `team_members` 工具
  11. 验证输出中包含两个 agent 各自的 model 信息
- **预期结果**：
  - 全链路 model 正确传递和展示

---

### E2E-2: 创建团队不选模型 → 默认行为

- **对应 Task**：Task 7（向后兼容 UI 流程）
- **测试对象**：不选模型时的默认行为
- **测试文件**：`tests/e2e/specs/team-model-switching.e2e.ts`
- **测试步骤**：
  1. 打开 TeamCreateModal
  2. 输入 team name，选择 claude agent type
  3. 不选择任何模型（保持 placeholder "(default)"）
  4. 点击创建
  5. 验证 leader agent 的 model 为 undefined
  6. 进入团队页面，成员列表显示 `(default)`
- **预期结果**：
  - 不选模型时行为与改动前一致

---

### E2E-3: AddAgentModal 手动添加成员选择模型

- **对应 Task**：Task 7
- **测试对象**：通过 AddAgentModal 手动添加成员并选择模型
- **测试文件**：`tests/e2e/specs/team-model-switching.e2e.ts`
- **测试步骤**：
  1. 在已有团队中打开 AddAgentModal
  2. 输入 agent name
  3. 选择 agent type（如 gemini）
  4. 从 model 下拉选择 `gemini-2.0-flash`
  5. 点击确认
  6. 验证新成员出现在列表中，model 显示为 `gemini-2.0-flash`
- **预期结果**：
  - 手动添加的成员 model 正确保存和显示

---

## 边界条件测试

### BC-1: cachedModels 完全为空 — UI 不显示模型选择器

- **对应 Task**：Task 6（Edge Case 8.2）
- **测试对象**：`TeamModelSelect` 在 cachedModels 为空时的行为
- **测试文件**：`tests/unit/renderer/team-renderer.dom.test.tsx`
- **前置条件**：
  - `ConfigStorage.get('acp.cachedModels')` 返回 `{}`
  - `ConfigStorage.get('model.config')` 返回 `[]`
- **测试步骤**：
  1. 渲染 `<TeamModelSelect backend="claude" value={undefined} onChange={fn} />`
- **预期结果**：
  - 组件不渲染（返回 null）

---

### BC-2: LLM 幻觉模型 ID — warning 日志但不阻塞

- **对应 Task**：Task 3（Edge Case 8.5）
- **测试对象**：`handleSpawnAgent` 的 model 校验逻辑
- **测试文件**：`tests/unit/team-TeamMcpServer.test.ts`
- **前置条件**：
  - `cachedModels['claude'].availableModels` 不包含 `'gpt-4o'`
- **测试步骤**：
  1. 调用 `team_spawn_agent`，传入 `{ name: 'Agent', agent_type: 'claude', model: 'gpt-4o' }`
- **预期结果**：
  - `console.warn` 被调用
  - agent 仍然被成功创建（不阻塞）

---

### BC-3: cachedModels 中无该 backend — model 校验跳过

- **对应 Task**：Task 3（Edge Case 8.5）
- **测试对象**：`handleSpawnAgent` 在 cachedModels 无对应 backend 时的行为
- **测试文件**：`tests/unit/team-TeamMcpServer.test.ts`
- **前置条件**：
  - `cachedModels` 不包含 `gemini` 键
- **测试步骤**：
  1. 调用 `team_spawn_agent`，传入 `{ name: 'Agent', agent_type: 'gemini', model: 'gemini-2.5-pro' }`
- **预期结果**：
  - 不触发 `console.warn`（无可用列表可比对，跳过校验）
  - agent 正常创建

---

### BC-4: custom backend — 模型选择器不显示，model 不传

- **对应 Task**：Task 6（Edge Case 8.4）
- **测试对象**：`getTeamAvailableModels` 对 custom backend 的处理
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：无
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('custom', cachedModels, providers)`
- **预期结果**：
  - 返回 `[]`

---

### BC-5: Gemini 多个 provider — 合并所有 enabled provider 的模型

- **对应 Task**：Task 2
- **测试对象**：`getTeamAvailableModels` 对多 Gemini provider 的处理
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `providers` 包含两个 enabled 的 Gemini provider：
    - `{ platform: 'gemini', enabled: true, model: ['gemini-2.5-pro'] }`
    - `{ platform: 'gemini-with-google-auth', enabled: true, model: ['gemini-2.0-flash'] }`
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('gemini', {}, providers)`
- **预期结果**：
  - 返回包含两个 provider 的所有模型：`gemini-2.5-pro` 和 `gemini-2.0-flash`

---

### BC-6: ACP backend 同时有 cachedModels 和 providers — 优先使用 cachedModels

- **对应 Task**：Task 2
- **测试对象**：`getTeamAvailableModels` 的优先级逻辑
- **测试文件**：`tests/unit/teamModelUtils.test.ts`
- **前置条件**：
  - `cachedModels['claude']` 有模型数据
  - `providers` 也有数据
- **测试步骤**：
  1. 调用 `getTeamAvailableModels('claude', cachedModels, providers)`
- **预期结果**：
  - 返回 cachedModels 中的数据，不使用 providers

---

## 覆盖率总结

| 覆盖领域                     | 用例编号                                           | 数量   |
| ---------------------------- | -------------------------------------------------- | ------ |
| Task 1 验收 (TeamAgent 类型) | UT-21, RT-1, RT-5                                  | 3      |
| Task 2 验收 (teamModelUtils) | UT-1 ~ UT-20, BC-4 ~ BC-6                          | 23     |
| Task 3 验收 (MCP 层)         | UT-22 ~ UT-26, IT-1, IT-2, RT-2 ~ RT-4, BC-2, BC-3 | 12     |
| Task 4 验收 (Prompt 层)      | UT-27 ~ UT-30, IT-8, IT-9                          | 6      |
| Task 5 验收 (服务层)         | IT-3 ~ IT-7, IT-10                                 | 6      |
| Task 6 验收 (UI 组件)        | UI-1 ~ UI-4, BC-1                                  | 5      |
| Task 7 验收 (UI 集成)        | UI-5 ~ UI-12, E2E-1 ~ E2E-3                        | 11     |
| Task 8 验收 (单元测试)       | UT-1 ~ UT-20                                       | 20     |
| 向后兼容                     | RT-1 ~ RT-6                                        | 6      |
| 边界条件                     | BC-1 ~ BC-6                                        | 6      |
| **总计**                     |                                                    | **58** |
