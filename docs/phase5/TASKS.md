# Phase 5: 业务层适配 — 组件

**前置**: Phase 4 完成  
**目标**: 清理组件层 team-specific 消息路由逻辑，统一使用 conversation_id 发消息  
**注意**: Task 5-A 和 5-B 互相独立可并行；Task 5-C 依赖 5-A/5-B 完成后验证

---

## Task 5-A: AcpSendBox.tsx — 删除 team 消息路由分支

**文件**: `src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx`  
**行号**: 第 177–205 行（消息发送条件分支）、第 83–103 行（props 定义）

**改动 1**: 删除 props 中的 `team_id?` 和 `agentSlotId?`

**改动 2**: 将 `executeCommand()` 中的 team-specific 分支合并为统一的单聊调用：

```typescript
// 删除 if (team_id) { ... } else { ... } 分支
// 统一改为：
await ipcBridge.acpConversation.sendMessage.invoke({
  input: displayMessage,
  msg_id,
  conversation_id,  // 从上游传入，team agent 也走此字段
  files,
});
```

**验证**:
- [ ] `grep -r "team_id.*AcpSendBox\|AcpSendBox.*team_id" src/` → 零结果
- [ ] `grep -r "agentSlotId.*AcpSendBox\|AcpSendBox.*agentSlotId" src/` → 零结果
- [ ] `bunx tsc --noEmit` 无类型错误

---

## Task 5-B: TeamChatView.tsx — 删除 team_id / agentSlotId props

**文件**: `src/renderer/pages/team/components/TeamChatView.tsx`  
**行号**: 第 47–55 行（props 类型定义）、第 68–142 行（组件内调用）

**改动**:

```typescript
// 删除
type TeamChatViewProps = {
  conversation: TChatConversation;
  hideSendBox?: boolean;
  // ❌ team_id?: string;     // REMOVED — 消息路由改用 conversation_id
  // ❌ agentSlotId?: string; // REMOVED — 消息路由改用 conversation_id
  agent_name?: string;
};
```

删除传递给 `AcpChat` 的 `team_id={team_id}` 和 `agentSlotId={agentSlotId}` props。

**注意**:
- 检查 `team_id` 是否用于空状态组件（`TeamChatEmptyState`）的展示逻辑
- 如果 `TeamChatEmptyState` 需要 team 上下文，保留 `team_id` 作为可选参数但**不用于消息路由**

**验证**:
- [ ] `AcpChat` 不再接收 `team_id` / `agentSlotId` props
- [ ] `bunx tsc --noEmit` 无类型错误
- [ ] 切换 team agent tab，聊天区正确加载

---

## Task 5-C: AgentStatusBadge.tsx — 状态显示验证

**文件**: `src/renderer/pages/team/components/AgentStatusBadge.tsx`  
**行号**: 第 8–14 行（颜色映射配置）

**任务**: 读取文件，验证颜色映射是否已覆盖 `TeammateStatus` 全部值：

```typescript
// 期望的颜色映射（前端状态）
const STATUS_CONFIG: Record<TeammateStatus, { ... }> = {
  pending:   { color: 'bg-gray-400' },   // 灰色
  idle:      { color: 'bg-gray-400' },   // 灰色
  active:    { color: 'bg-green-500' },  // 绿色（含脉冲动画）
  completed: { color: 'bg-gray-400' },   // 灰色
  failed:    { color: 'bg-red-500' },    // 红色
};
```

`active` 已覆盖后端的 `working / thinking / tool_use`（由 Phase 3 mapper 完成转换）。

**改动预期**: 大概率**只需确认**，若颜色配置已正确则无需改。

**验证**:
- [ ] 后端推送 `working` 状态 → UI 显示绿色脉冲
- [ ] 后端推送 `error` 状态 → UI 显示红色
- [ ] 未知状态 → fallback 到 idle（灰色），不报错

---

## Task 5-D: useTeamSession.ts — 验证 ensureSession 已有调用

**文件**: `src/renderer/pages/team/hooks/useTeamSession.ts`  
**行号**: 第 31 行

**背景**: `ensureSession` 调用**已存在** `useTeamSession` 中（`useEffect` 依赖 `team.id`），Phase 4 Task 4-A 删除 `sendMessage` 时不得碰这行。

**改动**: **无需新增代码**，只需验证现有调用仍在且正确：

```typescript
// 确认第 31 行保留此调用：
void ipcBridge.team.ensureSession.invoke({ team_id: team.id });
```

**验证**:
- [ ] 读 `useTeamSession.ts` 第 31 行，确认调用存在
- [ ] 进入 team 页面，Network 面板可见 `POST /api/teams/{id}/session` 请求
- [ ] 重复进入 team 页面，无额外副作用（接口幂等）

---

## Task 5-E: AionrsSendBox.tsx — 删除 team 消息路由分支

**文件**: `src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx`  
**行号**: 第 91 行（props），第 170–200 行（消息发送分支）

**背景**: `AionrsSendBox` 和 `AcpSendBox` 结构对称，同样有 `team_id` prop 和 `ipcBridge.team.sendMessage/sendMessageToAgent` 调用。

**改动 1**: 删除 props 中的 `team_id?` 和 `agentSlotId?`

**改动 2**: 将 `executeCommand()` 中的 team-specific 分支合并为统一调用：

```typescript
// 删除 if (!team_id) { ... } else { ... } 分支
// 统一改为：
await ipcBridge.aionrsConversation.sendMessage.invoke({
  // 参考 AionrsSendBox 现有非 team 路径参数
  conversation_id,
  content: displayMessage,
  files,
});
```

**注意**: 参考 Task 5-A（AcpSendBox）的改法，保持一致。

**验证**:
- [ ] `grep -r "team_id.*AionrsSendBox\|AionrsSendBox.*team_id" src/` → 零结果
- [ ] `grep -r "agentSlotId.*AionrsSendBox\|AionrsSendBox.*agentSlotId" src/` → 零结果
- [ ] `bunx tsc --noEmit` 无类型错误
