# Team Model Switching — 现状调研报告

## 一、团队阵容推荐逻辑

**当前现状：Agent 推荐是由大模型驱动的，不是系统自动推荐**

1. **推荐方式**：
   - 团队创建后，Lead Agent 根据用户的具体任务来提议阵容
   - 通过 Prompt 引导 Agent 向用户展示"proposed lineup"（提议的阵容表）
   - 仅在用户明确确认后才创建 Agent

2. **推荐触发条件**（`src/process/team/prompts/leadPrompt.ts`）：
   - 用户明确要求创建团队或多个 Agent
   - 任务极度复杂，一个 Agent 无法胜任
   - 不会因为工作跨多个文件、需要多轮就推荐

3. **推荐内容格式**（leadPrompt 第 70-75 行）：

   ```
   表格形式包含：
   - Teammate name（队友名字）
   - Responsibility（职责）
   - Recommended agent type/backend（推荐 Agent 类型）
   ```

   **注意：没有模型推荐列**

4. **Agent 类型选择逻辑**（`TeamGuideMcpServer.handleCreateTeam`）：
   ```typescript
   const agentType = backend && isTeamCapableBackend(backend, cachedInitResults) ? backend : 'claude';
   ```

   - 系统自动注入请求的 backend
   - 如果不支持，降级到 'claude'
   - 没有智能模型选择

## 二、Agent 类型定义

### 支持 Team Mode 的 Agent 类型（24 种）

位置：`src/common/types/acpTypes.ts`（ACP_BACKENDS_ALL 定义）

| ID               | 名称           | Team 支持 | 说明                                  |
| ---------------- | -------------- | --------- | ------------------------------------- |
| claude           | Claude Code    | ✅        | Anthropic 官方，mcpCapabilities.stdio |
| gemini           | Google CLI     | ✅        | 内置支持（无需 stdio）                |
| qwen             | Qwen Code      | ✅        | 需 `--acp`                            |
| codex            | Codex          | ✅        | 通过 codex-acp 桥接                   |
| codebuddy        | CodeBuddy      | ✅        | 腾讯，需 `--acp`                      |
| goose            | Goose (Block)  | ✅        | 需 `goose acp`                        |
| auggie           | Augment Code   | ✅        | 需 `--acp`                            |
| kimi             | Kimi CLI       | ✅        | 需 `kimi acp`                         |
| opencode         | OpenCode       | ✅        | 需 `opencode acp`                     |
| droid            | Factory Droid  | ✅        | 需 `droid exec --output-format acp`   |
| copilot          | GitHub Copilot | ✅        | 需 `copilot --acp --stdio`            |
| qoder            | Qoder          | ✅        | 需 `--acp`                            |
| vibe             | Mistral Vibe   | ✅        | vibe-acp                              |
| openclaw-gateway | OpenClaw       | ✅        | WebSocket gateway                     |
| nanobot          | Nano Bot       | ✅        | -                                     |
| cursor           | Cursor Agent   | ✅        | 需 `agent acp`                        |
| kiro             | Kiro (AWS)     | ✅        | 需 `kiro-cli acp`                     |
| hermes           | Hermes Agent   | ✅        | 需 `hermes acp`                       |
| snow             | Snow CLI       | ✅        | 需 `--acp`                            |
| remote           | Remote Agent   | ✅        | WebSocket，无本地 CLI                 |
| aionrs           | Aion CLI       | ✅        | JSON Lines 协议，Rust 二进制          |
| iflow            | iFlow CLI      | ✅        | -                                     |
| custom           | Custom Agent   | ✅        | 用户自定义                            |

### Team 能力判定

位置：`src/common/types/teamTypes.ts`

```typescript
const KNOWN_TEAM_CAPABLE_BACKENDS = new Set(['gemini', 'claude', 'codex', 'snow']);
// 对于 ACP 后端，检查 cachedInitializeResult?.capabilities.mcpCapabilities.stdio === true
```

## 三、UI 层 Agent 数据结构

位置：`src/renderer/utils/model/agentTypes.ts`

```typescript
type AvailableAgent = {
  backend: AcpBackend;
  name: string;
  cliPath?: string;
  customAgentId?: string;
  isPreset?: boolean;
  context?: string;
  avatar?: string;
  presetAgentType?: PresetAgentType | string;
  supportedTransports?: string[];
  isExtension?: boolean;
  extensionName?: string;
};
```

**注意：没有 model 字段**

## 四、Team 成员数据结构

位置：`src/common/types/teamTypes.ts`

```typescript
type TeamAgent = {
  slotId: string;
  conversationId: string;
  role: TeammateRole; // 'lead' | 'teammate'
  agentType: string; // 后端类型（如 'claude', 'gemini'）
  agentName: string;
  conversationType: string;
  status: TeammateStatus; // 'pending'|'idle'|'active'|'completed'|'failed'
  cliPath?: string;
  customAgentId?: string;
};
```

**注意：没有 model 字段**

## 五、Team 主体结构

```typescript
type TTeam = {
  id: string;
  userId: string;
  name: string;
  workspace: string;
  workspaceMode: 'shared' | 'isolated';
  leadAgentId: string;
  agents: TeamAgent[];
  sessionMode?: string;
  createdAt: number;
  updatedAt: number;
};
```

## 六、数据库 Schema

位置：`src/process/services/database/schema.ts`

```sql
-- teams 表
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  workspace TEXT NOT NULL,
  workspace_mode TEXT NOT NULL DEFAULT 'shared',
  lead_agent_id TEXT NOT NULL DEFAULT '',
  agents TEXT NOT NULL DEFAULT '[]',        -- JSON 序列化的 TeamAgent[]
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- mailbox 表
CREATE TABLE IF NOT EXISTS mailbox (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  to_agent_id TEXT NOT NULL,
  from_agent_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'message',
  content TEXT NOT NULL,
  summary TEXT,
  files TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- team_tasks 表
CREATE TABLE IF NOT EXISTS team_tasks (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  owner TEXT,
  blocked_by TEXT NOT NULL DEFAULT '[]',
  blocks TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);
```

## 七、IPC Bridge 接口

位置：`src/common/adapter/ipcBridge.ts`（第 1289-1310 行）

```typescript
export const team = {
  create: bridge.buildProvider<TTeam, ICreateTeamParams>('team.create'),
  list: bridge.buildProvider<TTeam[], { userId: string }>('team.list'),
  get: bridge.buildProvider<TTeam | null, { id: string }>('team.get'),
  remove: bridge.buildProvider<void, { id: string }>('team.remove'),
  addAgent: bridge.buildProvider<TeamAgent, IAddTeamAgentParams>('team.add-agent'),
  removeAgent: bridge.buildProvider<void, { teamId: string; slotId: string }>('team.remove-agent'),
  renameAgent: bridge.buildProvider<void, { teamId: string; slotId: string; newName: string }>('team.rename-agent'),
  sendMessage: bridge.buildProvider<void, { teamId: string; content: string; files?: string[] }>('team.send-message'),
  sendMessageToAgent: bridge.buildProvider<void, { teamId: string; slotId: string; content: string; files?: string[] }>(
    'team.send-message-to-agent'
  ),
  stop: bridge.buildProvider<void, { teamId: string }>('team.stop'),
  ensureSession: bridge.buildProvider<void, { teamId: string }>('team.ensure-session'),
  renameTeam: bridge.buildProvider<void, { id: string; name: string }>('team.rename'),
  setSessionMode: bridge.buildProvider<void, { teamId: string; sessionMode: string }>('team.set-session-mode'),
  // Events
  agentStatusChanged: bridge.buildEmitter<ITeamAgentStatusEvent>('team.agent.status'),
  agentSpawned: bridge.buildEmitter<ITeamAgentSpawnedEvent>('team.agent.spawned'),
  agentRemoved: bridge.buildEmitter<ITeamAgentRemovedEvent>('team.agent.removed'),
  agentRenamed: bridge.buildEmitter<ITeamAgentRenamedEvent>('team.agent.renamed'),
  listChanged: bridge.buildEmitter<ITeamListChangedEvent>('team.list-changed'),
  mcpStatus: bridge.buildEmitter<ITeamMcpStatusEvent>('team.mcp.status'),
};
```

IPC 参数类型：

```typescript
type ICreateTeamParams = {
  userId: string;
  name: string;
  workspace: string;
  workspaceMode: WorkspaceMode;
  agents: Omit<TeamAgent, 'slotId'>[];
};

type IAddTeamAgentParams = {
  teamId: string;
  agent: Omit<TeamAgent, 'slotId'>;
};
```

**注意：ICreateTeamParams 和 IAddTeamAgentParams 都不含 model 参数**

## 八、MCP 通信架构

### 1. Team Guide MCP Server（Solo → Team 转换）

位置：`src/process/team/mcp/guide/TeamGuideMcpServer.ts`

- 给 Solo Agent 提供 `aion_create_team` 工具
- 启动模式：TCP server + stdio bridge

### 2. Team MCP Server（Team 内部通信）

位置：`src/process/team/mcp/team/TeamMcpServer.ts`

8 个工具：

| 工具名                | 功能         | 调用者     |
| --------------------- | ------------ | ---------- |
| `team_send_message`   | 发消息给队友 | 任何 Agent |
| `team_spawn_agent`    | 创建新 Agent | 仅 Lead    |
| `team_task_create`    | 创建任务     | 任何 Agent |
| `team_task_update`    | 更新任务状态 | 任何 Agent |
| `team_task_list`      | 查看任务列表 | 任何 Agent |
| `team_members`        | 查看团队成员 | 任何 Agent |
| `team_rename_agent`   | 重命名 Agent | Lead       |
| `team_shutdown_agent` | 关闭 Agent   | Lead       |

MCP 通信栈：

```
Agent CLI Process → stdio bridge → TCP (127.0.0.1:随机端口) → TeamMcpServer → TeamSession/Mailbox/TaskManager
```

## 九、Prompt 系统

### 1. Team Guide Prompt（Solo Agent）

位置：`src/process/team/prompts/teamGuidePrompt.ts`

- 默认规则：单人处理，不主动推荐 Team
- 仅在用户明确要求或任务极度复杂时提及 Team

### 2. Lead Agent Prompt

位置：`src/process/team/prompts/leadPrompt.ts`

- 不做实现工作，只协调
- 显示提议表（队友名、职责、推荐 Agent 类型）
- 等待用户确认后才创建 Agent

### 3. Teammate Prompt

位置：`src/process/team/prompts/teammatePrompt.ts`

为非 Lead Agent 定制的系统提示词。

## 十、UI 组件

主要组件位置：`src/renderer/pages/team/`

| 文件                              | 功能              |
| --------------------------------- | ----------------- |
| `TeamPage.tsx`                    | 主页面容器        |
| `components/TeamCreateModal.tsx`  | 创建团队模态框    |
| `components/AddAgentModal.tsx`    | 添加 Agent 模态框 |
| `components/TeamTabs.tsx`         | Tab 切换组件      |
| `components/TeamChatView.tsx`     | 聊天视图          |
| `components/agentSelectUtils.tsx` | Agent 过滤工具    |
| `hooks/useTeamSession.ts`         | Session 管理 hook |
| `hooks/TeamTabsContext.tsx`       | Tab 上下文        |
| `hooks/useTeamList.ts`            | Team 列表数据     |

Agent 过滤逻辑（`agentSelectUtils.tsx`）：

```typescript
function filterTeamSupportedAgents(agents, cachedInitResults) {
  return agents.filter((a) => {
    const backend = a.presetAgentType || a.backend;
    return isTeamCapableBackend(backend, cachedInitResults);
  });
}
```

## 十一、关键发现：缺失的模型能力

### 数据层缺失

| 位置                  | 缺失内容                 |
| --------------------- | ------------------------ |
| `TeamAgent` 类型      | 没有 `model` 字段        |
| `AvailableAgent` 类型 | 没有 `model` 字段        |
| `ICreateTeamParams`   | 没有 `model` 参数        |
| `IAddTeamAgentParams` | 没有 `model` 参数        |
| `teams` DB 表         | agents JSON 中没有 model |

### 逻辑层缺失

| 位置                                  | 缺失内容                       |
| ------------------------------------- | ------------------------------ |
| Lead Prompt 推荐表                    | 只有 agent type，没有 model 列 |
| `team_spawn_agent` MCP 工具           | 没有 model 参数                |
| `TeamGuideMcpServer.handleCreateTeam` | 没有 model 选择逻辑            |
| `TeamSessionService`                  | 没有 model 传递链路            |

### UI 层缺失

| 位置              | 缺失内容                       |
| ----------------- | ------------------------------ |
| `TeamCreateModal` | 没有 model 选择器              |
| `AddAgentModal`   | 没有 model 选择器              |
| Agent 过滤逻辑    | 只过滤 team 能力，不过滤 model |

### 模型配置现有基础

- `src/common/config/storage.ts` 有 `TProviderWithModel` 定义
- `TeamSessionService.resolveDefaultGeminiModel` 已有 Gemini 模型解析逻辑
- `model.config` 中有启用的 providers 和模型列表
- 可作为模型枚举的基础复用

## 十二、总结

Team mode 功能架构完整（数据、IPC、MCP、UI、Prompt），但**模型选择能力完全缺失**。所有层级（类型定义、数据库、IPC 参数、MCP 工具、Prompt、UI）都需要扩展才能支持模型选择。好消息是模型配置系统已有基础，可以复用。
