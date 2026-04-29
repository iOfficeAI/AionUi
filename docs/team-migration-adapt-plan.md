# Team API 适配方案 - 前端架构设计

**调研日期**: 2026-04-29  
**调研员**: B  
**对标版本**: aionui-backend 新 Team API 规范  

## 概览

服务端删除了旧的 team 消息端点后，前端需要统一用单聊 API 收发消息。核心变化：

| 类别 | 旧设计 | 新设计 |
|------|--------|--------|
| **发消息** | `team.sendMessage()` / `team.sendMessageToAgent()` | 统一 `conversation.sendMessage()` |
| **拉历史** | `team.getMessages()` | `conversation.getMessages()` (实现尚需确认) |
| **WS 事件** | 多个 team-level 事件 | 4 个 agent 事件 + conversation 事件 |
| **Session 管理** | App 内部维护 | `POST /api/teams/{id}/session` 前缀操作 |
| **MCP 处理** | 前端触发 wake/mailbox 逻辑 | 后端完全接管 |

---

## 1. 消息发送链路适配 (核心改动)

### 当前实现 (AcpSendBox.tsx 第 177-205 行)

```typescript
// 发送到 team lead
if (team_id) {
  if (agentSlotId) {
    await ipcBridge.team.sendMessageToAgent.invoke({
      team_id,
      slot_id: agentSlotId,
      content: displayMessage,
      files,
    });
  } else {
    await ipcBridge.team.sendMessage.invoke({ 
      team_id, 
      content: displayMessage, 
      files 
    });
  }
} else {
  // 普通单聊
  await ipcBridge.acpConversation.sendMessage.invoke({
    input: displayMessage,
    msg_id,
    conversation_id,
    files,
  });
}
```

### 新实现目标

删除 team-specific 逻辑，**统一用 `conversation.sendMessage()`**：

```typescript
// 无需区分 team_id，所有消息都走 conversation
await ipcBridge.conversation.sendMessage.invoke({
  input: displayMessage,
  msg_id,
  conversation_id,  // 从 TeamAgentResponse.conversation_id 取
  files,
});
```

**改动点**：
- `AcpSendBox.tsx` 第 177-205 行：删除 team_id 条件分支
- `executeCommand()` 函数：移除 `team_id` / `agentSlotId` 参数，简化为单聊模式
- 下层组件同步删除 `team_id` / `agentSlotId` 作为路由参数

---

## 2. 前端 Hooks 改造清单

### 2.1 useTeamSession.ts

**文件**: `/src/renderer/pages/team/hooks/useTeamSession.ts`  
**当前职责**: 维护 agent 状态、管理 session、路由消息发送

| 行号 | 改动 | 原因 |
|------|------|------|
| 31 | 删除 `ipcBridge.team.ensureSession.invoke()` | 改为进入 team 页时单独调用 ensure session（见 3.2）|
| 65-70 | **删除 `sendMessage()` 方法** | 消息发送改用 `conversation.sendMessage()` |
| 72-95 | **保留** `addAgent()` / `renameAgent()` / `removeAgent()` | 这些是 team 管理操作，无变化 |

**新 API 签名**：

```typescript
export function useTeamSession(team: TTeam) {
  // 返回值改为：
  return {
    statusMap,           // 保留
    addAgent,           // 保留
    renameAgent,        // 保留
    removeAgent,        // 保留
    mutateTeam,         // 保留
    // ❌ sendMessage removed
  };
}
```

### 2.2 TeamTabsContext.tsx

**文件**: `/src/renderer/pages/team/hooks/TeamTabsContext.tsx`  
**当前职责**: 维护 agent tab 状态、切换、重排序

**改动**: **无需改动**

虽然 `TeamTabsContextValue` 中 `switchTab` 等方法与消息发送无关，所以保持不变。

---

## 3. 前端组件改造

### 3.1 TeamChatView.tsx (消息路由点)

**文件**: `/src/renderer/pages/conversation/platforms/acp/AcpChat.tsx` 的上游  
**当前职责**: 根据 `team_id` 判断是否传递路由参数

| 行号 | 改动 | 说明 |
|------|------|------|
| 78-81 | **删除** `team_id` 属性传递 | `AcpChat` 不再接收 team_id |
| 78-81 | **删除** `agentSlotId` 属性传递 | 消息路由统一用 conversation_id |
| 50-54 | **保留** 注释但改为说明 | "团队消息通过 conversation_id 路由" |

**新代码框架**:

```typescript
type TeamChatViewProps = {
  conversation: TChatConversation;
  hideSendBox?: boolean;
  // ❌ team_id?: string;  // REMOVED
  // ❌ agentSlotId?: string;  // REMOVED
  agent_name?: string;
};

const TeamChatView: React.FC<TeamChatViewProps> = ({ 
  conversation, 
  hideSendBox, 
  agent_name 
}) => {
  // 团队消息通过 conversation.id 自动路由到对应 agent
  const emptySlot = team_id ? <TeamChatEmptyState conversation_id={conversation.id} /> : undefined;
  // ...
  return (
    <AcpChat
      conversation_id={conversation.id}
      // ❌ team_id={team_id}  // REMOVED
      // ❌ agentSlotId={agentSlotId}  // REMOVED
      agent_name={agent_name}
      hideSendBox={hideSendBox}
      emptySlot={emptySlot}
    />
  );
};
```

**但等等**: 需要确认 `team_id` 是否用于其他逻辑（如空状态、权限检查）。见 3.3。

### 3.2 TeamPage.tsx / 主容器

**当前职责**: 组织 team tabs、管理 session、渲染聊天区

**改动**:

| 部分 | 改动 | 理由 |
|------|------|------|
| 进入 team 时 | 显式调用 `POST /api/teams/{id}/session` | 确保 backend session 启动 |
| 切换 agent tab 时 | 无需做任何 session 操作 | 后端状态机处理 |
| 退出 team 时 | 可选调用 `DELETE /api/teams/{id}/session` | 或保留 session 幂等 ensure |

**新 session 管理模式**:

```typescript
// 进入 team 页面
useEffect(() => {
  const ensureTeamSession = async () => {
    try {
      await ipcBridge.team.ensureSession.invoke({ team_id });
    } catch (err) {
      console.error('Failed to ensure team session:', err);
    }
  };
  
  if (team_id) {
    void ensureTeamSession();
  }
}, [team_id]);

// 订阅 agent 状态变更（保持不变）
useEffect(() => {
  const unsub = ipcBridge.team.agentStatusChanged.on((event) => {
    // update UI
  });
  return unsub;
}, []);
```

### 3.3 TeamChatEmptyState.tsx

**文件**: `/src/renderer/pages/team/components/TeamChatEmptyState.tsx`  
**当前职责**: 显示 team 欢迎界面

**改动**: **待确认**

- 该组件是否需要 `team_id` 来展示 agent 身份？
- 如果仅用 `conversation_id` 获取元数据，则**无需改动**
- 如果需要 team 上下文（如 team 名称、agent 角色），则需要向上传递 `team_id`

**建议**: 保留 `team_id` 作为可选参数，但不用于消息路由。

### 3.4 AgentStatusBadge.tsx

**文件**: `/src/renderer/pages/team/components/AgentStatusBadge.tsx`  
**改动**: **需要更新状态枚举映射**

**当前状态枚举** (teamTypes.ts 第 48 行):
```typescript
type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed';
```

**新服务端状态枚举** (backend api.md):
```
'idle | working | thinking | tool_use | completed | error'
```

**改动方案**:

```typescript
// 前端保留现有 5 个状态
export type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed';

// 在 teamMapper.ts 中添加转换层
function toStatus(raw: string | undefined): TeammateStatus {
  const statusMap: Record<string, TeammateStatus> = {
    'idle': 'idle',
    'working': 'active',      // backend working → frontend active
    'thinking': 'active',     // backend thinking → frontend active
    'tool_use': 'active',     // backend tool_use → frontend active
    'completed': 'completed',
    'error': 'failed',        // backend error → frontend failed
    'pending': 'pending',
  };
  return statusMap[raw ?? ''] ?? 'idle';
}

// AgentStatusBadge.tsx：更新颜色映射（保持不变或增强）
const STATUS_CONFIG: Record<TeammateStatus, { color: string }> = {
  pending: { color: 'bg-gray-400' },
  idle: { color: 'bg-gray-400' },
  active: { color: 'bg-green-500' },      // 已处理 working/thinking/tool_use
  completed: { color: 'bg-gray-400' },
  failed: { color: 'bg-red-500' },
};
```

---

## 4. ipcBridge 适配

### 4.1 删除的 API

以下 ipcBridge.team 方法**在后端 HTTP 层已删除**，前端需同步移除：

```typescript
// ❌ 删除
team.sendMessage: httpPost<void, { team_id: string; content: string; files?: string[] }>(
  (p) => `/api/teams/${p.team_id}/messages`,  // 后端已删除此路由
  (p) => ({ content: p.content, files: p.files })
),

team.sendMessageToAgent: httpPost<void, { team_id: string; slot_id: string; content: string; files?: string[] }>(
  (p) => `/api/teams/${p.team_id}/agents/${p.slot_id}/messages`,  // 后端已删除此路由
  (p) => ({ content: p.content, files: p.files })
),
```

**改动位置**: `src/common/adapter/ipcBridge.ts` 第 1612-1619 行

### 4.2 保留且无需改动的 API

```typescript
// ✅ 保留（team 管理）
team.create              // POST /api/teams
team.list                // GET /api/teams
team.get                 // GET /api/teams/{id}
team.remove              // DELETE /api/teams/{id}
team.addAgent            // POST /api/teams/{id}/agents
team.removeAgent         // DELETE /api/teams/{id}/agents/{slot_id}
team.renameAgent         // PATCH /api/teams/{id}/agents/{slot_id}/name
team.renameTeam          // PATCH /api/teams/{id}/name
team.setSessionMode      // POST /api/teams/{id}/session-mode
team.updateWorkspace     // POST /api/teams/{id}/workspace

// ✅ 保留（session 管理）
team.ensureSession       // POST /api/teams/{id}/session (幂等)
team.stop                // DELETE /api/teams/{id}/session

// ✅ 保留（WS 事件）
team.agentStatusChanged  // team.agent.status
team.agentSpawned        // team.agent.spawned
team.agentRemoved        // team.agent.removed
team.agentRenamed        // team.agent.renamed
team.listChanged         // team.list-changed
team.mcpStatus           // team.mcp.status (内部用)
```

### 4.3 新增 API（若需要）

**消息历史**: 服务端未来可能提供 `GET /api/conversations/{conversation_id}/messages`

**当前状态**: 
- 前端已有 `conversation.getMessages` 的调用逻辑吗？需要搜索代码确认
- 如果 team 消息历史需要特殊处理，后期单独适配

---

## 5. 类型定义适配 (teamTypes.ts & teamMapper.ts)

### 5.1 不需要改动的类型

```typescript
// src/common/types/teamTypes.ts

// ✅ 保留
export type TeammateRole = 'leader' | 'teammate';
export type WorkspaceMode = 'shared' | 'isolated';
export type TeamAgent = { ... };  // 包含 conversation_id 字段
export type TTeam = { ... };
```

### 5.2 状态枚举适配

**teamTypes.ts** 第 48 行：

```typescript
// ❌ 旧
export type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed';

// ✅ 新：可选保留前端枚举并在 mapper 转换，或改为服务端枚举
// 建议：**保留前端枚举**，在 mapper 做转换，以便 UI 保持稳定
```

**teamMapper.ts** 第 35-37 行：

```typescript
// 改进 toStatus 函数以支持新的后端状态
function toStatus(raw: string | undefined): TeammateStatus {
  const statusMap: Record<string, TeammateStatus> = {
    'idle': 'idle',
    'working': 'active',
    'thinking': 'active',
    'tool_use': 'active',
    'completed': 'completed',
    'error': 'failed',
    'pending': 'pending',
  };
  return statusMap[raw ?? ''] ?? 'idle';
}
```

---

## 6. 改动清单 (文件+行号)

### 6.1 删除消息发送相关代码

| 文件 | 行号 | 改动 |
|------|------|------|
| `src/common/adapter/ipcBridge.ts` | 1612-1619 | 删除 `team.sendMessage` 和 `team.sendMessageToAgent` |
| `src/renderer/pages/team/hooks/useTeamSession.ts` | 65-70 | 删除 `sendMessage()` 方法和相关 invoke |
| `src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx` | 177-205 | 删除 team-specific 消息发送分支 |

### 6.2 更新组件接口

| 文件 | 行号 | 改动 |
|------|------|------|
| `src/renderer/pages/team/components/TeamChatView.tsx` | 47-55 | 删除 `team_id?` 和 `agentSlotId?` 属性 |
| `src/renderer/pages/team/components/TeamChatView.tsx` | 68-142 | 所有 Chat 组件调用中删除 `team_id` / `agentSlotId` props |
| `src/renderer/pages/conversation/platforms/acp/AcpChat.tsx` | TBD | 删除 `team_id?` / `agentSlotId?` props 定义 |
| `src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx` | 83-103 | 删除 `team_id?` / `agentSlotId?` 属性定义 |

### 6.3 状态枚举适配

| 文件 | 行号 | 改动 |
|------|------|------|
| `src/common/adapter/teamMapper.ts` | 35-41 | 更新 `toStatus()` 映射表以支持新的后端状态 |
| `src/renderer/pages/team/components/AgentStatusBadge.tsx` | 8-14 | 检查颜色映射是否需要调整（可能不需要，依赖新状态来自哪里）|

### 6.4 Session 管理更新

| 文件 | 行号 | 改动 |
|------|------|------|
| 待定 (TeamPage.tsx 或主 team 入口) | TBD | 在 team 页面进入时调用 `ipcBridge.team.ensureSession.invoke()` |
| 待定 (TeamPage.tsx 或主 team 入口) | TBD | 可选：在 team 页面退出时调用 `ipcBridge.team.stop.invoke()` |

---

## 7. 前端期望的 HTTP/WS 契约

### 7.1 POST /api/teams/{id}/session (幂等)

**前端调用时机**: 进入 team 页面 / 刷新应用  
**幂等性**: 是（重复调用无副作用）

```bash
POST /api/teams/t_xxx/session
Authorization: Bearer <JWT>
Content-Type: application/json

# 无请求体或空体
```

**成功响应 (200)**:
```json
{
  "ok": true,
  "message": "Session started"
}
```

### 7.2 DELETE /api/teams/{id}/session

**前端调用时机**: 主动关闭 team（或离开时可选）  
**用途**: 释放后端 TCP 服务器、停止 agent 轮询

### 7.3 消息发送 → POST /api/conversations/{conversation_id}/messages

**前端路由**: 统一使用 `ipcBridge.conversation.sendMessage.invoke()`

```bash
POST /api/conversations/conv_xxx/messages
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "content": "user message",
  "msg_id": "msg_123",
  "files": ["path/to/file"],
  "loading_id": null,
  "inject_skills": false
}
```

**成功响应 (200)**: `{ "ok": true }`

### 7.4 WS 事件订阅 (现有，无变化)

**前端监听的 4 个 team 事件**（通过 `wsEmitter`）:

| Event Name | Payload | UI 更新点 |
|------------|---------|----------|
| `team.agent.status` | `{ team_id, slot_id, status, last_message? }` | `AgentStatusBadge`, team tab icon |
| `team.agent.spawned` | `{ team_id, agent: TeamAgent }` | 刷新 team 详情，add new tab |
| `team.agent.removed` | `{ team_id, slot_id }` | 移除 tab，切换到 leader |
| `team.agent.renamed` | `{ team_id, slot_id, old_name, new_name }` | 更新 tab title |

**消息内容**: 通过 `conversation.message.*` / `conversation.stream.*` WS 事件推送（现有机制不变）

---

## 8. 回归清单 (改完后验证清单)

### 8.1 消息发送验证

- [ ] **创建 team** → 2 个 agent
- [ ] **向 lead 发消息** → 消息出现在 lead conversation
  - 验证点: 消息通过 `POST /api/conversations/{lead_conversation_id}/messages` 路由
- [ ] **向 teammate 发消息** → 消息出现在 teammate conversation
  - 验证点: 消息通过 `POST /api/conversations/{teammate_conversation_id}/messages` 路由
- [ ] **检查消息历史** → 两个 conversation 各自有历史
- [ ] **文件上传随消息发送** → 文件被正确关联到 conversation

### 8.2 Agent 状态变更验证

- [ ] **Agent idle** → `AgentStatusBadge` 显示灰色
- [ ] **Agent working** → `AgentStatusBadge` 显示绿色 + 脉冲动画
- [ ] **Agent 完成** → 状态回到 idle
- [ ] **Agent 错误** → `AgentStatusBadge` 显示红色

### 8.3 Team 管理验证

- [ ] **Add agent** → 新 agent 在 tab 栏出现
- [ ] **Remove agent** → tab 栏移除该 agent，自动切换到 leader
- [ ] **Rename agent** → tab 标题实时更新
- [ ] **Rename team** → 侧边栏 team 名称更新

### 8.4 Session 生命周期验证

- [ ] **进入 team** → `ensureSession` 被调用
- [ ] **重新进入 app** → `ensureSession` 被调用，agent 继续工作
- [ ] **关闭 team** → 可选调用 `stop` 释放资源
- [ ] **并行打开多个 team** → 各自独立 session，互不干扰

### 8.5 UI 边界验证

- [ ] **空状态** (0 agents) → 显示提示或加载中
- [ ] **切换 agent tab** → 聊天区切换，无需 session 操作
- [ ] **模式选择器** (plan/auto) → 仍然可用，路由到 `POST /api/conversations/{id}/mode`
- [ ] **错误处理** → 消息发送失败显示错误提示，不冻结 UI

### 8.6 集成验证 (E2E)

- [ ] **team-create.e2e.ts** — 创建 team 的流程不变
- [ ] **team-whitelist.e2e.ts** — agent 权限管理
- [ ] 新增 **team-chat.e2e.ts** — 验证消息发送到正确的 conversation

---

## 9. 风险与迁移策略

### 9.1 高风险改动

1. **删除 team-specific 消息发送**
   - 风险: 如果某处代码仍依赖 `team.sendMessage`，会崩溃
   - 缓解: 代码审查 + grep 全量搜索 + 编译检查
   
2. **状态枚举转换**
   - 风险: 后端发来 `working` 但前端期望 `active`，或新状态未在 mapper 中
   - 缓解: 在 `toStatus()` 中加默认值 fallback，监控错误日志

3. **组件接口变更**
   - 风险: 上游调用者仍传递 `team_id` / `agentSlotId`
   - 缓解: TypeScript 编译检查 + 逐步移除（分两个 PR）

### 9.2 分阶段迁移策略

**阶段 1** (PR #1 - 删除消息发送分支):
- 删除 `ipcBridge.team.sendMessage` / `sendMessageToAgent`
- 更新 `AcpSendBox.executeCommand()` 统一用 `conversation.sendMessage`
- 更新 `useTeamSession` 删除 `sendMessage()` 方法

**阶段 2** (PR #2 - 清理组件接口):
- 删除 `TeamChatView` / 各 Chat 组件的 `team_id` / `agentSlotId` props
- 更新调用者不再传递这两个 props

**阶段 3** (PR #3 - 状态枚举 + Session 管理):
- 更新 `teamMapper.toStatus()` 支持新的后端状态
- 在 team 页面进入时确保 `ensureSession` 被调用

**阶段 4** (回归测试 + 上线)

### 9.3 滚动还原方案

如果上线后发现问题，可快速还原 team 消息路由：

```typescript
// 临时补丁：恢复 team-specific 路由
if (team_id) {
  await ipcBridge.conversation.sendMessage.invoke({
    input: displayMessage,
    msg_id,
    conversation_id,  // 从 team agent 取，不变
    files,
  });
} else {
  // ... 单聊路由
}
```

---

## 10. 后续未实现项 (服务端 TODO)

服务端文档注明的 TODO：

1. **MCP auto-team 创建** — `aion_create_team` 工具尚未实现，前端仍需显式 `POST /api/teams`
2. **消息历史 API** — 若 `GET /api/conversations/{conversation_id}/messages` 返回结果不完整，需要后端补充
3. **Task board HTTP 入口** — 目前仅支持 MCP 工具操作，无 HTTP 端点

---

## 检查清单 (调研完成)

- [x] 读取服务端 frontend-guide.md 和 api.md
- [x] 分析前端现有消息发送链路 (AcpSendBox)
- [x] 审查 ipcBridge team 端点定义
- [x] 检查 hooks (useTeamSession, useTeamList, TeamTabsContext)
- [x] 查看组件接口 (TeamChatView, TeamCreateModal, AgentStatusBadge)
- [x] 识别状态枚举需要的转换
- [x] 制定改动清单和验证清单

---

**调研报告完成** ✅
