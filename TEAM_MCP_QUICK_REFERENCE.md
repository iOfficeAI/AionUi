# Team MCP 快速参考卡

**生成日期**: 2026-04-28  
**快速链接**: [完整 PRD](./TEAM_MCP_PRD.md) | [验证清单](./TEAM_MCP_VERIFICATION_CHECKLIST.md)

---

## 架构速览

```
┌─────────────────────────────────────────────────────────────┐
│ 前端 (Renderer)                                              │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ useTeamSession() / useTeamList()                     │   │
│ │ TeamPage → AgentTabs + ChatView                      │   │
│ │ 订阅: team.agent.status, team.agent.spawned, ...    │   │
│ └──────────────────────────────────────────────────────┘   │
│            ↓ (ipcBridge.team.* → HTTP/WS)                   │
├─────────────────────────────────────────────────────────────┤
│ Backend API (aionui-backend)                                 │
│ POST /api/teams, GET /api/teams/{id}, ...                   │
│ 转发 WebSocket 事件到前端                                    │
│            ↓ (IPC / Direct Call)                            │
├─────────────────────────────────────────────────────────────┤
│ 后端 (Main Process)                                          │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ TeamSession                                          │   │
│ │  ├─ Mailbox (SQLite)                               │   │
│ │  ├─ TaskManager (SQLite)                           │   │
│ │  ├─ TeammateManager (agent lifecycle)              │   │
│ │  └─ TeamMcpServer (TCP @ localhost:random)         │   │
│ └──────────────────────────────────────────────────────┘   │
│            ↓ (TCP + env vars)                               │
├─────────────────────────────────────────────────────────────┤
│ Agent Process                                                │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ stdio-mcp-bridge                                     │   │
│ │  - read: TEAM_MCP_PORT, TEAM_MCP_TOKEN             │   │
│ │  - connect to TCP server                            │   │
│ │  - expose MCP tools                                 │   │
│ │  - send: mcp_ready notification                     │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心数据流

### 1️⃣ 用户群聊 (User → Leader)

```
前端:   ipcBridge.team.sendMessage({ team_id, content })
  ↓
HTTP:   POST /api/teams/{team_id}/messages
  ↓
主进程: TeamSession.sendMessage()
  ├─ Ensure MCP server started
  ├─ Write to leader's mailbox
  ├─ Add user bubble to leader's conversation
  ├─ Emit WebSocket: message.stream (type=user_content)
  └─ Wake leader agent
  ↓
前端:   Subscribe conversation.responseStream → show bubble
```

### 2️⃣ Agent 单聊 (Agent → Agent)

```
Agent:  Call MCP tool: team_send_message
        { to: "agent_name", message: "...", summary?: "..." }
  ↓
TCP:    Validate auth token → handleToolCall()
  ↓
主进程: 
  ├─ resolveSlotId(to) → match target slot_id
  ├─ Write to target's mailbox
  ├─ Call safeWake(target_slot_id)
  └─ Return success
  ↓
目标:   Next wake() → readUnread() → process messages
```

### 3️⃣ MCP 就绪同步

```
启动:   ipcBridge.team.ensureSession({ team_id })
  ↓
主进程: TeamSession.startMcpServer()
  ├─ Create net.Server on localhost:0
  ├─ Generate random auth token (UUID)
  ├─ Emit: team.mcp.status (phase=tcp_ready, port)
  └─ Return StdioMcpConfig with env vars
  ↓
注入:   session/new { mcpServers: [{ name, command, args, env }] }
  ├─ env: TEAM_MCP_PORT={port}
  ├─ env: TEAM_MCP_TOKEN={token}
  └─ env: TEAM_AGENT_SLOT_ID={slot_id}
  ↓
Agent:  stdio-mcp-bridge.js
  ├─ Read env vars
  ├─ Connect to localhost:{TEAM_MCP_PORT}
  ├─ Validate {TEAM_MCP_TOKEN}
  ├─ Register MCP tools (in Claude CLI)
  └─ Send: { type: 'mcp_ready', from_slot_id }
  ↓
主进程: handleTcpConnection()
  └─ Receive mcp_ready → notifyMcpReady(slot_id)
  ↓
同步:   waitForMcpReady(slot_id) 解除 (30s timeout)
```

---

## MCP 工具速查

| 工具 | 调用者 | 参数 | 用途 |
|------|--------|------|------|
| `team_send_message` | Agent | `{to, message, summary?}` | 单聊/广播 |
| `team_spawn_agent` | Leader | `{agent_type, agent_name, ...}` | 运行时添加 agent |
| `team_task_create` | Agent | `{subject, description?, metadata?}` | 创建任务 |
| `team_task_update` | Agent | `{id, status?, owner?, ...}` | 更新任务 |
| `team_task_list` | Agent | `{}` | 查看任务 |
| `team_members` | Agent | `{}` | 查看成员 |
| `team_rename_agent` | Leader | `{slot_id, new_name}` | 重命名 agent |
| `team_shutdown_agent` | Agent | `{slot_id}` | 请求 shutdown |
| `team_describe_assistant` | Agent | `{assistant_id}` | 查询 assistant |
| `team_list_models` | Agent | `{backend}` | 列模型 |

---

## IPC Bridge API 速查

### REST 端点

```typescript
// Team CRUD
POST   /api/teams                           // 创建
GET    /api/teams?user_id=...               // 列表
GET    /api/teams/{id}                      // 详情
DELETE /api/teams/{id}                      // 删除
PATCH  /api/teams/{id}/name                 // 重命名

// Session 控制
POST   /api/teams/{team_id}/session         // 启动/确保 MCP
DELETE /api/teams/{team_id}/session         // 停止

// 消息
POST   /api/teams/{team_id}/messages        // 群聊 (user → leader)
POST   /api/teams/{team_id}/agents/{slot_id}/messages  // 单聊

// Agent 管理
POST   /api/teams/{team_id}/agents          // 添加
DELETE /api/teams/{team_id}/agents/{slot_id}           // 移除
PATCH  /api/teams/{team_id}/agents/{slot_id}/name      // 重命名

// 配置
POST   /api/teams/{team_id}/session-mode    // 设置权限模式
POST   /api/teams/{team_id}/workspace       // 更新 workspace
```

### WebSocket 事件

```typescript
// 订阅频道
'team.agent.status'       // Agent 状态变更
'team.agent.spawned'      // 新 agent 加入
'team.agent.removed'      // Agent 被移除
'team.agent.renamed'      // Agent 被重命名
'team.list-changed'       // Team 列表变更
'team.mcp.status'         // MCP 状态更新
```

---

## 关键类型

```typescript
// Team 基本信息
type TTeam = {
  id: string;
  user_id: string;
  name: string;
  workspace: string;                      // 工作目录
  workspace_mode: 'shared' | 'isolated';
  leader_agent_id: string;                // 指向 agents[*].slot_id
  agents: TeamAgent[];
  session_mode?: string;                  // 'plan', 'auto', etc
  created_at: number;
  updated_at: number;
};

// 单个 Agent
type TeamAgent = {
  slot_id: string;                        // 运行时唯一 ID
  conversation_id: string;                // 对应聊天记录
  role: 'leader' | 'teammate';
  agent_type: string;                     // 'claude', 'gemini', 'acp'
  agent_name: string;                     // 用户显示名称
  conversation_type: string;              // 'acp', 'aionrs', 'codex'
  status: 'pending' | 'idle' | 'active' | 'completed' | 'failed';
  model?: TProviderWithModel;
};

// Mailbox 消息
type MailboxMessage = {
  id: string;
  team_id: string;
  to_agent_id: string;
  from_agent_id: string;                  // 'user' | slot_id
  type: 'message' | 'idle_notification' | 'shutdown_request';
  content: string;
  read: boolean;
  created_at: number;
};

// 共享任务
type TeamTask = {
  id: string;
  team_id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed' | 'deleted';
  owner?: string;                         // slot_id
  blocked_by: string[];                   // task dependencies
  blocks: string[];
  metadata: Record<string, unknown>;
  created_at: number;
};
```

---

## 前端 Hook 快速用法

```typescript
// 获取 Team 列表
const { teams, mutate, removeTeam } = useTeamList();

// 管理单个 Team 的会话
const { statusMap, sendMessage, addAgent, renameAgent, removeAgent, mutateTeam } 
  = useTeamSession(team);

// 监听 Agent 状态
useEffect(() => {
  return ipcBridge.team.agentStatusChanged.on((event: ITeamAgentStatusEvent) => {
    if (event.team_id !== team.id) return;
    // Handle status change: event.status, event.last_message
  });
}, [team.id]);

// 监听 Team 列表变更
useEffect(() => {
  return ipcBridge.team.listChanged.on(() => {
    void mutate();  // Refresh list
  });
}, [mutate]);
```

---

## 源码导航

### 前端关键文件

| 路径 | 功能 |
|------|------|
| `src/renderer/pages/team/TeamPage.tsx` | 主页面组件 |
| `src/renderer/pages/team/hooks/useTeamSession.ts` | 核心 hook |
| `src/renderer/pages/team/hooks/useTeamList.ts` | 列表 hook |
| `src/renderer/pages/team/components/TeamCreateModal.tsx` | 创建 Modal |
| `src/renderer/pages/team/components/TeamChatView.tsx` | 聊天视图 |
| `src/renderer/pages/team/components/TeamTabs.tsx` | Agent tabs |

### 后端关键文件

| 路径 | 功能 |
|------|------|
| `src/process/team/TeamSession.ts` | Team 协调核心 |
| `src/process/team/mcp/team/TeamMcpServer.ts` | MCP TCP 服务器 |
| `src/process/team/TeammateManager.ts` | Agent 生命周期 |
| `src/process/team/Mailbox.ts` | Mailbox 接口 |
| `src/process/team/TaskManager.ts` | 任务板 |
| `src/process/team/mcpReadiness.ts` | 就绪同步 |
| `src/process/team/repository/SqliteTeamRepository.ts` | 数据库 |

### 类型定义

| 路径 | 内容 |
|------|------|
| `src/common/types/teamTypes.ts` | 前后端共享类型 |
| `src/process/team/types.ts` | Process-only 类型 |
| `src/common/adapter/teamMapper.ts` | 数据映射 |
| `src/common/adapter/ipcBridge.ts` (L1429+) | IPC Bridge API |

---

## 常见问题速答

### Q: Agent 为什么收不到消息?
A: 检查 mailbox 是否写入 → wake() 是否被调用 → agent process 是否还活着

### Q: MCP 工具调不了?
A: 检查 TCP 连接是否建立 → auth token 是否正确 → mcp_ready 是否发送

### Q: Agent 状态不更新?
A: 检查 WebSocket 连接 → team.agent.status 事件是否广播 → 前端订阅是否正确

### Q: 新 Agent 不显示?
A: 检查 team.agent.spawned 事件 → useTeamSession mutateTeam() 是否执行

### Q: 消息顺序错乱?
A: mailbox 表无显式排序，需在查询时 ORDER BY created_at DESC

---

## 性能基准 (目标值)

- 用户消息 → leader 感知: **< 1s**
- Team 列表加载 (50 teams): **< 500ms**
- MCP TCP 连接建立: **< 500ms**
- Agent 唤醒 (含 IPC): **< 2s**

---

## 部署检查清单

- [ ] Backend 实现所有 18 个 REST 端点
- [ ] Backend 转发 6 个 WebSocket 事件
- [ ] SQLite 数据库已创建（teams, mailbox, tasks 表）
- [ ] stdio-mcp-bridge.js 脚本部署
- [ ] Team MCP TCP server 可在 localhost 上启动
- [ ] IPC Bridge 正确映射所有 API

---

**最后更新**: 2026-04-28  
**维护人**: Team Lead  
**文档版本**: v1.0-quickref
