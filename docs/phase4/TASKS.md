# Phase 4: 业务层适配 — Hooks

**前置**: Phase 3 完成  
**目标**: 改造 team 相关 Hook，删除旧消息发送逻辑，对齐新 API  
**注意**: 两个 Hook 改动相互独立，可并行执行

---

## Task 4-A: useTeamSession.ts — 删除 sendMessage 方法

**文件**: `src/renderer/pages/team/hooks/useTeamSession.ts`  
**行号**: 第 65–70 行

**改动**:
删除 `sendMessage()` 方法及其内部 `ipcBridge.team.sendMessage.invoke()` 调用。  
消息发送职责已转移到 `AcpSendBox.tsx`，Hook 不再负责发送。

**删除后保留的返回值**:
```typescript
return {
  statusMap,     // 保留
  addAgent,      // 保留
  renameAgent,   // 保留
  removeAgent,   // 保留
  mutateTeam,    // 保留
  // sendMessage — 已删除
};
```

**额外检查**:
- 确认第 31 行的 `ipcBridge.team.ensureSession.invoke()` 调用是否仍在此 Hook 中
- 如在，评估是否应迁移到 TeamPage.tsx 的 `useEffect`（见 Phase 5 Task 5-C）

**验证**:
- [ ] `grep -r "useTeamSession.*sendMessage\|sendMessage.*useTeamSession" src/` → 零调用
- [ ] `bunx tsc --noEmit` 无类型错误
- [ ] 上游组件调用处无编译报错（TS 会暴露残留调用）

---

## Task 4-B: useTeamList.ts — 检查 listChanged 订阅

**文件**: `src/renderer/pages/team/hooks/useTeamList.ts`

**任务**: 读取文件，确认以下两点：

1. 是否有 `team.listChanged` WS 事件订阅 → 若有，确认后端仍保留此事件（根据接口契约，`team.listChanged` 在保留列表中，**无需删除**）
2. 是否有任何直接调用已废弃消息端点的代码 → 若有则删除

**改动预期**: 大概率**无需改动**，只需确认。若有废弃调用再删。

**验证**:
- [ ] 确认 `team.listChanged` 订阅逻辑正常（WS 事件仍有效）
- [ ] 无废弃 API 调用残留
- [ ] `bunx tsc --noEmit` 无错误
