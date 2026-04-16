# Task Breakdown — Team Model Switching

## 任务依赖图

```
Task 1 (数据层: TeamAgent 类型)
  ├── Task 2 (工具函数: teamModelUtils.ts)          ── 无后续依赖，可独立测试
  ├── Task 3 (MCP 层: team_spawn_agent + SpawnAgentFn 类型)
  │     └── Task 5 (服务层: TeamSessionService 穿透 model)
  ├── Task 4 (Prompt 层: lead prompt + tool description)
  ├── Task 6 (UI 组件: TeamModelSelect)
  │     └── Task 7 (UI 集成: TeamCreateModal + AddAgentModal + TeamPage)
  └── Task 8 (单元测试: teamModelUtils)             ── 依赖 Task 2

并行度：Task 1 完成后，Task 2/3/4/6 可同时开工。Task 8 可与 Task 2 同步开发。
```

## 任务列表

### Task 1: 数据层 — TeamAgent 类型扩展

- **描述**：在 `TeamAgent` 类型中新增可选 `model` 字段，让整条数据链路能承载模型信息
- **改动文件**：`src/common/types/teamTypes.ts`
- **改动内容**：
  在 `TeamAgent` 类型定义（第 54-64 行）的 `customAgentId?: string;` 后面新增一行：
  ```typescript
  model?: string; // Model ID (e.g. 'claude-sonnet-4', 'gemini-2.5-pro')
  ```
  完整结构变为：
  ```typescript
  export type TeamAgent = {
    slotId: string;
    conversationId: string;
    role: TeammateRole;
    agentType: string;
    agentName: string;
    conversationType: string;
    status: TeammateStatus;
    cliPath?: string;
    customAgentId?: string;
    model?: string;
  };
  ```
- **依赖**：无
- **预估工作量**：小
- **验收标准**：
  1. `tsc --noEmit` 通过，无类型错误
  2. 现有所有引用 `TeamAgent` 的代码不受影响（字段可选，向后兼容）
  3. `ICreateTeamParams.agents` 和 `IAddTeamAgentParams.agent` 自动包含 `model` 字段（通过 `@process/team/types` re-export 链自动传播）

---

### Task 2: 工具函数 — getTeamAvailableModels / getTeamDefaultModelId

- **描述**：新建公共工具模块，提供按 backend 获取可用模型列表和默认模型 ID 的能力
- **改动文件**：`src/common/utils/teamModelUtils.ts`（**新文件**）
- **改动内容**：
  创建新文件，导出以下内容：
  1. `TeamAvailableModel` 类型：`{ id: string; label: string }`
  2. `getTeamAvailableModels(backend, cachedModels, providers)` 函数：
     - ACP backends：从 `cachedModels[backend].availableModels` 读取（已标准化为 `{ id, label }[]`）
     - Gemini：从 `providers` 中过滤 `platform === 'gemini' || 'gemini-with-google-auth'`，读取 `model[]`
     - Aionrs：从 `providers` 中取第一个 enabled provider 的 `model[]`
     - 其他：返回空数组
  3. `getTeamDefaultModelId(backend, cachedModels, acpConfig)` 函数：
     - 优先 `acpConfig[backend].preferredModelId`
     - 其次 `cachedModels[backend].currentModelId`
     - 否则 `undefined`

  导入类型：

  ```typescript
  import type { AcpModelInfo } from '@/common/types/acpTypes';
  import type { IProvider } from '@/common/config/storage';
  ```

  完整实现参见技术方案 Section 2.2。

- **依赖**：无（不依赖 Task 1，纯工具函数）
- **预估工作量**：小
- **验收标准**：
  1. `tsc --noEmit` 通过
  2. 函数签名与技术方案一致
  3. 对应单元测试通过（见 Task 8）

---

### Task 3: MCP 层 — team_spawn_agent 增加 model 参数 + SpawnAgentFn 类型同步

- **描述**：在 MCP 工具层面让 `team_spawn_agent` 接受并传递 `model` 参数，同步更新两处 `SpawnAgentFn` 类型定义
- **改动文件**：
  1. `src/process/team/mcp/team/teamMcpStdio.ts`
  2. `src/process/team/mcp/team/TeamMcpServer.ts`
  3. `src/process/team/TeamSession.ts`
- **改动内容**：

  **文件 1 — `teamMcpStdio.ts`（第 152-169 行）**：
  在 `team_spawn_agent` 的 Zod schema 中，`agent_type` 之后新增 `model` 参数：

  ```typescript
  model: z.string().optional().describe(
    'Model ID to use for this agent (e.g. "claude-sonnet-4", "gemini-2.5-pro"). ' +
    'Defaults to the backend\'s preferred model when omitted.'
  ),
  ```

  **文件 2 — `TeamMcpServer.ts`**：
  - 第 23 行，更新 `SpawnAgentFn` 类型签名：
    ```typescript
    type SpawnAgentFn = (agentName: string, agentType?: string, model?: string) => Promise<TeamAgent>;
    ```
  - 第 329-364 行 `handleSpawnAgent` 方法：
    1. 在 `agentType` 提取之后新增 `model` 提取：
       ```typescript
       const model = args.model ? String(args.model) : undefined;
       ```
    2. 在 backend 校验之后、`spawnAgent` 调用之前，增加轻量级 model 校验（warning log，不阻塞）：
       ```typescript
       if (model && agentType) {
         const cachedModels = await ProcessConfig.get('acp.cachedModels');
         const available = cachedModels?.[agentType]?.availableModels;
         if (available && available.length > 0 && !available.some((m) => m.id === model)) {
           console.warn(
             `[TeamMcpServer] handleSpawnAgent: model "${model}" not in available models for backend "${agentType}". ` +
               `Backend will use default model as fallback.`
           );
         }
       }
       ```
    3. 将第 349 行 `await spawnAgent(name, agentType)` 改为 `await spawnAgent(name, agentType, model)`
  - 第 410-417 行 `handleTeamMembers` 方法：
    将 agent 格式化行从：
    ```typescript
    const lines = agents.map((a) => `- ${a.agentName} (type: ${a.agentType}, role: ${a.role}, status: ${a.status})`);
    ```
    改为：
    ```typescript
    const lines = agents.map((a) => {
      const modelSuffix = a.model ? `, model: ${a.model}` : '';
      return `- ${a.agentName} (type: ${a.agentType}, role: ${a.role}, status: ${a.status}${modelSuffix})`;
    });
    ```

  **文件 3 — `TeamSession.ts`（第 14 行）**：
  同步更新 `SpawnAgentFn` 类型签名（与 `TeamMcpServer.ts` 保持一致）：

  ```typescript
  type SpawnAgentFn = (agentName: string, agentType?: string, model?: string) => Promise<TeamAgent>;
  ```

  构造函数（第 32 行）已经直接透传 `spawnAgent`，无需额外修改。

- **依赖**：Task 1（需要 `TeamAgent.model` 字段存在）
- **预估工作量**：中
- **验收标准**：
  1. `tsc --noEmit` 通过
  2. `team_spawn_agent` MCP 工具 schema 包含 `model` 可选参数
  3. `handleSpawnAgent` 能正确提取 `model` 并传递给 `spawnAgent` 回调
  4. `handleTeamMembers` 输出中包含 model 信息（当存在时）
  5. 两处 `SpawnAgentFn` 类型签名完全一致

---

### Task 4: Prompt 层 — lead prompt 增加模型推荐能力

- **描述**：让 lead agent 的 prompt 包含各 backend 可用模型列表，并引导其在推荐阵容时推荐具体模型
- **改动文件**：
  1. `src/process/team/prompts/leadPrompt.ts`
  2. `src/process/team/prompts/buildRolePrompt.ts`
  3. `src/process/team/prompts/toolDescriptions.ts`
  4. `src/process/team/TeammateManager.ts`
- **改动内容**：

  **文件 1 — `leadPrompt.ts`**：
  - 第 7 行，扩展 `LeadPromptParams.availableAgentTypes` 类型：
    ```typescript
    availableAgentTypes?: Array<{ type: string; name: string; models?: string[] }>;
    ```
  - 第 33-36 行，更新 `availableTypesSection` 生成逻辑，在每个 agent type 后面显示可用模型列表：
    ```typescript
    const availableTypesSection =
      availableAgentTypes && availableAgentTypes.length > 0
        ? `\n\n## Available Agent Types for Spawning\n${availableAgentTypes
            .map((a) => {
              const modelList = a.models?.length ? ` (models: ${a.models.join(', ')})` : '';
              return `- \`${a.type}\` — ${a.name}${modelList}`;
            })
            .join('\n')}`
        : '';
    ```
  - 第 72 行，workflow step 5 更新：
    ```
    5. Present the proposed lineup as a table with: teammate name, responsibility, recommended agent type/backend, and recommended model
    ```
  - 在 prompt 末尾（`## Workflow` section 之后）追加 `## Model Selection Guidelines` 部分：
    ```
    ## Model Selection Guidelines
    - When spawning teammates, consider recommending a specific model for each agent
    - For complex reasoning tasks: prefer stronger models (e.g. claude-sonnet-4, gemini-2.5-pro)
    - For routine tasks: prefer faster/cheaper models (e.g. gemini-2.0-flash)
    - If unsure, omit the model parameter to use the backend's default
    - Pass the model parameter to team_spawn_agent when a specific model is recommended
    ```

  **文件 2 — `buildRolePrompt.ts`（第 9 行）**：
  同步更新 `BuildRolePromptParams.availableAgentTypes` 类型：

  ```typescript
  availableAgentTypes?: Array<{ type: string; name: string; models?: string[] }>;
  ```

  **文件 3 — `toolDescriptions.ts`**：
  更新 `TEAM_SPAWN_AGENT_DESCRIPTION`：
  - 第 10 行 table 描述改为：`name, responsibility, recommended agent type/backend, and recommended model`
  - 第 11 行改为：`Include each teammate's responsibility, recommended agent type/backend, and model`
  - 末尾追加一行：`When calling this tool, provide the model parameter if a specific model was recommended and approved.`

  **文件 4 — `TeammateManager.ts`（第 164-171 行）**：
  在构建 `availableAgentTypes` 时读取 `acp.cachedModels` 并附加模型列表：

  ```typescript
  let availableAgentTypes: Array<{ type: string; name: string; models?: string[] }> | undefined;
  if (agent.role === 'lead') {
    const cachedInitResults = await ProcessConfig.get('acp.cachedInitializeResult');
    const cachedModels = await ProcessConfig.get('acp.cachedModels');
    availableAgentTypes = acpDetector
      .getDetectedAgents()
      .filter((a) => isTeamCapableBackend(a.backend, cachedInitResults))
      .map((a) => ({
        type: a.backend,
        name: a.name,
        models: cachedModels?.[a.backend]?.availableModels?.map((m) => m.id) || [],
      }));
  }
  ```

  需要新增 import：`ProcessConfig` 如果尚未导入（检查文件头部）。

- **依赖**：Task 1（prompt 中引用 `TeamAgent.model` 概念，类型需存在）
- **预估工作量**：中
- **验收标准**：
  1. `tsc --noEmit` 通过
  2. Lead prompt 输出中包含 `## Available Agent Types for Spawning` section，且每个 type 后面有 `(models: ...)` 列表
  3. Lead prompt 包含 `## Model Selection Guidelines` 部分
  4. `TEAM_SPAWN_AGENT_DESCRIPTION` 提到了 model 参数
  5. `buildRolePrompt` 的 `availableAgentTypes` 参数类型支持 `models` 字段

---

### Task 5: 服务层 — TeamSessionService 穿透 model

- **描述**：让 `spawnAgent` 闭包接受 `model` 参数，并在 `buildConversationParams` 中使用 `agent.model` 覆盖默认模型（ACP 和 Gemini/Aionrs 两条路径）
- **改动文件**：`src/process/team/TeamSessionService.ts`
- **改动内容**：

  **改动 1 — `spawnAgent` 闭包（第 740-762 行）**：
  - 第 740 行，函数签名新增 `model` 参数：
    ```typescript
    const spawnAgent = async (agentName: string, agentType?: string, model?: string) => {
    ```
  - 第 744-751 行，在 `addAgent` 调用的参数对象中新增 `model` 字段：
    ```typescript
    const newAgent = await this.addAgent(teamId, {
      conversationId: '',
      role: 'teammate',
      agentType: resolvedType,
      agentName,
      status: 'pending',
      conversationType: this.resolveConversationType(resolvedType) as 'acp',
      model,
    });
    ```

  **改动 2 — `buildConversationParams`（第 286-339 行）**：

  路径 1：ACP backends（第 306-307 行）：

  ```typescript
  // BEFORE:
  const preferredModelId =
    getConversationTypeForBackend(backend) === 'acp' ? await this.resolvePreferredAcpModelId(backend) : undefined;

  // AFTER:
  const preferredModelId =
    agent.model ||
    (getConversationTypeForBackend(backend) === 'acp' ? await this.resolvePreferredAcpModelId(backend) : undefined);
  ```

  路径 2：Gemini/Aionrs backends（在第 314 行 `resolveConversationModel` 返回之后、第 316 行 `buildAgentConversationParams` 调用之前插入）：

  ```typescript
  const model = await this.resolveConversationModel({
    backend,
    isPreset,
    presetAgentType: isPreset ? backend : undefined,
  });

  // NEW: Override useModel for Gemini/Aionrs when agent has an explicit model
  if (agent.model) {
    const type = getConversationTypeForBackend(backend);
    if (type === 'gemini' || type === 'aionrs') {
      model = { ...model, useModel: agent.model };
    }
  }
  ```

  注意：`model` 变量需要改为 `let` 声明（当前可能是 `const`）。

- **依赖**：Task 1 + Task 3（`SpawnAgentFn` 类型更新后，闭包签名才能匹配）
- **预估工作量**：中
- **验收标准**：
  1. `tsc --noEmit` 通过
  2. `spawnAgent` 闭包正确传递 `model` 到 `addAgent`
  3. ACP 路径：当 `agent.model` 存在时，`preferredModelId` 使用 `agent.model`
  4. Gemini/Aionrs 路径：当 `agent.model` 存在时，`model.useModel` 被覆盖
  5. 当 `agent.model` 为 `undefined` 时，行为与修改前完全一致（向后兼容）

---

### Task 6: UI 组件 — TeamModelSelect 可复用模型选择器

- **描述**：创建可复用的模型下拉选择组件，供 TeamCreateModal 和 AddAgentModal 使用
- **改动文件**：`src/renderer/pages/team/components/TeamModelSelect.tsx`（**新文件**）
- **改动内容**：
  创建 React 组件，Props 为：

  ```typescript
  type Props = {
    backend: string;
    value: string | undefined;
    onChange: (model: string | undefined) => void;
  };
  ```

  实现要点：
  1. `useState` 管理 `loading` 和 `models` 状态
  2. `useEffect` 监听 `backend` 变化，异步加载 `ConfigStorage.get('acp.cachedModels')` 和 `ConfigStorage.get('model.config')`
  3. 调用 `getTeamAvailableModels(backend, cachedModels, providers)` 计算可用模型
  4. loading 或 models 为空时返回 `null`（不渲染）
  5. 渲染 `<Select>` 组件（来自 `@arco-design/web-react`）：
     - `placeholder="(default)"`
     - `allowClear`（允许清空选择，回到默认模型）
     - 遍历 `models` 渲染 `Select.Option`

  导入：

  ```typescript
  import { Select } from '@arco-design/web-react';
  import { ConfigStorage } from '@/common/config/storage';
  import { getTeamAvailableModels, type TeamAvailableModel } from '@/common/utils/teamModelUtils';
  ```

  完整实现参见技术方案 Section 6.3。

- **依赖**：Task 2（需要 `getTeamAvailableModels` 函数）
- **预估工作量**：小
- **验收标准**：
  1. `tsc --noEmit` 通过
  2. 组件在 `backend` 变化时重新加载模型列表
  3. 无可用模型时不渲染
  4. `allowClear` 可清空选择
  5. 使用 Arco Design `Select` 组件，不使用原生 HTML

---

### Task 7: UI 集成 — TeamCreateModal + AddAgentModal + TeamPage 接入模型选择

- **描述**：在创建团队和添加成员的 Modal 中集成模型选择器，并在 TeamPage 的成员列表中显示模型信息
- **改动文件**：
  1. `src/renderer/pages/team/components/TeamCreateModal.tsx`
  2. `src/renderer/pages/team/components/AddAgentModal.tsx`
  3. `src/renderer/pages/team/TeamPage.tsx`
- **改动内容**：

  **文件 1 — `TeamCreateModal.tsx`**：
  - 新增 state：`const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);`
  - 当 `dispatchAgentKey` 变化时，reset `selectedModel` 为 `undefined`
  - 在 agent card grid 下方渲染 `<TeamModelSelect>`：
    ```tsx
    <TeamModelSelect
      backend={resolveTeamAgentType(agentFromKey(dispatchAgentKey, allAgents), 'acp')}
      value={selectedModel}
      onChange={setSelectedModel}
    />
    ```
    仅当 `dispatchAgentKey` 存在时渲染
  - 第 101-111 行 `handleCreate` 中，`agents.push` 的对象新增 `model: selectedModel`

  **文件 2 — `AddAgentModal.tsx`**：
  - 新增 state：`const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);`
  - 当 `selectedKey` 变化时，reset `selectedModel` 为 `undefined`
  - 在 agent type Select 下方渲染 `<TeamModelSelect>`（仅当 `selectedKey` 存在时）
  - 第 13 行，更新 `Props.onConfirm` 类型签名：
    ```typescript
    onConfirm: (data: { agentName: string; agentKey: string; model?: string }) => void;
    ```
  - 第 46 行，更新 `handleConfirm`：
    ```typescript
    onConfirm({ agentName: agentName.trim(), agentKey: selectedKey, model: selectedModel });
    ```
  - `handleClose` 中 reset `selectedModel`

  **文件 3 — `TeamPage.tsx`**：
  - 第 515 行，更新 `handleAddAgent` 参数类型：
    ```typescript
    async (data: { agentName: string; agentKey: string; model?: string }) => {
    ```
  - 第 519-528 行，`addAgent` 调用参数对象新增 `model: data.model`
  - 在成员列表展示区域，当 `agent.model` 存在时显示模型 ID，否则显示 `(default)`
    （具体位置需查看 `TeamPage.tsx` 中渲染 agent 卡片的地方，约第 111-122 行附近）

- **依赖**：Task 1 + Task 6（需要 `TeamAgent.model` 字段和 `TeamModelSelect` 组件）
- **预估工作量**：中
- **验收标准**：
  1. `tsc --noEmit` 通过
  2. TeamCreateModal 中选择 leader 后出现模型下拉（如果该 backend 有可用模型）
  3. AddAgentModal 中选择 agent type 后出现模型下拉
  4. 切换 agent type 时模型选择重置
  5. 创建团队/添加成员时 `model` 字段正确传递到 IPC
  6. 成员列表中显示模型信息
  7. 不选择模型时，显示 `(default)`，传递 `undefined`

---

### Task 8: 单元测试 — teamModelUtils

- **描述**：为 `getTeamAvailableModels` 和 `getTeamDefaultModelId` 编写单元测试
- **改动文件**：`tests/unit/teamModelUtils.test.ts`（**新文件**）
- **改动内容**：
  测试用例覆盖以下场景：

  **`getTeamAvailableModels` 测试：**
  1. ACP backend 有 cachedModels 时返回标准化模型列表
  2. ACP backend cachedModels 为空时返回空数组
  3. ACP backend cachedModels 为 null/undefined 时返回空数组
  4. Gemini backend 从 providers 中正确过滤 `platform === 'gemini'` 和 `'gemini-with-google-auth'`
  5. Gemini backend 排除 `enabled === false` 的 provider
  6. Gemini backend 排除 `modelEnabled[m] === false` 的模型
  7. Aionrs backend 取第一个 enabled provider 的模型
  8. Aionrs backend 无 enabled provider 时返回空数组
  9. 未知 backend（如 `'custom'`）返回空数组
  10. providers 为 null/undefined 时 Gemini/Aionrs 返回空数组

  **`getTeamDefaultModelId` 测试：**
  1. 优先返回 `acpConfig[backend].preferredModelId`
  2. preferredModelId 为空时返回 `cachedModels[backend].currentModelId`
  3. 两者都为空时返回 `undefined`
  4. cachedModels/acpConfig 为 null/undefined 时返回 `undefined`

- **依赖**：Task 2（需要函数实现存在）
- **预估工作量**：小
- **验收标准**：
  1. `bun run test` 全部通过
  2. 覆盖率 >= 80%（针对 `teamModelUtils.ts`）
  3. 不使用 mock（遵循项目红线）
