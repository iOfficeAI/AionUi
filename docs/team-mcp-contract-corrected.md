# Team MCP 接口契约（修正版）

**版本**: v1.1 (勘误更新)  
**基于**: team-mcp-protocol.md  
**修正内容**: 参数名调整（team_shutdown_agent, team_rename_agent）、路由状态澄清  
**生成日期**: 2026-04-28

---

## 1. HTTP API 契约（修正版）

### 1.1 Team CRUD

#### POST /api/teams - Create Team

**Request:**
```json
{
  "name": string,
  "agents": [
    {
      "agent_name": string,
      "role": "lead" | "teammate",
      "backend": "acp" | "codex" | "gemini" | "claude" | "aionrs",
      "model": string,
      "custom_agent_id"?: string
    }
  ]
}
```

**Response:** 200 OK, 返回 TTeam 对象

---

#### GET /api/teams?user_id=:user_id - List Teams

**Response:** 200 OK, 返回 TTeam[] 数组

---

#### GET /api/teams/:id - Get Single Team

**Response:** 
- 200 OK, 返回 TTeam 对象
- 404 Not Found, 团队不存在

---

#### DELETE /api/teams/:id - Delete Team

**Response:** 204 No Content

---

### 1.2 Agent 生命周期

#### POST /api/teams/:team_id/agents - Add Agent

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

**Response:** 200 OK, 返回新创建的 TeamAgent

---

#### DELETE /api/teams/:team_id/agents/:slot_id - Remove Agent

**Response:** 204 No Content

---

#### PATCH /api/teams/:team_id/agents/:slot_id/name - Rename Agent

**Request:**
```json
{
  "name": string
}
```

**Response:** 200 OK

**Trigger WS Event:** `team.agent.renamed`

---

### 1.3 Team Session 管理

#### POST /api/teams/:team_id/session - Ensure Session

启动或确保 MCP session 就绪。

**Request:** (empty body)

**Response:** 200 OK

**Trigger WS Event:** `team.mcp.status` (phase: tcp_ready → ... → mcp_tools_ready)

---

#### DELETE /api/teams/:team_id/session - Stop Session

**Response:** 204 No Content

---

### 1.4 Team 属性管理

#### PATCH /api/teams/:id/name - Rename Team

**Request:**
```json
{
  "name": string
}
```

**Response:** 200 OK

---

#### POST /api/teams/:id/session-mode - Set Permission Mode

**状态**: ⚠️ 实现确认中 (参见勘误表 P2)

**Request:**
```json
{
  "session_mode": string  // e.g., "plan", "auto"
}
```

**Response:** 200 OK (if implemented)

---

#### POST /api/teams/:id/workspace - Update Workspace

**状态**: ⚠️ 实现确认中 (参见勘误表 P2)

**Request:**
```json
{
  "workspace": string
}
```

**Response:** 200 OK (if implemented)

---

### 1.5 消息通道

#### POST /api/teams/:id/messages - Send Broadcast Message (to Leader)

**Request:**
```json
{
  "content": string,
  "files"?: string[]
}
```

**Response:** 200 OK

---

#### POST /api/teams/:id/agents/:slot_id/messages - Send Direct Message

**Request:**
```json
{
  "content": string,
  "files"?: string[]
}
```

**Response:** 200 OK

---

## 2. WebSocket 事件 (§4 - 完整列表)

### 2.1 Agent 状态事件

#### team.agent.status

Agent 状态变更。

**Payload**:
```typescript
{
  team_id: string;
  slot_id: string;
  status: 'pending' | 'idle' | 'active' | 'completed' | 'failed';
  last_message?: string;
}
```

---

#### team.agent.spawned

新 agent 运行时加入。

**Payload**:
```typescript
{
  team_id: string;
  agent: TeamAgent;  // 包含 slot_id, role, agent_type, agent_name, status 等
}
```

---

#### team.agent.removed

Agent 被移除。

**Payload**:
```typescript
{
  team_id: string;
  slot_id: string;
}
```

---

#### team.agent.renamed

Agent 被重命名。

**Payload**:
```typescript
{
  team_id: string;
  slot_id: string;
  old_name: string;
  new_name: string;
}
```

---

### 2.2 Team 级别事件

#### team.list-changed

Team 创建/删除/agent 增删。

**Payload**:
```typescript
{
  team_id: string;
  action: 'created' | 'removed' | 'agent_added' | 'agent_removed';
}
```

---

#### team.mcp.status

MCP 注入管道各阶段。

**Payload**:
```typescript
{
  team_id: string;
  slot_id?: string;
  phase: TeamMcpPhase;
  server_count?: number;
  port?: number;
  error?: string;
}
```

**Phase 枚举**:
- `tcp_ready` - TCP 服务就绪
- `tcp_error` - TCP 启动失败
- `session_injecting` - 注入到 ACP session 中
- `session_ready` - ACP session 就绪
- `session_error` - ACP session 注入失败
- `load_failed` - 工具加载失败
- `degraded` - 降级模式（无 MCP）
- `config_write_failed` - 配置写入失败
- `mcp_tools_waiting` - 等待 agent 连接
- `mcp_tools_ready` - agent MCP 工具就绪

---

## 3. MCP 工具定义 (§6 - 修正版)

通过 TCP 127.0.0.1:{port} 暴露给 agent 的 10 个工具。

### 3.1 通信工具

#### team_send_message

单聊或广播消息。

**Parameters**:
```json
{
  "to": string,          // "*" = 广播, 或 agent name / slot_id
  "message": string,
  "summary"?: string
}
```

**Returns**: string (确认消息)

**Permission**: 所有 agent

---

#### team_shutdown_agent

**修正**: 参数名改为 `agent` (修正前为 `slot_id`)

请求 agent 关闭。

**Parameters**:
```json
{
  "agent": string        // agent name 或 slot_id (支持模糊匹配)
}
```

**Returns**: string (确认消息)

**Permission**: 所有 agent

**响应处理**:
- Agent 回复 `shutdown_approved` → 自动 removeAgent
- Agent 回复 `shutdown_rejected: reason` → 通知 leader

---

### 3.2 Team 管理工具

#### team_spawn_agent

创建新 teammate。

**Parameters**:
```json
{
  "name": string,
  "agent_type"?: string,        // "acp", "codex", "gemini", "claude", "aionrs"
  "model"?: string,
  "custom_agent_id"?: string    // 预设 assistant ID
}
```

**Returns**: string (确认消息 + slot_id)

**Permission**: 仅 leader

---

#### team_members

列出所有团队成员及状态。

**Parameters**: (无)

**Returns**: string (markdown 格式成员列表)

**Permission**: 所有 agent

---

#### team_rename_agent

**修正**: 参数名改为 `agent` (修正前为 `slot_id`)

重命名 agent。

**Parameters**:
```json
{
  "agent": string,       // agent name 或 slot_id (支持模糊匹配)
  "new_name": string
}
```

**Returns**: string (确认消息)

**Permission**: 所有 agent

---

#### team_describe_assistant

获取 preset assistant 描述。

**Parameters**:
```json
{
  "custom_agent_id": string,
  "locale"?: string
}
```

**Returns**: string (markdown 格式 assistant 信息)

**Permission**: 所有 agent

---

#### team_list_models

列出可用模型。

**Parameters**:
```json
{
  "agent_type"?: string
}
```

**Returns**: string (markdown 格式模型列表)

**Permission**: 所有 agent

---

### 3.3 任务管理工具

#### team_task_create

创建共享任务。

**Parameters**:
```json
{
  "subject": string,
  "description"?: string,
  "owner"?: string       // agent name 或 slot_id
}
```

**Returns**: string (任务 ID 和确认)

**Permission**: 所有 agent

---

#### team_task_update

更新任务状态。

**Parameters**:
```json
{
  "task_id": string,
  "status"?: "pending" | "in_progress" | "completed" | "deleted",
  "owner"?: string
}
```

**Returns**: string (确认消息)

**Permission**: 所有 agent

---

#### team_task_list

列出团队任务板。

**Parameters**: (无)

**Returns**: string (markdown 格式任务列表)

**Permission**: 所有 agent

---

## 4. 类型定义摘要

### 共享类型 (@/common/types/teamTypes.ts)

```typescript
export type TeammateRole = 'leader' | 'teammate';
export type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed';
export type WorkspaceMode = 'shared' | 'isolated';
export type TeamMcpPhase = 
  | 'tcp_ready' | 'tcp_error' 
  | 'session_injecting' | 'session_ready' | 'session_error'
  | 'load_failed' | 'degraded' | 'config_write_failed'
  | 'mcp_tools_waiting' | 'mcp_tools_ready';

export type TeamAgent = {
  slot_id: string;
  conversation_id: string;
  role: TeammateRole;
  agent_type: string;
  agent_name: string;
  conversation_type: string;
  status: TeammateStatus;
  cli_path?: string;
  custom_agent_id?: string;
  model?: string;
};

export type TTeam = {
  id: string;
  user_id: string;
  name: string;
  workspace: string;
  workspace_mode: WorkspaceMode;
  leader_agent_id: string;
  agents: TeamAgent[];
  session_mode?: string;
  created_at: number;
  updated_at: number;
};
```

---

## 5. 字段映射规则

### Frontend ↔ Backend

| 字段 | 前端 | 后端 | 位置 |
|------|------|------|------|
| role | `"leader"` | `"lead"` | teamMapper.toBackendAgent / fromBackendAgent |
| agent_type | `agent_type` + `conversation_type` | `backend` | codex/acp → conversation_type: "acp" |
| model | 从 `use_model` 字段提取 | `model_spec` string | TeamAgent.model |

---

## 已知限制与后续优化

1. **RBAC**: Team 级别无权限控制，所有 teammate 可调用所有 MCP 工具
2. **MCP Ready 超时**: 硬编码 30s 超时，可优化为动态等待
3. **Mailbox 性能**: 大量消息查询缺少索引，后续需优化
4. **Shared workspace 冲突**: 多 agent 并发写入可能冲突，需加锁机制

---

**修正记录**:
- v1.0 → v1.1: 修正 team_shutdown_agent/team_rename_agent 参数名 (2026-04-28)
