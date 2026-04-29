# Phase 2 Milestone

## 状态: ✅ completed (2026-04-29)

## 完成标准

- [x] `src/process/team/` 已删除（27 文件，~4,567 行）
- [x] `src/process/task/teamEventBus.ts` 已创建（从 team/ 迁移）
- [x] `src/process/bridge/teamBridge.ts` 已删除
- [x] 所有外部文件 `@process/team` import 已清零
- [x] `ipcBridge.ts` 中 `team.mcpStatus` 已删除
- [x] `scripts/build-mcp-servers.js` 中 team MCP 构建已移除
- [x] 依赖已删除 team/ 的测试文件已删除
- [x] `bunx tsc --noEmit` 零错误
- [x] `grep -r "@process/team" src/` 无结果

## 进度

| Task | 状态 | 负责人 | 完成时间 |
|------|------|--------|----------|
| 2.1 teamEventBus 迁移至 task/ | ✅ | dev-2-1 | 2026-04-29 |
| 2.2 删除 teamBridge.ts + 清理 bridge/index.ts | ✅ | dev-bridge | 2026-04-29 |
| 2.3 清理 initBridge.ts | ✅ | dev-bridge | 2026-04-29 |
| 2.4 清理 agent/acp/index.ts | ✅ | dev-acp | 2026-04-29 |
| 2.5 清理 AcpAgentV2.ts | ✅ | dev-acp | 2026-04-29 |
| 2.6 清理 AcpAgentManager.ts + AcpRuntime.ts + agentUtils.ts | ✅ | dev-acp | 2026-04-29 |
| 2.7 删除 ipcBridge.ts 废弃方法（仅 mcpStatus） | ✅ | dev-ipc-scripts | 2026-04-29 |
| 2.8 删除 src/process/team/ 目录 | ✅ | dev-cleanup | 2026-04-29 |
| 2.9 修改 build-mcp-servers.js | ✅ | dev-ipc-scripts | 2026-04-29 |
| 2.10 清理 team 测试文件 | ✅ | dev-cleanup | 2026-04-29 |
| 2.11 全量验证 | ✅ | dev-cleanup | 2026-04-29 |
