# Team MCP 功能规格 (PRD)

**版本**: v1.0 | **日期**: 2026-04-28 | **来源**: main 分支源码反推

> 详细协议见 [team-mcp-protocol.md](team-mcp-protocol.md)，检查清单见 [team-mcp-implementation-checklist.md](team-mcp-implementation-checklist.md)

---

## 1. 概览

Team Mode 是 AionUi 的多 Agent 协作框架。核心通过 MCP（Model Context Protocol）让 agent 之间能互相通信、创建任务、管理成员。

```
┌─────────────────────────────────────────────────────────┐
│ 前端 (Renderer)                                         │
│  ipcBridge → HTTP/WS → Backend                         │
├─────────────────────────────────────────────────────────┤
│ 后端 (aionui-backend / Electron Main)                   │
│  REST API + WebSocket 事件推送                           │
│  TeamSession → TeamMcpServer (TCP 127.0.0.1:random)     │
├─────────────────────────────────────────────────────────┤
│ Agent (Claude CLI / Gemini / Codex / Aionrs)            │
│  stdio bridge (team-mcp-stdio.js) ↔ TCP                │
└─────────────────────────────────────────────────────────┘
```

**角色**:
- **User**: 通过前端 UI 创建 team、发消息、管理 agent
- **Leader Agent**: 主协调者，接收 user 消息，可 spawn/shutdown teammate
- **Teammate Agent**: 执行者，通过 mailbox 接收任务

**关键术语**:
- `slot_id`: agent 在 team 内的唯一运行时标识
- `conversation_id`: agent 对应的 ACP 会话 ID
- `mailbox`: agent 间异步消息队列（SQLite 持久化）
- `task board`: team 共享任务板

---

## 2. 用户故事与 UI 流程

### 2.1 创建 Team

**入口**: Sider 按钮 `data-testid="team-create-btn"`

**Modal 流程** (`TeamCreateModal.tsx`):
1. 填写 team 名称（必填，自动 focus）
2. 选择 Leader Agent（下拉，按 CLI Agents / Preset Assistants 分组）
   - 仅显示 team-capable 的 backend（`isTeamCapableBackend()` 过滤）
3. 选择 Workspace 路径（可选，带 Recent 列表）
4. 点击 Create → 调用 `team.create()` → 导航到 `/team/{team_id}`

**验证**: 名称空→警告+focus；Leader 未选→警告；创建中→按钮 loading

### 2.2 Team 详情页

**路由**: `/team/{team_id}` → `TeamPage.tsx`

**布局**:
- **Agent Tab 栏** (`TeamTabs.tsx`): 水平 tab，每个 tab 显示：
  - Avatar + 名称（可双击编辑）
  - Leader 冠图标（仅 leader）
  - 状态指示器（2×2px 圆形：pending/idle=灰, active=绿+脉冲, failed=红）
  - 权限 badge（‼️ 显示待确认数）
  - 删除按钮（非 Leader 可删）
  - 拖拽排序（leader 固定首位，排序存 localStorage）
  - 溢出时显示左右箭头导航

- **聊天区域**: 多 agent 并排（`flex: 1 1 400px`，水平滚动）
  - 每个 agent 一栏：header(identity+model选择器+全屏+remove) + 聊天内容
  - 根据 conversation_type 路由到对应 Chat 组件（AcpChat / AionrsTeamChat 等）

### 2.3 消息发送路由

`AcpSendBox.tsx` 中的逻辑：
- 无 `team_id` → `conversation.send()`（单 agent 模式）
- 有 `team_id` + `agentSlotId` → `team.sendMessageToAgent()`（单聊特定 agent）
- 有 `team_id` 无 slot → `team.sendMessage()`（群聊，消息发给 leader）

### 2.4 Agent 管理

| 操作 | 入口 | 确认方式 | API |
|------|------|---------|-----|
| 重命名 | 双击 tab / Edit 图标 | Enter/Blur | `team.renameAgent` |
| 删除 | X 按钮 | active 状态需 Modal 确认 | `team.removeAgent` |
| 拖拽排序 | 鼠标拖动 | 自动 | localStorage |
| 添加 | ⚠️ **无 UI 入口** | - | `team.addAgent`（API 存在） |

### 2.5 Sider 团队列表

- **展开模式**: Icon(Peoples) + 名称 + 右键菜单(Pin/Rename/Delete) + badge(红色待确认数)
- **折叠模式**: 紧凑图标 + tooltip
- 数据来源: `useTeamList` hook（SWR 缓存 + `team.listChanged` WS 事件自动刷新）

### 2.6 全屏模式

单 agent 填满整个内容区，通过 `TeamTabsContext` 中的标志控制。

---

## 3. HTTP API 契约

| 方法 | 路径 | 说明 | 触发 WS 事件 |
|------|------|------|-------------|
| POST | `/api/teams` | 创建 Team | `team.list-changed` |
| GET | `/api/teams?user_id=` | 列出用户所有 Team | - |
| GET | `/api/teams/{id}` | 获取 Team 详情 | - |
| DELETE | `/api/teams/{id}` | 删除 Team | `team.list-changed` |
| POST | `/api/teams/{id}/agents` | 添加 Agent | `team.agent.spawned` + `team.list-changed` |
| DELETE | `/api/teams/{id}/agents/{slot_id}` | 移除 Agent | `team.agent.removed` + `team.list-changed` |
| PATCH | `/api/teams/{id}/agents/{slot_id}/name` | 重命名 Agent | `team.agent.renamed` |
| POST | `/api/teams/{id}/messages` | 群聊（→ leader mailbox） | - |
| POST | `/api/teams/{id}/agents/{slot_id}/messages` | 单聊（→ 指定 agent mailbox） | - |
| POST | `/api/teams/{id}/session` | 启动/确保 MCP session | `team.mcp.status` |
| DELETE | `/api/teams/{id}/session` | 停止 MCP session | - |
| PATCH | `/api/teams/{id}/name` | 重命名 Team | - |
| POST | `/api/teams/{id}/session-mode` | 设置权限模式 | - |
| POST | `/api/teams/{id}/workspace` | 更新 workspace | - |

> 详细请求/响应格式见 [team-mcp-protocol.md §1](team-mcp-protocol.md#1-http-api-契约)

---

## 4. WebSocket 事件

| 事件名 | Payload 类型 | 触发条件 |
|--------|-------------|---------|
| `team.agent.status` | `ITeamAgentStatusEvent` | Agent 状态变更（pending→idle→active→completed/failed） |
| `team.agent.spawned` | `ITeamAgentSpawnedEvent` | 新 agent 运行时加入 |
| `team.agent.removed` | `ITeamAgentRemovedEvent` | Agent 被移除 |
| `team.agent.renamed` | `ITeamAgentRenamedEvent` | Agent 被重命名 |
| `team.list-changed` | `ITeamListChangedEvent` | Team 创建/删除/agent 增删 |
| `team.mcp.status` | `ITeamMcpStatusEvent` | MCP 注入管道各阶段 |

**MCP 状态阶段**: `tcp_ready` → `session_injecting` → `session_ready` → `mcp_tools_waiting` → `mcp_tools_ready`
**错误阶段**: `tcp_error` / `session_error` / `load_failed` / `degraded` / `config_write_failed`

**WS 消息格式**（实测确认）:
```json
{
  "name": "team.agent.status",
  "data": { /* payload */ }
}
```
前端 httpBridge.ts 兼容 `name` 和 `channel` 两种 key（`msg.name ?? msg.event`），后端实际用 `name`。

---

## 5. MCP 注入链路

```
1. 前端调用 team.ensureSession({ team_id })
2. 后端创建 TeamSession（含 Mailbox、TaskManager、TeammateManager）
3. TeamMcpServer.start() → TCP server 监听 127.0.0.1:random
   → 发射 WS: team.mcp.status { phase: "tcp_ready", port }
4. 生成 stdio config:
   { command: "node", args: ["team-mcp-stdio.js"],
     env: { TEAM_MCP_PORT, TEAM_MCP_TOKEN(UUID), TEAM_AGENT_SLOT_ID } }
5. 通过 session/new { mcpServers } 注入到 agent CLI
6. Agent 启动 stdio bridge → TCP 连接 → 验证 token → 发送 mcp_ready
7. TeamMcpServer 调用 notifyMcpReady(slot_id)
   → 发射 WS: team.mcp.status { phase: "mcp_tools_ready" }
8. waitForMcpReady(slot_id) 解除（30s 超时降级）
```

> 完整时序图见 [team-mcp-protocol.md 附录A](team-mcp-protocol.md#附录-a完整时序图示例)

---

## 6. MCP 工具定义

通过 TCP 暴露给 agent 的 10 个工具：

| 工具 | 参数 | 说明 | 权限 |
|------|------|------|------|
| `team_send_message` | `to, message, summary?` | 单聊/广播（to="*"） | 所有 |
| `team_spawn_agent` | `name, agent_type?, model?, custom_agent_id?` | 创建新 teammate | 仅 leader |
| `team_task_create` | `subject, description?, owner?` | 创建任务 | 所有 |
| `team_task_update` | `task_id, status?, owner?` | 更新任务 | 所有 |
| `team_task_list` | - | 列出任务 | 所有 |
| `team_members` | - | 列出成员及状态 | 所有 |
| `team_rename_agent` | `agent, new_name` | 重命名 agent（agent 支持 name 或 slot_id 模糊匹配） | 所有 |
| `team_shutdown_agent` | `agent` | 请求 agent 关闭（agent 支持 name 或 slot_id 模糊匹配） | 所有 |
| `team_describe_assistant` | `custom_agent_id` | 获取 assistant 描述 | 所有 |
| `team_list_models` | `agent_type?` | 列出可用模型 | 所有 |

> 详细参数 schema 见 [team-mcp-protocol.md §4](team-mcp-protocol.md#4-mcp-工具定义)

---

## 7. Agent 间通信

### 群聊（User → Leader）
User 在 UI 发消息 → `POST /api/teams/{id}/messages` → 写入 leader mailbox → wake leader

### 单聊（User → 特定 Agent）
User 在 agent tab 发消息 → `POST /api/teams/{id}/agents/{slot_id}/messages` → 写入该 agent mailbox → wake

### Agent 间通信（via MCP）
Agent A 调用 `team_send_message { to: "Agent B" }` → TCP → TeamMcpServer → 写入 B 的 mailbox → wake B

### 广播
Agent 调用 `team_send_message { to: "*" }` → 写入所有 teammate mailbox（跳过 sender）→ wake all

### 特殊消息
- `shutdown_approved` → agent 同意关闭，自动 removeAgent
- `shutdown_rejected: {reason}` → agent 拒绝关闭

### Mailbox 持久化
SQLite `mailbox` 表，消息类型：`message` / `idle_notification` / `shutdown_request`
`readUnread()` 原子标记已读，`getHistory()` 分页查询

---

## 8. 字段映射规则

| 字段 | 前端 | 后端 | 转换位置 |
|------|------|------|---------|
| role | `"leader"` | `"lead"` | `teamMapper.ts: toBackendAgent/fromBackendAgent` |
| agent 类型 | `agent_type` + `conversation_type` | `backend` | codex/acp → `"acp"` conversation_type |
| model | `{ platform, name, use_model }` | `"model_spec"` string | 取 `use_model` 字段 |

---

## 9. 数据模型

### 共享类型 (`src/common/types/teamTypes.ts`)

- `TTeam`: id, user_id, name, workspace, workspace_mode, leader_agent_id, agents[], session_mode?, created_at, updated_at
- `TeamAgent`: slot_id, conversation_id, role, agent_type, agent_name, conversation_type, status, cli_path?, custom_agent_id?, model?
- `TeammateStatus`: pending | idle | active | completed | failed
- `WorkspaceMode`: shared | isolated
- `TeamMcpPhase`: tcp_ready | tcp_error | session_injecting | session_ready | session_error | load_failed | degraded | config_write_failed | mcp_tools_waiting | mcp_tools_ready

### Process-only 类型 (`src/process/team/types.ts`)

- `MailboxMessage`: id, team_id, to/from_agent_id, type, content, summary?, files?, read, created_at
- `TeamTask`: id, team_id, subject, description?, status, owner?, blocked_by[], blocks[], metadata, created_at, updated_at
- `IdleNotification`: type, idle_reason, summary, completed_task_id?, failure_reason?

### 数据库 Schema

- `teams` 表: 元数据 + agents JSON 列
- `mailbox` 表: agent 间消息
- `tasks` 表: 共享任务板

---

## 10. 前端 Hooks & 组件索引

### 核心 Hooks

| Hook | 文件 | 职责 |
|------|------|------|
| `useTeamSession` | `src/renderer/pages/team/hooks/useTeamSession.ts` | 会话管理 + WS 事件订阅，返回 statusMap/sendMessage/addAgent/removeAgent |
| `useTeamList` | `src/renderer/pages/team/hooks/useTeamList.ts` | SWR 缓存 team 列表 + listChanged 自动刷新 |
| `useTeamTabs` | `src/renderer/pages/team/hooks/TeamTabsContext.tsx` | Tab 状态（activeSlotId、全屏标志）|
| `useTeamPendingPermissions` | hooks/ | 待确认权限计数 |
| `useTeamPermission` | hooks/ | 权限模式传播 |

### 关键组件

| 组件 | 文件 | 职责 |
|------|------|------|
| `TeamPage` | `src/renderer/pages/team/TeamPage.tsx` | 页面主容器 |
| `TeamCreateModal` | `src/renderer/pages/team/components/TeamCreateModal.tsx` | 创建流程 |
| `TeamTabs` | `src/renderer/pages/team/components/TeamTabs.tsx` | Agent tab 栏 |
| `TeamChatView` | `src/renderer/pages/team/components/TeamChatView.tsx` | 平台路由聊天区 |
| `AgentStatusBadge` | `src/renderer/pages/team/components/AgentStatusBadge.tsx` | 状态指示器 |
| `TeamSiderSection` | sider 组件 | Sider 团队列表 |
| `AcpSendBox` | `src/renderer/components/` | 消息发送路由 |

---

## 11. 前后端分离注意事项

### 前端类型问题（✅ 已修复 — commit d6450a6ec）
- `ipcBridge.ts` 6 处 `@process/` type import 已统一改为 `@/common/types/`
- `McpSource` 已抽到 `src/common/types/mcpTypes.ts`，`McpProtocol.ts` 改为 re-export
- tsc --noEmit 通过，无新增错误

### 服务端待确认
- `POST /api/teams/{id}/session-mode` — 前端已声明，后端是否实现？
- `POST /api/teams/{id}/workspace` — 前端已声明，后端是否实现？
- 6 个 WebSocket team.* 事件 — 后端是否在推送？
- WebSocket 事件推送格式 — 前端 httpBridge.ts 期望 `{ channel: "team.agent.status", data: {...} }` 结构，后端需确认是否匹配

---

## 12. 已知问题与待确认项

| # | 问题 | 类型 | 状态 |
|---|------|------|------|
| 1 | `addAgent` 有 API 但**无 UI 入口** | UI | ⚠️ 设计缺失或故意？ |
| 2 | `session-mode` 和 `workspace` 路由后端未确认 | 服务端 | ⚠️ 待确认 |
| 3 | `team.mcp.status` 前端未实际监听渲染 | 前端 | 待 team UI 接入时补 |
| 4 | Team 级别无 RBAC，所有 teammate 可调用所有 MCP 工具 | 设计 | 已知限制 |
| 5 | `waitForMcpReady()` 硬 30s 超时 | 性能 | 可优化 |
| 6 | Mailbox 无索引，大量消息查询性能堪忧 | 性能 | 后续优化 |
| 7 | shared workspace 模式多 agent 并发写入可能冲突 | 设计 | 已知限制 |
| 8 | WS 事件推送格式（{ channel, data }）后端需确认 | 集成 | ⚠️ 待确认 |
| 9 | workspace 路径必须为绝对路径，前后端需统一约定 | 设计 | ⚠️ 待确认 |

---

## 13. 单聊转 Team（Solo → Team）

> 详细规格见 [docs/team-mcp-solo-to-team.md](team-mcp-solo-to-team.md)

### 概述
单聊转 team 不是 UI 按钮触发，而是 **Agent 通过 MCP 工具智能发起**。Agent 在单聊中判断任务需要多人协作时，主动调用 `aion_create_team` 工具。

### 流程
```
1. 用户在单聊中提出复杂任务
2. Agent 判断需要多 Agent 协作
3. Agent 提议 Team 配置（成员列表+角色）
4. 用户确认
5. Agent 调用 aion_create_team MCP 工具
   参数: { summary, name, workspace, agents[] }
6. 后端创建 Team，复用当前 conversation 作为 leader
7. 前端自动跳转到 /team/{teamId}
```

### 关键机制
- **MCP 工具**: `aion_create_team`，由 `TeamGuideMcpServer` 提供（`src/process/team/mcp/guide/`）
- **Conversation 复用**: Solo conversation ID 直接成为 team leader 的 conversationId，避免侧边栏产生孤立会话
- **Summary 传递**: 以 silent 模式发送给 leader（不产生 UI 气泡）
- **Workspace 继承**: 自动继承 solo conversation 的 workspace
- **支持后端**: claude、codex、gemini（降级到 claude）
- **不可逆**: 不支持 team 回退到 solo

### 前后端分离注意事项
- `TeamGuideMcpServer` 当前跑在 Electron main process，前后端分离后需要在服务端运行
- `aion_create_team` 工具的响应包含 `route` 字段（如 `/team/{id}`），前端据此跳转

---

## 附录

- **完整协议文档**: [docs/team-mcp-protocol.md](team-mcp-protocol.md) — HTTP/WS/TCP 详细格式、时序图
- **实现检查清单**: [docs/team-mcp-implementation-checklist.md](team-mcp-implementation-checklist.md) — 70+ 条验收项
- **原始 PRD 反推**: [TEAM_MCP_PRD.md](../TEAM_MCP_PRD.md) — 全局功能链路（含代码行号引用）
