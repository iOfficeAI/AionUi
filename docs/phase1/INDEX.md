# Team MCP 前后端分离 — Phase 索引

## Phase 1: 任务拆分（已完成）

产出本文档和各 phase 任务清单。

- 目录: `docs/phase1/`
- 产出:
  - `INDEX.md` — 本文件，全局 Phase 索引
  - `INTERFACE-CONTRACTS.md` — 基于服务端文档的接口契约
  - `REGRESSION.md` — 全部 phase 完成后的回归清单

---

## Phase 2: 清理旧代码（前置）

- 目录: `docs/phase2/`（见 `docs/team-migration-delete-plan.md`）
- 前置: 无
- 内容: 删除 `src/process/team/` + 清理所有 import 引用
- 状态: 待启动（必须在 Phase 3 之前完成）

---

## Phase 3: 非业务层适配（可并行）

- 目录: `docs/phase3/`
- 前置: Phase 2 完成
- 内容: teamTypes.ts 枚举注释 / teamMapper.ts 状态映射适配（`working/thinking/tool_use/error` → 前端状态）
- 内部子任务可并行执行
- **注意**: ipcBridge.ts 废弃 API 删除已移至 Phase 6（组件改完后再删）

---

## Phase 4: 业务层适配 — Hooks

- 目录: `docs/phase4/`
- 前置: Phase 3 完成
- 内容: useTeamSession.ts 删除 sendMessage 方法 / useTeamList.ts 确认 listChanged 订阅

---

## Phase 5: 业务层适配 — 组件

- 目录: `docs/phase5/`
- 前置: Phase 4 完成
- 内容:
  - AcpSendBox.tsx team 消息路由清除
  - AionrsSendBox.tsx team 消息路由清除（与 AcpSendBox 对称）
  - TeamChatView.tsx props 清理
  - AgentStatusBadge.tsx 状态映射验证
  - useTeamSession.ts 中 ensureSession 调用验证（已有，无需新增）

---

## Phase 6: 清理废弃 API + 验证回归

- 目录: `docs/phase6/`
- 前置: Phase 5 完成
- 内容:
  - ipcBridge.ts 删除 `team.sendMessage` / `team.sendMessageToAgent`（Phase 5 所有 SendBox 改完后才可执行）
  - 全量 grep 静态验证
  - 手动全链路验证 + E2E 测试
  - 回归报告存档
