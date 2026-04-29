# 接口契约 — Team MCP 新服务端 API

来源: `aionui-backend/docs/teams/api.md` + `aionui-backend/docs/teams/frontend-guide.md`

---

## REST 端点

### Team 管理（保留，无变化）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/teams` | 创建团队 |
| GET | `/api/teams` | 列出所有团队 |
| GET | `/api/teams/{id}` | 获取单个团队详情 |
| DELETE | `/api/teams/{id}` | 删除团队（级联删 agents/mailbox/tasks） |
| PATCH | `/api/teams/{id}/name` | 重命名团队 |
| POST | `/api/teams/{id}/agents` | 新增 agent |
| DELETE | `/api/teams/{id}/agents/{slot_id}` | 移除 agent |
| PATCH | `/api/teams/{id}/agents/{slot_id}/name` | 重命名 agent |

### Session 管理（保留，无变化）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/teams/{id}/session` | 启动/确保 session（幂等，可重复调） |
| DELETE | `/api/teams/{id}/session` | 停止 session |

### 消息收发（改用单聊 API）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/conversations/{conversation_id}/messages` | 向 agent 发消息 |
| GET | `/api/conversations/{conversation_id}/messages` | 拉 agent 消息历史 |

**已删除**（不再存在于后端）:
- ~~`POST /api/teams/{id}/messages`~~
- ~~`POST /api/teams/{id}/agents/{slot_id}/messages`~~

---

## 关键数据结构

### CreateTeamRequest

```json
{
  "name": "string",
  "agents": [
    {
      "name": "Alice",
      "role": "lead",
      "backend": "claude",
      "model": "claude-opus",
      "custom_agent_id": null
    }
  ]
}
```

- `agents` 至少 1 个；第一个自动成为 lead
- `backend` 合法值: `acp | claude | gemini | qwen | nanobot | aionrs | remote | openclaw-gateway`
- `role` 合法值: `lead | leader | teammate`（大小写敏感）

### TeamResponse

```json
{
  "id": "t_xxx",
  "name": "string",
  "agents": [/* TeamAgentResponse[] */],
  "lead_agent_id": "slot_xxx",
  "created_at": 1730000000000,
  "updated_at": 1730000000000
}
```

### TeamAgentResponse

```json
{
  "slot_id": "slot_xxx",
  "name": "string",
  "role": "lead | teammate",
  "conversation_id": "conv_xxx",
  "backend": "string",
  "model": "string",
  "custom_agent_id": null,
  "status": "idle | working | thinking | tool_use | completed | error"
}
```

`conversation_id` 是发消息和拉历史的唯一标识，从 `TeamAgentResponse.conversation_id` 取。

---

## WebSocket 事件

所有事件通过 `/ws` 推送，格式 `team.agent.<action>`:

| Event | 触发时机 | 关键字段 |
|-------|---------|---------|
| `team.agent.status` | Agent 状态迁移 | `team_id, slot_id, status` |
| `team.agent.spawned` | 新增 agent | `team_id, agent: TeamAgentResponse` |
| `team.agent.removed` | 移除 agent | `team_id, slot_id` |
| `team.agent.renamed` | 改名 | `team_id, slot_id, name` |

Agent 回复内容走 `conversation.message.*` / `conversation.stream.*`（与单聊完全一致）。

---

## Agent 状态枚举（后端 → 前端映射）

后端状态值: `idle | working | thinking | tool_use | completed | error`

前端 `TeammateStatus`: `pending | idle | active | completed | failed`

映射规则（在 `teamMapper.toStatus()` 中实现）:

| 后端 | 前端 |
|------|------|
| `idle` | `idle` |
| `working` | `active` |
| `thinking` | `active` |
| `tool_use` | `active` |
| `completed` | `completed` |
| `error` | `failed` |
| `pending`（前端内部） | `pending` |
| 未知值 | `idle`（fallback） |

---

## 不存在的端点（禁止调用）

- `GET /api/teams/{id}/tasks` — 任务板只有 MCP tool，无 HTTP 入口
- `GET /api/teams/{id}/mailbox` — 纯后端内部

---

## 已知 GAP / TODO

1. **MCP auto-team 创建**: `aion_create_team` 工具后端尚未实现，前端只能显式调 `POST /api/teams`
2. **团队列表不按 user 过滤**: 当前 `GET /api/teams` 有 bug (#5)，返回全部 team
