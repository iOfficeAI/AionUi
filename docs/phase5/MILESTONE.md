# Phase 5 里程碑

**完成标准**: 以下全部满足，Phase 5 方可标记完成，Phase 6 方可启动。

- [ ] Task 5-A: `AcpSendBox.tsx` 删除 `team_id` / `agentSlotId` props，消息统一走 `conversation.sendMessage`
- [ ] Task 5-B: `TeamChatView.tsx` 删除 `team_id` / `agentSlotId` props 传递
- [ ] Task 5-C: `AgentStatusBadge.tsx` 颜色映射已覆盖全部 5 个前端状态
- [ ] Task 5-D: `useTeamSession.ts` 第 31 行 `ensureSession` 调用确认存在，Network 可验证
- [ ] Task 5-E: `AionrsSendBox.tsx` 删除 `team_id` / `agentSlotId` props，消息统一走单聊路径
- [ ] `bunx tsc --noEmit` 全量通过
- [ ] `bun run lint:fix` 无报错
- [ ] 全局 grep `ipcBridge.team.sendMessage\b` → 零结果（所有 SendBox 改完后方可通过此项）
- [ ] 全局 grep `team_id.*sendMessage\|sendMessage.*team_id` → 零结果
