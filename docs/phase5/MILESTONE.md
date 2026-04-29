# Phase 5 里程碑

## 状态: ✅ completed (2026-04-29)

- [x] Task 5-A: `AcpSendBox.tsx` 删除 `team_id` / `agentSlotId` props，消息统一走 `conversation.sendMessage`
- [x] Task 5-B: `TeamChatView.tsx` 删除 `team_id` / `agentSlotId` props 传递
- [x] Task 5-C: `AgentStatusBadge.tsx` 颜色映射已覆盖全部 5 个前端状态（确认无需改动）
- [x] Task 5-D: `useTeamSession.ts` ensureSession 调用确认存在
- [x] Task 5-E: `AionrsSendBox.tsx` 删除 `team_id` / `agentSlotId` props，消息统一走单聊路径
- [x] `bunx tsc --noEmit` 全量通过

| Task | 状态 | 负责人 | 完成时间 |
|------|------|--------|----------|
| 5-A AcpSendBox 改造 | ✅ | dev-sendbox | 2026-04-29 |
| 5-B TeamChatView 改造 | ✅ | dev-chatview | 2026-04-29 |
| 5-C AgentStatusBadge 确认 | ✅ | dev-chatview | 2026-04-29 |
| 5-D ensureSession 确认 | ✅ | dev-chatview | 2026-04-29 |
| 5-E AionrsSendBox 改造 | ✅ | dev-sendbox | 2026-04-29 |
