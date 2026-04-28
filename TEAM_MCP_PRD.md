# AionUi Team MCP — 完整功能规格 (PRD)

**调研时间**: 2026-04-28  
**调研范围**: main 分支源码反推  
**版本**: v1.0

---

## 目录

1. [概览](#概览)
2. [Team 生命周期](#team-生命周期)
3. [MCP 注入链路](#mcp-注入链路)
4. [成员通信](#成员通信)
5. [前端 UI 流程](#前端-ui-流程)
6. [WebSocket 事件](#websocket-事件)
7. [前端 Hooks & 数据管理](#前端-hooks--数据管理)
8. [数据模型](#数据模型)

---

## 概览

**Team Mode** 是 AionUi 的多 Agent 协作框架，支持：
- 多个 Agent 同时活跃（leader + teammates）
- Agent 之间通过 mailbox 和 task board 进行异步通信
- MCP (Model Context Protocol) 作为 agent 的协调工具集
- 两种 workspace 模式：共享 (shared) 或隔离 (isolated)

**核心角色**：
- **Leader Agent**：主协调者，接收用户消息，可生成任务、派发工作
- **Teammate Agents**：执行者，通过 mailbox 接收任务，via MCP 工具与 leader 协调

**关键 API 层**：
- 前端 IPC Bridge → HTTP/WS 到 backend API
- Backend → Electron main process 的 Team MCP Server (TCP)
- Team MCP Server → Agent CLI 通过 stdio bridge

---

## Team 生命周期

### 1. Team 创建

**前端流程** (`src/renderer/pages/team/components/TeamCreateModal.tsx`):
- 用户填写：team name、leader agent、workspace folder
- 调用 `ipcBridge.team.create({ name, agents })` 
- 前端映射 agent 数据（via `teamMapper.ts`）到后端模型

**创建参数** (`src/common/adapter/teamMapper.ts`):
```
ICreateTeamParams = {
  name: string;
  agents: {
    agent_type: string;
    agent_name: string;
    conversation_type: string;
    conversation_id: string;
    role: 'leader' | 'teammate';
    model?: TProviderWithModel;
    cli_path?: string;
    custom_agent_id?: string;
  }[]
}
```

**数据模型** (`src/common/types/teamTypes.ts` 行 68-80):
```typescript
type TTeam = {
  id: string;
  user_id: string;
  name: string;
  workspace: string;
  workspace_mode: 'shared' | 'isolated';
  leader_agent_id: string;        // slot_id of leader
  agents: TeamAgent[];
  session_mode?: string;           // 'plan', 'auto' 等，新生成的 agent 继承
  created_at: number;
  updated_at: number;
};

type TeamAgent = {
  slot_id: string;                 // 运行时分配的唯一 slot ID
  conversation_id: string;         // 对应的 conversation 记录
  role: 'leader' | 'teammate';
  agent_type: string;              // 'claude', 'gemini', 'acp', etc
  agent_name: string;              // 用户可见名称
  conversation_type: string;       // 'acp', 'aionrs', 'codex', etc
  status: TeammateStatus;          // 'pending' | 'idle' | 'active' | 'completed' | 'failed'
  cli_path?: string;               // 自定义 CLI 路径
  custom_agent_id?: string;        // 自定义 agent ID
  model?: TProviderWithModel;      // 模型配置
};
```

**HTTP API** (`src/common/adapter/ipcBridge.ts` 行 1430-1436):
- POST `/api/teams` → 返回创建后的 TTeam 记录

**后端持久化** (`src/process/team/repository/SqliteTeamRepository.ts`):
- `teams` 表：存储 team 元数据 + agents JSON 列
- `mailbox` 表：agent 间消息
- `tasks` 表：共享任务板

---

### 2. Team 详情获取

**IPC API** (`src/common/adapter/ipcBridge.ts` 行 1443-1446):
```
team.get({ id: string }) → Promise<TTeam | null>
team.list({ user_id: string }) → Promise<TTeam[]>
```

**前端 hooks** (`src/renderer/pages/team/hooks/useTeamList.ts`):
- 使用 SWR 缓存：`useSWR('teams/{user_id}', ...)`
- 订阅 `ipcBridge.team.listChanged` WebSocket 事件自动刷新

---

### 3. Team 删除

**IPC API** (`src/common/adapter/ipcBridge.ts` 行 1447):
```
team.remove({ id: string }) → Promise<void>
```

---

### 4. Agent 加入/移除

#### 加入 (Runtime Spawn)

**IPC API** (`src/common/adapter/ipcBridge.ts` 行 1448-1454):
```
team.addAgent({
  team_id: string;
  agent: Omit<TeamAgent, 'slot_id'>
}) → Promise<TeamAgent>
```

**后端流程** (`src/process/team/TeammateManager.ts` 行 82-87):
- 添加到内存的 agents 列表
- 发射 IPC 事件：`ipcBridge.team.agentSpawned`
- 前端订阅此事件自动更新 UI

#### 移除

**IPC API** (`src/common/adapter/ipcBridge.ts` 行 1455-1457):
```
team.removeAgent({
  team_id: string;
  slot_id: string
}) → Promise<void>
```

**后端流程** (`src/process/team/mcp/team/TeamMcpServer.ts` 行 333-344):
- MCP `team_shutdown_agent` 工具触发 agent shutdown
- Agent 响应 "shutdown_approved" 后被移除
- 发射 IPC 事件：`ipcBridge.team.agentRemoved`

---

## MCP 注入链路

### 核心架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Electron Main Process                           │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ TeamSession (one per team)                                        │ │
│ │  - Owns: Mailbox, TaskManager, TeammateManager, TeamMcpServer    │ │
│ │  - startMcpServer() → TCP server on localhost:random             │ │
│ │  - getStdioConfig(agentSlotId) → injected into session/new       │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ TeamMcpServer (TCP server, src/process/team/mcp/team/)           │ │
│ │  - Listens on localhost + random port                            │ │
│ │  - Auth via one-time random token (crypto.randomUUID)            │ │
│ │  - Exposes MCP tools: team_send_message, team_spawn_agent, ...   │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                           ↓ (环境变量注入)
┌─────────────────────────────────────────────────────────────────────┐
│                    ACP Session (Agent Process)                       │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ stdio MCP Bridge (scripts/team-mcp-stdio.mjs)                    │ │
│ │  - 读环境变量：TEAM_MCP_PORT, TEAM_MCP_TOKEN, TEAM_AGENT_SLOT_ID │ │
│ │  - 连接到 TCP server                                             │ │
│ │  - 桥接 Claude CLI ↔ TCP                                         │ │
│ │  - 注册 MCP resources, tools, prompts                            │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 启动步骤

**1. 前端触发 Team 会话**  
(`src/renderer/pages/team/hooks/useTeamSession.ts` 行 31):
```typescript
await ipcBridge.team.ensureSession.invoke({ team_id: team.id })
```

**2. 后端创建 TeamSession**  
(`src/process/team/TeamSession.ts`):
- 构造函数初始化 Mailbox、TaskManager、TeammateManager
- 创建 TeamMcpServer 实例

**3. 启动 MCP TCP Server**  
(`src/process/team/TeamSession.ts` 行 79-84):
```typescript
async startMcpServer(): Promise<StdioMcpConfig> {
  if (!this.mcpStdioConfig) {
    this.mcpStdioConfig = await this.mcpServer.start();
  }
  return this.mcpStdioConfig;
}
```

(`src/process/team/mcp/team/TeamMcpServer.ts` 行 66-92):
- 创建 `net.Server` 监听 localhost:0（随机端口）
- 生成一次性认证 token: `crypto.randomUUID()`
- 发射 IPC 事件：`ipcBridge.team.mcpStatus.emit({ phase: 'tcp_ready', port })`

**4. 注入 MCP 配置到 ACP Session**  
(`src/process/team/TeamSession.ts` 行 87-92):
```typescript
getStdioConfig(agentSlotId?: string): StdioMcpConfig | null {
  if (!this.mcpStdioConfig) return null;
  if (!agentSlotId) return this.mcpStdioConfig;
  // 返回副本，agent slot_id 在 env 中
  return this.mcpServer.getStdioConfig(agentSlotId);
}
```

(`src/process/team/mcp/team/TeamMcpServer.ts` 行 100-117):
```typescript
getStdioConfig(agentSlotId?: string): StdioMcpConfig {
  return {
    name: `aionui-team-${team_id}`,
    command: 'node',
    args: ['/path/to/team-mcp-stdio.js'],
    env: [
      { name: 'TEAM_MCP_PORT', value: String(port) },
      { name: 'TEAM_MCP_TOKEN', value: authToken },
      { name: 'TEAM_AGENT_SLOT_ID', value: agentSlotId },  // 可选
    ]
  };
}
```

这个配置通过 `session/new { mcpServers }` 注入到 agent CLI 的启动命令。

**5. Agent 启动 stdio MCP Bridge**  
(`scripts/team-mcp-stdio.mjs`):
- 读环境变量
- 连接到 TCP server (validate auth token)
- 发送 `{ type: 'mcp_ready', from_slot_id: ... }` 通知 TCP server MCP 工具已就绪

**6. MCP 就绪同步** (`src/process/team/mcpReadiness.ts`):
- Team 创建 session 时调用 `waitForMcpReady(slot_id)`（30秒超时）
- stdio script 发送 `mcp_ready` 后，TCP 服务器调用 `notifyMcpReady(slot_id)`
- `waitForMcpReady()` 返回，保证第一条用户消息前 MCP 工具已就绪

### MCP 状态事件

**发射时机** (`src/process/team/mcp/team/TeamMcpServer.ts` 行 86, 91):

| Phase | 触发条件 |
|-------|---------|
| `tcp_ready` | TCP server 成功启动在某个端口 |
| `tcp_error` | TCP server 启动失败 |
| `session_injecting` | (保留) |
| `session_ready` | (保留) |
| `session_error` | (保留) |
| `mcp_tools_ready` | stdio bridge 连接成功且发送 mcp_ready |
| `mcp_tools_waiting` | 等待中 |
| `degraded` | (保留) |
| `load_failed` | (保留) |
| `config_write_failed` | (保留) |

**IPC 事件** (`src/common/types/teamTypes.ts` 行 140-147):
```typescript
type ITeamMcpStatusEvent = {
  team_id: string;
  slot_id?: string;          // 可选：具体 agent
  phase: TeamMcpPhase;
  server_count?: number;
  port?: number;
  error?: string;
};
```

**WebSocket 路由**: `team.mcp.status`

---

## 成员通信

### 1. 群聊（Leader 接收用户消息）

**前端** (`src/renderer/pages/team/hooks/useTeamSession.ts` 行 65-70):
```typescript
const sendMessage = useCallback(
  async (content: string) => {
    await ipcBridge.team.sendMessage.invoke({ team_id: team.id, content });
  },
  [team.id]
);
```

**HTTP API** (`src/common/adapter/ipcBridge.ts` 行 1458-1461):
```
POST /api/teams/{team_id}/messages
Body: { content: string; files?: string[] }
```

**后端流程** (`src/process/team/TeamSession.ts` 行 112-149):
1. 调用 `startMcpServer()` 确保 MCP 已启动
2. 找到 leader agent (`team.leader_agent_id`)
3. 写入 mailbox：`{ from_agent_id: 'user', to_agent_id: leader_slot_id, content }`
4. 在 leader 的 conversation 中添加用户气泡 (`addMessage()`)
5. 发射 WebSocket 事件：`ipcBridge.conversation.responseStream.emit({ type: 'user_content', ... })`
6. 调用 `wakeAfterAcceptedDelivery(leader_slot_id, 'team')`

### 2. 单聊（Agent 间通信）

**MCP 工具** (`src/process/team/mcp/team/TeamMcpServer.ts` 行 245-246):
```
tool_name: 'team_send_message'
args: { to: string; message: string; summary?: string }
```

**实现** (`src/process/team/mcp/team/TeamMcpServer.ts` 行 280-314):

**广播** (to = '*'):
- 遍历所有 teammate
- 为每个 teammate 写入 mailbox（跳过 sender）
- 调用 `safeWake()` 唤醒各个 teammate

**单播** (to = agent_name 或 slot_id):
- 调用 `resolveSlotId()` 模糊匹配（normalize name）
- 查找 target slot_id
- 写入 mailbox
- 调用 `safeWake(target_slot_id)`

**特殊处理：Shutdown**:
- 若消息为 "shutdown_approved"：从 team 移除该 agent
- 若消息为 "shutdown_rejected:reason"：记录拒绝原因

### 3. Mailbox 持久化

**接口** (`src/process/team/Mailbox.ts`):
```typescript
write(params: {
  team_id: string;
  to_agent_id: string;
  from_agent_id: string;
  content: string;
  type?: 'message' | 'idle_notification' | 'shutdown_request';
  summary?: string;
  files?: string[];
}) → Promise<MailboxMessage>

readUnread(team_id: string, agentId: string) 
  → Promise<MailboxMessage[]>  // 原子标记为已读

getHistory(team_id: string, agentId: string, limit?)
  → Promise<MailboxMessage[]>  // 最新优先
```

**数据模型** (`src/process/team/types.ts` 行 21-32):
```typescript
type MailboxMessage = {
  id: string;
  team_id: string;
  to_agent_id: string;
  from_agent_id: string;
  type: 'message' | 'idle_notification' | 'shutdown_request';
  content: string;
  summary?: string;
  files?: string[];
  read: boolean;
  created_at: number;
};
```

---

## 前端 UI 流程

### 1. Team 页面结构

**路由** (`src/renderer/pages/team/index.tsx`):
- `/team/{team_id}` → TeamPage 组件

**页面布局** (`src/renderer/pages/team/TeamPage.tsx`):
- 上方：Team 信息栏（名称、MCP 状态徽章）
- 左侧：Agent 选项卡 (Tabs)
- 中央：选中 Agent 的聊天区域 (ChatLayout)
  - 聊天消息列表 (MessageList via AcpChat / AionrsChat / etc)
  - 发送框 (SendBox，路由到 `team.sendMessage` 或 `team.sendMessageToAgent`)

### 2. Agent 选项卡 (TeamTabs)

**组件** (`src/renderer/pages/team/components/TeamTabs.tsx`):
- 为每个 agent 渲染一个 tab
- 点击 tab 切换活跃 agent（localStorage: `team-active-slot-{team_id}` 记录)
- Tab 标题显示：agent name + status badge（idle/active/failed）

**状态 Badge** (`src/renderer/pages/team/components/AgentStatusBadge.tsx`):
- 'idle' → 灰色
- 'active' → 蓝色加载动画
- 'failed' → 红色

### 3. 单个 Agent 聊天区域

**组件** (`src/renderer/pages/team/components/TeamChatView.tsx`):
- 根据 conversation type 路由到对应平台的 Chat 组件
  - `acp` / `codex` → AcpChat
  - `aionrs` → AionrsTeamChat
  - 其他 → NanobotChat / RemoteChat
- Props: `{ conversation, team_id, agentSlotId, hideSendBox? }`
- 若传 `team_id`，SendBox 调用 `ipcBridge.team.sendMessage`（群聊）
- 若同时传 `agentSlotId`，SendBox 调用 `ipcBridge.team.sendMessageToAgent`（单聊）

**聊天平台集成**：
- AcpChat / AionrsChat 等负责具体的聊天交互
- 它们接收 `team_id` 和 `agentSlotId`，路由消息发送

### 4. Team 创建 Modal

**触发**: 用户点击"+ New Team"

**步骤**:
1. 填写 team name
2. 选择 leader agent
   - 动态过滤：只显示 team-capable 的 agent（检查 `isTeamCapableBackend()`）
   - 按 CLI agents 和 preset assistants 分组
3. 选择 workspace 文件夹
4. 点击"Create"
   - 调用 `ipcBridge.team.create()`
   - 前端映射数据（agent_type、conversation_type、model 解析）
   - 成功后回调 `onCreated(team)` 刷新列表

---

## WebSocket 事件

### 事件列表

**订阅 URL**: 所有事件通过 WebSocket 连接（channel 前缀为 `team.*`）

| 事件 | 类型 | 触发条件 |
|------|------|---------|
| `team.agent.status` | `ITeamAgentStatusEvent` | Agent 状态变更（pending→idle, idle→active, etc） |
| `team.agent.spawned` | `ITeamAgentSpawnedEvent` | 新 agent runtime 加入 team |
| `team.agent.removed` | `ITeamAgentRemovedEvent` | Agent 被移除 |
| `team.agent.renamed` | `ITeamAgentRenamedEvent` | Agent 被重命名 |
| `team.list-changed` | `ITeamListChangedEvent` | Team 创建/删除/agent 变更 |
| `team.mcp.status` | `ITeamMcpStatusEvent` | MCP 注入各阶段状态 |

### 事件数据模型

**ITeamAgentStatusEvent** (`src/common/types/teamTypes.ts` 行 83-88):
```typescript
{
  team_id: string;
  slot_id: string;
  status: 'pending' | 'idle' | 'active' | 'completed' | 'failed';
  last_message?: string;           // 可选：状态摘要或错误信息
}
```

**ITeamAgentSpawnedEvent** (`src/common/types/teamTypes.ts` 行 91-94):
```typescript
{
  team_id: string;
  agent: TeamAgent;                // 完整 agent 记录
}
```

**ITeamAgentRemovedEvent** (`src/common/types/teamTypes.ts` 行 97-100):
```typescript
{
  team_id: string;
  slot_id: string;
}
```

**ITeamAgentRenamedEvent** (`src/common/types/teamTypes.ts` 行 103-108):
```typescript
{
  team_id: string;
  slot_id: string;
  old_name: string;
  new_name: string;
}
```

**ITeamListChangedEvent** (`src/common/types/teamTypes.ts` 行 111-114):
```typescript
{
  team_id: string;
  action: 'created' | 'removed' | 'agent_added' | 'agent_removed';
}
```

**ITeamMcpStatusEvent** (`src/common/types/teamTypes.ts` 行 140-147):
```typescript
{
  team_id: string;
  slot_id?: string;
  phase: TeamMcpPhase;             // 见上文 MCP 状态表
  server_count?: number;
  port?: number;
  error?: string;
}
```

### 前端订阅模式

**useTeamSession** (`src/renderer/pages/team/hooks/useTeamSession.ts` 行 30-62):
```typescript
useEffect(() => {
  // 状态变化
  const unsubStatus = ipcBridge.team.agentStatusChanged.on((event) => {
    if (event.team_id !== team.id) return;
    setStatusMap((prev) => {
      const next = new Map(prev);
      next.set(event.slot_id, { slot_id, status, last_message });
      return next;
    });
  });

  // Agent 生成
  const unsubSpawned = ipcBridge.team.agentSpawned.on((event) => {
    if (event.team_id !== team.id) return;
    void mutateTeam();  // 刷新 team 列表
  });

  // Agent 移除
  const unsubRemoved = ipcBridge.team.agentRemoved.on((event) => {
    if (event.team_id !== team.id) return;
    void mutateTeam();
  });

  // Agent 重命名
  const unsubRenamed = ipcBridge.team.agentRenamed.on((event) => {
    if (event.team_id !== team.id) return;
    void mutateTeam();
  });

  return () => { unsubStatus(); unsubSpawned(); unsubRemoved(); unsubRenamed(); };
}, [team.id, mutateTeam]);
```

**useTeamList** (`src/renderer/pages/team/hooks/useTeamList.ts` 行 19-23):
```typescript
useEffect(() => {
  return ipcBridge.team.listChanged.on(() => {
    void mutate();  // 刷新 team 列表
  });
}, [mutate]);
```

---

## 前端 Hooks & 数据管理

### 核心 Hooks

#### useTeamSession(team: TTeam)

**位置**: `src/renderer/pages/team/hooks/useTeamSession.ts`

**返回值**:
```typescript
{
  statusMap: Map<string, { slot_id, status, last_message? }>;
  sendMessage(content: string): Promise<void>;
  addAgent(agent: Omit<TeamAgent, 'slot_id'>): Promise<void>;
  renameAgent(slot_id: string, new_name: string): Promise<void>;
  removeAgent(slot_id: string): Promise<void>;
  mutateTeam(): Promise<void>;  // 刷新 team 记录
}
```

**行为**:
- 监听 4 个 WebSocket 事件（status, spawned, removed, renamed）
- 维护内存中的 statusMap（agent 状态快照）
- 提供 CRUD 操作代理

#### useTeamList()

**位置**: `src/renderer/pages/team/hooks/useTeamList.ts`

**返回值**:
```typescript
{
  teams: TTeam[];
  mutate(): Promise<void>;
  removeTeam(id: string): Promise<void>;
}
```

**行为**:
- SWR 缓存 key: `teams/{user_id}`
- 监听 `ipcBridge.team.listChanged` 自动刷新
- 移除后清除 localStorage（`team-active-slot-{id}`）

### 状态管理

**Team 上下文** (`src/renderer/pages/team/hooks/TeamTabsContext.tsx`):
- 选中的 agent slot_id
- 全屏模式标志

**Permission 上下文** (`src/renderer/pages/team/hooks/TeamPermissionContext.tsx`):
- 用户对 team 的权限（create/edit/delete）

---

## 数据模型

### 核心类型

**src/common/types/teamTypes.ts**:

```typescript
// Role 和 Status
type TeammateRole = 'leader' | 'teammate';
type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed';
type WorkspaceMode = 'shared' | 'isolated';

// 单个 Agent 配置
type TeamAgent = {
  slot_id: string;                 // 运行时唯一标识
  conversation_id: string;
  role: TeammateRole;
  agent_type: string;              // 'claude', 'gemini', 'acp', etc
  agent_name: string;              // 用户显示名称
  conversation_type: string;       // 'acp', 'aionrs', 'codex', etc
  status: TeammateStatus;
  cli_path?: string;
  custom_agent_id?: string;
  model?: TProviderWithModel;      // 模型配置
};

// 完整 Team 记录
type TTeam = {
  id: string;
  user_id: string;
  name: string;
  workspace: string;               // 工作目录路径
  workspace_mode: WorkspaceMode;   // 'shared' or 'isolated'
  leader_agent_id: string;         // 指向 agents[*].slot_id
  agents: TeamAgent[];
  session_mode?: string;           // 'plan', 'auto', etc
  created_at: number;
  updated_at: number;
};

// MCP 状态
type TeamMcpPhase =
  | 'tcp_ready'
  | 'tcp_error'
  | 'session_injecting'
  | 'session_ready'
  | 'session_error'
  | 'load_failed'
  | 'degraded'
  | 'config_write_failed'
  | 'mcp_tools_waiting'
  | 'mcp_tools_ready';
```

**src/process/team/types.ts** (Process-only 类型):

```typescript
// Mailbox 消息
type MailboxMessage = {
  id: string;
  team_id: string;
  to_agent_id: string;
  from_agent_id: string;
  type: 'message' | 'idle_notification' | 'shutdown_request';
  content: string;
  summary?: string;
  files?: string[];
  read: boolean;
  created_at: number;
};

// 共享任务板
type TeamTask = {
  id: string;
  team_id: string;
  subject: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'deleted';
  owner?: string;                  // slot_id
  blocked_by: string[];            // task ids
  blocks: string[];                // task ids
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
};

// Idle 通知（agent 发送）
type IdleNotification = {
  type: 'idle_notification';
  idle_reason: 'available' | 'interrupted' | 'failed';
  summary: string;
  completed_task_id?: string;
  failure_reason?: string;
};
```

### 数据库模式

**SQLite 表** (`src/process/team/repository/SqliteTeamRepository.ts`):

```sql
-- Team 元数据
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  workspace TEXT NOT NULL,
  workspace_mode TEXT NOT NULL,        -- 'shared' or 'isolated'
  lead_agent_id TEXT NOT NULL,         -- slot_id
  agents TEXT NOT NULL,                -- JSON array
  session_mode TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Mailbox 消息
CREATE TABLE mailbox (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  to_agent_id TEXT NOT NULL,
  from_agent_id TEXT NOT NULL,
  type TEXT NOT NULL,                  -- 'message' | 'idle_notification' | ...
  content TEXT NOT NULL,
  summary TEXT,
  files TEXT,                          -- JSON array
  read INTEGER NOT NULL,               -- 0 or 1
  created_at INTEGER NOT NULL
);

-- 共享任务板
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,                -- 'pending' | 'in_progress' | 'completed' | 'deleted'
  owner TEXT,                          -- slot_id
  blocked_by TEXT NOT NULL,            -- JSON array
  blocks TEXT NOT NULL,                -- JSON array
  metadata TEXT NOT NULL,              -- JSON object
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## IPC Bridge API 完整契约

### REST API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/teams` | 创建 Team |
| GET | `/api/teams?user_id=...` | 列出用户的所有 Team |
| GET | `/api/teams/{id}` | 获取 Team 详情 |
| DELETE | `/api/teams/{id}` | 删除 Team |
| POST | `/api/teams/{team_id}/session` | 启动/确保 Team 会话（MCP） |
| DELETE | `/api/teams/{team_id}/session` | 停止 Team 会话 |
| POST | `/api/teams/{team_id}/messages` | 群聊（user → leader） |
| POST | `/api/teams/{team_id}/agents` | 添加 Agent |
| DELETE | `/api/teams/{team_id}/agents/{slot_id}` | 移除 Agent |
| POST | `/api/teams/{team_id}/agents/{slot_id}/messages` | 单聊（user → specific agent） |
| PATCH | `/api/teams/{team_id}/agents/{slot_id}/name` | 重命名 Agent |
| PATCH | `/api/teams/{id}/name` | 重命名 Team |
| POST | `/api/teams/{team_id}/session-mode` | 设置 session 权限模式 |
| POST | `/api/teams/{team_id}/workspace` | 更新 workspace |

### MCP 工具（via TCP）

| 工具名 | 参数 | 返回 | 说明 |
|--------|------|------|------|
| `team_send_message` | `{ to: string; message: string; summary?: string }` | `string` | 单聊或广播 |
| `team_spawn_agent` | `{ agent_type: string; agent_name: string; ... }` | `TeamAgent` | 运行时生成新 agent |
| `team_task_create` | `{ subject: string; description?: string; ... }` | `TeamTask` | 创建任务 |
| `team_task_update` | `{ id: string; status?: string; owner?: string; ... }` | `string` | 更新任务 |
| `team_task_list` | `{}` | `TeamTask[]` | 列出任务 |
| `team_members` | `{}` | `TeamAgent[]` | 列出 team 成员 |
| `team_rename_agent` | `{ agent: string; new_name: string }` | `string` | 重命名 agent（agent 参数支持 name 或 slot_id 模糊匹配） |
| `team_shutdown_agent` | `{ agent: string }` | `string` | 请求 agent shutdown（agent 参数支持 name 或 slot_id 模糊匹配） |
| `team_describe_assistant` | `{ assistant_id: string }` | `string` | 获取 assistant 描述 |
| `team_list_models` | `{ backend: string }` | `string` | 列出 backend 支持的模型 |

---

## 关键文件索引

### 前端

| 文件 | 行号范围 | 功能 |
|------|---------|------|
| `src/renderer/pages/team/TeamPage.tsx` | 1-200+ | Team 页面主组件，布局 agent 选项卡 + 聊天区 |
| `src/renderer/pages/team/components/TeamCreateModal.tsx` | 1-150+ | Team 创建 Modal，agent 选择器 |
| `src/renderer/pages/team/components/TeamChatView.tsx` | 1-120+ | 平台路由（ACP/Aionrs/etc）聊天区 |
| `src/renderer/pages/team/components/TeamTabs.tsx` | - | Agent tab 组件 |
| `src/renderer/pages/team/components/AgentStatusBadge.tsx` | - | 状态徽章显示 |
| `src/renderer/pages/team/hooks/useTeamSession.ts` | 1-97 | 核心 hook：session 生命周期 + 事件监听 |
| `src/renderer/pages/team/hooks/useTeamList.ts` | 1-35 | Team 列表 hook + 刷新 |
| `src/renderer/pages/team/hooks/TeamTabsContext.tsx` | - | 选中 tab 状态上下文 |

### 后端（Electron Main）

| 文件 | 行号范围 | 功能 |
|------|---------|------|
| `src/process/team/TeamSession.ts` | 1-150+ | Team 会话协调：mailbox + mcp + teammates |
| `src/process/team/mcp/team/TeamMcpServer.ts` | 1-400+ | TCP MCP 服务器：工具处理 |
| `src/process/team/TeammateManager.ts` | 1-120+ | Agent 生命周期 + wake/状态转换 |
| `src/process/team/Mailbox.ts` | 1-52 | Mailbox 接口 |
| `src/process/team/TaskManager.ts` | - | 任务板 CRUD |
| `src/process/team/mcpReadiness.ts` | 1-50 | MCP 就绪同步机制 |
| `src/process/team/repository/SqliteTeamRepository.ts` | 1-100+ | SQLite 数据库操作 |
| `src/process/team/prompts/buildRolePrompt.ts` | - | 为 agent 生成角色提示词 |

### 类型定义

| 文件 | 功能 |
|------|------|
| `src/common/types/teamTypes.ts` | 前后端共享类型 |
| `src/process/team/types.ts` | Process-only 类型（mailbox, task 等） |
| `src/common/adapter/teamMapper.ts` | 前后端数据映射 |
| `src/common/adapter/ipcBridge.ts` 行 1429-1490 | IPC Bridge team API |

---

## 部署注意事项

### 后端 API 需求

Backend 必须实现以下路由及 WebSocket 事件转发：

1. **REST 端点** 详见上方 IPC Bridge API 表
2. **WebSocket 事件转发** 从 Electron main process 转发给前端客户端
   - `team.agent.status`
   - `team.agent.spawned`
   - `team.agent.removed`
   - `team.agent.renamed`
   - `team.list-changed`
   - `team.mcp.status`

### 性能考虑

- **Mailbox** 消息表可能快速增长，建议定期归档
- **Task 板** 元数据存 JSON，未来可考虑规范化
- **MCP TCP** 连接理论上每 team 一个，不会过多

### 扩展点

- **自定义 MCP 工具**：扩展 `TeamMcpServer.handleToolCall()`
- **Agent 状态机**：扩展 `TeammateManager.setStatus()`
- **Workspace 隔离**：当前支持 `shared` 和 `isolated` 模式，可添加更多模式

---

## 已知限制 & TODOs

1. **Team 级别权限**: 当前无 RBAC，所有 teammate 可调用所有 MCP 工具
2. **Agent 超时处理**: `waitForMcpReady()` 硬 30 秒超时，可优化
3. **消息搜索**: Mailbox 无索引，大量消息查询性能堪忧
4. **Workspace 同步**: `shared` 模式下多 agent 并发写入可能冲突

---

## 版本历史

- **v1.0** (2026-04-28): 初版，从 main 分支反推完成

---

**反推完成日期**: 2026-04-28  
**调研负责人**: AI Agent (Claude)  
**下一步**: 对照本 PRD 进行回归测试 + 前后端联调验证
