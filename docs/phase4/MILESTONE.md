# Phase 4 里程碑

**完成标准**: 以下全部满足，Phase 4 方可标记完成，Phase 5 方可启动。

- [ ] Task 4-A: `useTeamSession.ts` 中 `sendMessage()` 方法已删除，返回值无此字段
- [ ] Task 4-B: `useTeamList.ts` 已审查，无废弃 API 调用，`team.listChanged` 订阅保留
- [ ] 所有 Hook 调用方无 TS 编译错误（编译会暴露仍调用 `sendMessage` 的上游）
- [ ] `bunx tsc --noEmit` 全量通过
