# Team MCP 通信协议文档

## 概述

本文档详细描述 AionUi Team 模式的完整通信协议栈，从 HTTP API 契约到 WebSocket 事件、MCP TCP 协议的全链路设计。

**通信架构层次：**
```
┌─────────────────────────────────────────────────────────────┐
│ 前端 (Renderer)                                              │
│ - ipcBridge 调用层 (HTTP/WS)                               │
├─────────────────────────────────────────────────────────────┤
│ HTTP REST API + WebSocket                                    │
│ 基础 URL: http://127.0.0.1:{port}                          │
│ WS URL: ws://127.0.0.1:{port}/ws                           │
├─────────────────────────────────────────────────────────────┤
│ 后端 (Electron Main Process)                                │
│ - Team Manager / Session Manager                            │
│ - Team MCP Server (TCP 127.0.0.1:{dynamic})                │
├─────────────────────────────────────────────────────────────┤
│ Agent (Claude CLI)                                           │
│ - stdio bridge (team-mcp-stdio.js)                          │
│ - MCP Tool 调用                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. HTTP API 契约

### 1.1 Team CRUD

#### POST /api/teams
创建新团队，初始化其 agents。

**Request:**
```json
{
  "name": string,
  "agents": [
    {
      "agent_name": string,
      "role": "lead" | "teammate",  // 注: 前端用 "leader"，后端映射为 "lead"
      "backend": "acp" | "codex" | "gemini" | "claude" | "aionrs",
      "model": string,                // 如 "default"
      "custom_agent_id"?: string      // 预设 assistant ID
    }
  ]
}
```

**Response:**
```json
{
  "id": string,
  "user_id": string,
  "name": string,
  "workspace": string,
  "workspace_mode": "shared" | "isolated",
  "leader_agent_id": string,
  "agents": [
    {
      "slot_id": string,              // 团队内唯一的 agent 标识
      "conversation_id": string,      // ACP session 对应的 conversation_id
      "role": "leader" | "teammate",
      "agent_type": string,
      "agent_name": string,
      "conversation_type": "acp" | "codex",
      "status": "pending" | "idle" | "active" | "completed" | "failed",
      "cli_path"?: string,
      "custom_agent_id"?: string,
      "model"?: string
    }
  ],
  "session_mode"?: string,            // 权限模式，如 "plan"、"auto"
  "created_at": number,
  "updated_at": number
}
```

**HTTP: 200 OK**

**错误情况：**
- `400` - 无效的 agent_type（不支持 team mode）
- `409` - workspace 冲突

---

#### GET /api/teams?user_id=:user_id
获取用户的所有团队。

**Response:**
```json
[
  { /* 见 POST 响应 */ }
]
```

---

#### GET /api/teams/:id
获取单个团队。

**Response:**
```json
{ /* 见 POST 响应 */ }
```

**错误情况：**
- `404` - 团队不存在

---

#### DELETE /api/teams/:id
删除团队及其所有 agents。

**Response:** 204 No Content

---

### 1.2 Agent 生命周期

#### POST /api/teams/:team_id/agents
添加新 agent 到现有团队。

**Request:**
```json
{
  "agent_name": string,
  "role": "lead" | "teammate",
  "backend": string,
  "model": string,
  "custom_agent_id"?: string
}
```

**Response:** 返回新创建的 TeamAgent（见 POST /api/teams 的 agents 数组元素）

---

#### DELETE /api/teams/:team_id/agents/:slot_id
从团队移除 agent。

**Response:** 204 No Content

---

#### PATCH /api/teams/:team_id/agents/:slot_id/name
重命名 agent。

**Request:**
```json
{
  "name": string
}
```

**Response:** 204 No Content

**触发事件:** `team.agent.renamed` WS 事件

---

### 1.3 Session 管理

#### POST /api/teams/:team_id/session
确保团队的 MCP session 已启动。如果 session 已存在则幂等返回。

**Response:** 204 No Content

**协议流程：**
1. 验证所有 agents 的 backend 支持 team mode（检查缓存的 initialize result）
2. 为每个 agent 启动 TeamMcpServer（如果尚未启动）
3. 通过 `session/new` 调用注入 MCP config
4. 广播 `team.mcp.status` 事件跟踪注入进度

**MCP Config 注入内容（session/new 的 mcpServers）：**
```json
{
  "name": "aionui-team-{team_id}",
  "command": "node",
  "args": ["/path/to/team-mcp-stdio.js"],
  "env": [
    { "name": "TEAM_MCP_PORT", "value": "{dynamic_port}" },
    { "name": "TEAM_MCP_TOKEN", "value": "{auth_token}" },
    { "name": "TEAM_AGENT_SLOT_ID", "value": "{slot_id}" }
  ]
}
```

---

#### DELETE /api/teams/:team_id/session
停止团队的 MCP session。

**Response:** 204 No Content

---

#### POST /api/teams/:team_id/session-mode
设置 session 权限模式（如 "plan"、"auto"）。

**Request:**
```json
{
  "session_mode": string
}
```

**Response:** 204 No Content

---

#### POST /api/teams/:team_id/workspace
更新团队工作空间。

**Request:**
```json
{
  "workspace": string
}
```

**Response:** 204 No Content

---

### 1.4 消息

#### POST /api/teams/:team_id/messages
向团队广播消息（所有 agents 收到）。

**Request:**
```json
{
  "content": string,
  "files"?: [string]
}
```

**Response:** 204 No Content

---

#### POST /api/teams/:team_id/agents/:slot_id/messages
向特定 agent 发送消息（写入其 mailbox）。

**Request:**
```json
{
  "content": string,
  "files"?: [string]
}
```

**Response:** 204 No Content

**后端行为：**
- 消息存储在 SQLite mailbox 表
- 触发 `wakeAgent(slot_id)` 唤醒 agent 处理新消息
- Mailbox 中的消息有类型：`"message" | "idle_notification" | "shutdown_request"`

---

## 2. WebSocket 事件契约

**连接：** `ws://127.0.0.1:{port}/ws`

WS 消息格式：
```json
{
  "name": "event_name",
  "data": { /* payload */ }
}
```

### 2.1 Agent 生命周期事件

#### team.agent.status
Agent 状态变化。

**Payload:**
```typescript
{
  team_id: string,
  slot_id: string,
  status: "pending" | "idle" | "active" | "completed" | "failed",
  last_message?: string
}
```

**触发条件：**
- Agent 状态更新（wakeAgent、completeAgent、failAgent）

---

#### team.agent.spawned
新 agent 在运行时被创建。

**Payload:**
```typescript
{
  team_id: string,
  agent: TeamAgent  // 完整的 TeamAgent 对象
}
```

---

#### team.agent.removed
Agent 被从团队移除。

**Payload:**
```typescript
{
  team_id: string,
  slot_id: string
}
```

---

#### team.agent.renamed
Agent 被重命名。

**Payload:**
```typescript
{
  team_id: string,
  slot_id: string,
  old_name: string,
  new_name: string
}
```

---

### 2.2 Team 管理事件

#### team.list-changed
团队列表发生变化（创建、删除、agent 增删）。

**Payload:**
```typescript
{
  team_id: string,
  action: "created" | "removed" | "agent_added" | "agent_removed"
}
```

---

### 2.3 MCP 管道事件

#### team.mcp.status
MCP injection 管道的阶段进度。

**Payload:**
```typescript
{
  team_id: string,
  slot_id?: string,                           // 可选：关联到特定 agent
  phase: "tcp_ready" | "tcp_error" | "session_injecting" | "session_ready" 
       | "session_error" | "load_failed" | "degraded" | "config_write_failed"
       | "mcp_tools_waiting" | "mcp_tools_ready",
  server_count?: number,                      // MCP 服务器数
  port?: number,                              // TCP 端口
  error?: string                              // 错误消息
}
```

**阶段含义：**
- `tcp_ready` - TeamMcpServer TCP 监听启动
- `tcp_error` - TCP 启动失败
- `session_injecting` - 正在通过 session/new 注入 MCP config
- `session_ready` - MCP session 已建立
- `session_error` - session 建立失败
- `mcp_tools_waiting` - 等待 MCP 工具准备就绪
- `mcp_tools_ready` - MCP 工具全部加载

---

## 3. MCP TCP 协议

### 3.1 连接建立

TeamMcpServer 在 Electron 主进程中运行 TCP 服务器，监听 `127.0.0.1:{dynamic_port}`。

**认证机制：**
- 一次性随机 token（UUID），在 stdio 环境变量 `TEAM_MCP_TOKEN` 中传递
- 每个 TCP 请求必须在 JSON body 中携带 `"auth_token": "{token}"`
- 认证失败则立即断开连接

### 3.2 消息格式

**length-prefixed JSON：**
```
┌─────────────┬────────────────────────┐
│ 4 bytes BE  │ UTF-8 JSON body        │
│ (length)    │ (variable size ≤ 64MB) │
└─────────────┴────────────────────────┘
```

**示例请求（16 字节 body）：**
```
00 00 00 10 7b 22 74 6f 6f 6c 22 3a ... ("|{"tool":"team_send_message"...}|")
```

### 3.3 Tool Call 协议

#### 请求格式

```typescript
{
  type?: string,           // "mcp_ready" 时用于特殊消息
  tool: string,            // 工具名称
  args: Record<string, unknown>,  // 工具参数
  auth_token: string,      // 认证 token
  from_slot_id?: string,   // 调用者 agent 的 slot_id
  slot_id?: string         // 备选调用者标识
}
```

#### 响应格式

**成功：**
```typescript
{
  result: string           // 工具执行结果（JSON 序列化字符串）
}
```

**失败：**
```typescript
{
  error: string            // 错误消息
}
```

**连接管理：**
- 每个请求对应一个 TCP 连接（一次性）
- 响应后 socket 立即关闭
- 单个消息超时：600 秒
- 最大消息体：64 MB

---

## 4. MCP 工具定义

### 4.1 team_send_message

Agent 间异步通信。

**Parameters:**
```typescript
{
  to: string,              // agent 名称或 slot_id，"*" 表示广播
  message: string,         // 消息内容
  summary?: string         // 可选摘要
}
```

**Returns:**
```
"Message sent to {name}'s inbox. They will process it shortly."
或
"Message broadcast to {N} teammate(s): {names}"
```

**特殊消息：**
- `shutdown_approved` - 成员同意关闭
- `shutdown_rejected: {reason}` - 成员拒绝关闭

---

### 4.2 team_spawn_agent

Leader 专属：创建并启动新 agent。

**Parameters:**
```typescript
{
  name: string,
  agent_type?: string,
  model?: string,
  custom_agent_id?: string    // 预设 assistant ID
}
```

**Returns:**
```
"Teammate "{name}" ({slot_id}) has been created and joined the team."
```

**权限：**
- 仅 leader 可调用
- 非 leader 调用则返回错误，建议通过 team_send_message 联系 leader

**验证：**
- 检查 agent_type 是否支持 team mode
- 检查 model 是否在该 backend 的可用列表中

---

### 4.3 team_task_create

在共享任务板上创建任务。

**Parameters:**
```typescript
{
  subject: string,
  description?: string,
  owner?: string              // 分配的 agent slot_id
}
```

**Returns:**
```
"Task created: [id_prefix] "{subject}"(assigned to {owner})"
```

---

### 4.4 team_task_update

更新任务状态或分配。

**Parameters:**
```typescript
{
  task_id: string,
  status?: "pending" | "in_progress" | "completed" | "deleted",
  owner?: string
}
```

**Returns:**
```
"Task {id} updated. Status: {status}. Owner: {owner}."
```

**副作用：**
- 当 status === "completed" 时，检查是否有被当前任务阻塞的其他任务，并将其状态改为 pending

---

### 4.5 team_task_list

获取团队任务板的全部任务。

**Parameters:** {}

**Returns:**
```
格式化的任务列表文本，包括 ID、主题、状态、所有者、依赖关系等
```

---

### 4.6 team_members

列出团队所有成员及其状态。

**Parameters:** {}

**Returns:**
```
"Team members:
- {name} ({role}): {status} [last_message]
..."
```

---

### 4.7 team_rename_agent

重命名 agent。

**Parameters:**
```typescript
{
  agent: string,        // agent 名称或 slot_id（支持模糊匹配）
  new_name: string
}
```

**Returns:**
```
"Teammate renamed from {old} to {new}."
```

**触发事件：** `team.agent.renamed` WS 事件

---

### 4.8 team_shutdown_agent

请求特定 agent 关闭。

**Parameters:**
```typescript
{
  agent: string          // agent 名称或 slot_id（支持模糊匹配）
}
```

**Returns:**
```
"Shutdown request sent to {name}. Awaiting response..."
```

**协议流程：**
1. 向目标 agent 的 mailbox 写入 type="shutdown_request" 的消息
2. 唤醒 agent
3. Agent 回复 "shutdown_approved" 或 "shutdown_rejected: {reason}"
4. leader 接收回复并执行 removeAgent（如果已批准）

---

### 4.9 team_describe_assistant

获取预设 assistant 的描述。

**Parameters:**
```typescript
{
  custom_agent_id: string
}
```

**Returns:**
```
assistant 的名称、描述、后端类型等信息
```

---

### 4.10 team_list_models

列出指定后端的可用模型。

**Parameters:**
```typescript
{
  agent_type?: string
}
```

**Returns:**
```
格式化的模型列表，包括 ID、名称、能力等
```

---

## 5. stdio Bridge 协议

### 5.1 初始化流程

```
Claude CLI
  │
  └─> team-mcp-stdio.js (stdio)
       │
       ├─ 读取环境变量
       │  - TEAM_MCP_PORT
       │  - TEAM_MCP_TOKEN
       │  - TEAM_AGENT_SLOT_ID
       │
       └─> TCP 连接至 TeamMcpServer
           │
           ├─ 发送 mcp_ready 信号
           │ {"type": "mcp_ready", "from_slot_id": "{slot_id}", "auth_token": "{token}"}
           │
           └─ 进入事件循环
              侦听 MCP tool_call 事件
              │
              └─ 将 tool_call 转发为 TCP 请求
                 {"tool": "...", "args": {...}, "auth_token": "...", "from_slot_id": "..."}
                 │
                 ├─ 收到响应
                 │ {"result": "..."} 或 {"error": "..."}
                 │
                 └─ 回复 MCP tool_result
```

### 5.2 环境变量

| 变量                  | 含义                  | 示例                       |
| -------------------- | -------------------- | -------------------------- |
| TEAM_MCP_PORT        | TeamMcpServer 监听端口 | 54321                      |
| TEAM_MCP_TOKEN       | 一次性认证 token      | 550e8400-e29b-...（UUID）  |
| TEAM_AGENT_SLOT_ID   | 调用者 agent slot_id | abc-123-def                |

---

## 6. Agent Session 注入

### 6.1 session/new 调用

当启动 team session 时，后端调用 `session/new` 时的参数示例：

```typescript
{
  // ... 标准 ACP 参数
  mcpServers: [
    {
      name: "aionui-team-{team_id}",
      command: "node",
      args: ["{path_to_team-mcp-stdio.js}"],
      env: [
        { name: "TEAM_MCP_PORT", value: "{dynamic_port}" },
        { name: "TEAM_MCP_TOKEN", value: "{uuid_token}" },
        { name: "TEAM_AGENT_SLOT_ID", value: "{slot_id}" }
      ]
    }
  ]
}
```

### 6.2 MCP 就绪协调

**NotifyMcpReady 调用序列：**

1. stdio 脚本在启动时发送 `mcp_ready` TCP 消息
2. TeamMcpServer 接收到 `mcp_ready` 后调用 `notifyMcpReady(slot_id)`
3. MCP 就绪数据被存储在内存或数据库
4. 后续 agent 查询 MCP 状态时可获取最新状态

---

## 7. 字段映射规则（前后端转换）

### 7.1 Agent 角色映射

| 前端 (Frontend) | 后端 (Backend) | 说明              |
| --------------- | -------------- | -----------------|
| `role: "leader"` | `role: "lead"` | 团队领导者      |
| `role: "teammate"` | `role: "teammate"` | 普通成员    |

**转换代码位置：** `src/common/adapter/teamMapper.ts`

### 7.2 Backend 类型映射

| 前端 conversation_type | 后端 backend | 说明           |
| --------------------- | ------------ | -------------- |
| `"acp"`               | `"acp"` 或 `"codex"` | ACP 兼容 codex |
| `"codex"`             | `"codex"`    | Codex 后端     |
| 其他                   | 保持不变     | 直接透传       |

**规则：** 前端使用 `conversation_type` 字段决定 UI；后端使用 `backend` 字段决定调用栈。

### 7.3 模型字段映射

```typescript
// 前端请求
{ "model": { "platform": "gemini", "name": "gemini-2.0-flash", "use_model": "...model_spec..." } }

// 映射至后端
{ "model": "...model_spec..." }  // 仅取 use_model
```

---

## 8. 错误处理

### 8.1 HTTP 错误

**格式：**
```json
{
  "error": "human readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

**常见错误代码：**
- `TEAM_NOT_FOUND` - 团队不存在
- `AGENT_NOT_FOUND` - Agent 不存在
- `BACKEND_NOT_TEAM_CAPABLE` - 后端不支持 team mode
- `MCP_INJECTION_FAILED` - MCP 注入失败
- `UNAUTHORIZED` - TCP 认证失败

### 8.2 MCP Tool 调用错误

Tool 调用失败时，stdio 脚本接收：
```json
{
  "error": "error message"
}
```

stdio 将其转换为 MCP `tool_result` 的 error branch。

---

## 9. 性能考虑

### 9.1 消息缓冲

TCP 消息读取使用分块缓存（chunks 数组），避免 O(N²) Buffer.concat 开销。

**单个消息最大 64 MB**（`MAX_MCP_MESSAGE_SIZE`）。

### 9.2 Mailbox 存储

- 所有 mailbox 消息持久化至 SQLite
- `readUnreadAndMark` 使用单个事务原子性标记已读
- 历史查询支持分页

### 9.3 WebSocket 连接

- 单一全局 WS 连接复用
- 自动重连，指数退避（最大 30 秒）
- 事件监听器基于 eventName 的 Map

### 9.4 TCP 连接

- 每次 tool call 一个新连接（一次性）
- 600 秒连接超时
- Socket idle 超时销毁连接

---

## 10. 前后端分离注意事项

### 10.1 Renderer ↔ Backend（HTTP/WS）

**分离点：** ipcBridge 适配层已完全将 IPC 替换为 HTTP/WS，renderer 代码无需修改。

**关键：** 字段映射在 `ipcBridge.ts` 的 `toBackendAgent` / `fromBackendAgent` 中完成。

### 10.2 Backend ↔ Agent（TCP）

**分离点：** stdio 脚本充当代理，Agent 无需知道 TCP 细节。

**关键：** Team MCP config 通过 `session/new` 的 `mcpServers` 参数注入。

### 10.3 类型一致性

**重要：** 确保三个系统对以下类型的理解一致：

1. **TeamAgent** - 必须包含 slot_id、conversation_id、role、status 等
2. **MailboxMessage** - 必须包含 type（message/idle_notification/shutdown_request）
3. **TeamTask** - 必须支持 blocked_by/blocks 依赖关系

---

## 11. 调试指南

### 11.1 HTTP 请求日志

所有 HTTP 调用被记录在浏览器控制台：
```
[httpBridge] POST /api/teams {request_body}
[httpBridge] POST /api/teams → 200 OK
```

### 11.2 WebSocket 消息

WS 消息在控制台输出：
```
[WS:msg] team.agent.status {payload_first_200_chars}
```

### 11.3 TCP 调试

TeamMcpServer 在主进程日志中输出：
```
[TeamMcpServer] TCP connection received from 127.0.0.1:54321
[TeamMcpServer] MCP ready from slot abc-123-def
```

stdio 脚本若有调试需要，环境变量传递 DEBUG=1。

---

## 附录 A：完整时序图示例

### 创建 Team + 启动 Session

```
┌─────────┐                ┌────────┐              ┌──────────┐              ┌───────┐
│ Frontend│                │Backend │              │TeamMcpSvr│              │ Agent │
└────┬────┘                └───┬────┘              └────┬─────┘              └───┬───┘
     │                         │                        │                       │
     │ POST /api/teams         │                        │                       │
     ├────────────────────────>│                        │                       │
     │                         │ create TeamMcpServer   │                       │
     │                         ├───────────────────────>│                       │
     │                         │ start TCP listener     │                       │
     │                         │<─────────────────────┬─┤                       │
     │                         │ { port: 54321 }      │ │                       │
     │                         │ emit tcp_ready       │ │                       │
     │<───────────────────────┬┤ WS: team.mcp.status  │ │                       │
     │ 200 + TTeam object     │ │                       │ │                       │
     │                         │ POST session/new       │ │                       │
     │                         │  with mcpServers      │ │                       │
     │                         │                       │ ├──────────────────────>│
     │                         │                       │ │ spawn stdio bridge    │
     │                         │                       │ │ set env vars          │
     │                         │                       │ │                       │
     │                         │                       │ │ TCP: mcp_ready        │
     │                         │<──────────────────────┤ │                       │
     │                         │ emit mcp_tools_ready  │ │                       │
     │<───────────────────────┬┤ WS: team.mcp.status  │ │                       │
     │ WS event received       │ │                       │ │                       │
```

### Agent 间发送消息

```
┌────────┐              ┌──────────┐              ┌────────────┐              ┌────────┐
│ Agent A│              │TeamMcpSvr│              │   Backend  │              │ Agent B│
└───┬────┘              └────┬─────┘              └────┬───────┘              └───┬────┘
    │                        │                        │                         │
    │ TCP: team_send_message │                        │                         │
    ├───────────────────────>│                        │                         │
    │ { to: "Agent B", ... } │                        │                         │
    │                        │ writeMailboxMessage    │                         │
    │                        ├───────────────────────>│                         │
    │                        │<───────────────────────┤ (persisted)             │
    │                        │ wakeAgent("slot_B")    │                         │
    │                        ├───────────────────────>│ query mailbox           │
    │                        │                        │                         │
    │                        │                        │ getUnread() =>          │
    │                        │                        ├────────────────────────>│
    │                        │                        │ [{ content, ... }]      │
    │                        │                        │<────────────────────────┤
    │<───────────────────────┤ "Message sent to B"    │ (Agent B reads and      │
    │ { result: "..." }      │                        │  processes message)     │
```

---

## 附录 B：类型定义汇总

```typescript
// 前端
interface ICreateTeamParams {
  name: string;
  agents: Omit<TeamAgent, 'slot_id' | 'conversation_id'>[];
}

// 后端转换
function toBackendAgent(a: TeamAgent): Record<string, unknown> {
  return {
    name: a.agent_name,
    role: a.role === 'leader' ? 'lead' : a.role,
    backend: a.agent_type,
    model: a.model || 'default'
  };
}

// Mailbox
type MailboxMessage = {
  id: string;
  team_id: string;
  to_agent_id: string;
  from_agent_id: string;
  type: 'message' | 'idle_notification' | 'shutdown_request';
  content: string;
  read: boolean;
  created_at: number;
};

// Task
type TeamTask = {
  id: string;
  team_id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed' | 'deleted';
  owner?: string;
  blocked_by: string[];
  blocks: string[];
  created_at: number;
  updated_at: number;
};
```

---

**文档版本：** 1.0  
**最后更新：** 2026-04-28  
**维护者：** Team MCP 研究员
