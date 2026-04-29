# Phase 2 Milestone

## 状态: pending

## 完成标准

- [ ] `src/process/team/` 已删除（27 文件，~4,567 行）
- [ ] `src/process/task/teamEventBus.ts` 已创建（从 team/ 迁移；目标目录已存在，无需新建 common/）
- [ ] `src/process/bridge/teamBridge.ts` 已删除
- [ ] 所有外部文件 `@process/team` import 已清零（包含 AcpAgentManager.ts 中的 team guide 引用）
- [ ] `ipcBridge.ts` 中 `team.mcpStatus` 已删除（`sendMessage`/`sendMessageToAgent` 推迟到 Phase 6 Task 6-A；`listChanged` 保留，后端仍使用）
- [ ] `scripts/build-mcp-servers.js` 中 team MCP 构建已移除
- [ ] 依赖已删除 team/ 的测试文件已删除（45 个 team 相关测试文件中的 process/integration/e2e 部分）
- [ ] `bunx tsc --noEmit` 零错误
- [ ] `bun run test` 通过
- [ ] `grep -r "@process/team" src/` 无结果

## 进度

（执行时更新）

| Task | 状态 | 负责人 | 完成时间 |
|------|------|--------|----------|
| 2.1 teamEventBus 迁移至 task/ | pending | - | - |
| 2.2 删除 teamBridge.ts + 清理 bridge/index.ts | pending | - | - |
| 2.3 清理 initBridge.ts | pending | - | - |
| 2.4 清理 agent/acp/index.ts | pending | - | - |
| 2.5 清理 AcpAgentV2.ts | pending | - | - |
| 2.6 清理 AcpAgentManager.ts + AcpRuntime.ts + agentUtils.ts | pending | - | - |
| 2.7 删除 ipcBridge.ts 废弃方法（仅 mcpStatus） | pending | - | - |
| 2.8 删除 src/process/team/ 目录 | pending | - | - |
| 2.9 修改 build-mcp-servers.js | pending | - | - |
| 2.10 清理 team 测试文件 | pending | - | - |
| 2.11 全量验证 | pending | - | - |
