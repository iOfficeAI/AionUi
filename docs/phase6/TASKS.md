# Phase 6: 清理废弃 API + 验证回归

**前置**: Phase 5 完成（所有 SendBox 组件 team 路由已清除）  
**目标**: 删除 ipcBridge 废弃端点，执行全量验证，确认迁移无回归

---

## Task 6-A: ipcBridge.ts — 删除废弃 team 消息发送 API

**文件**: `src/common/adapter/ipcBridge.ts`  
**行号**: 第 1612–1619 行

**前置**: Phase 5 Task 5-A 和 5-E 均已完成（AcpSendBox + AionrsSendBox 不再调用这两个方法）

**改动**: 删除两个已在后端移除的端点定义：

```typescript
// ❌ 删除以下两项
team.sendMessage: httpPost<void, { team_id: string; content: string; files?: string[] }>(
  (p) => `/api/teams/${p.team_id}/messages`,
  (p) => ({ content: p.content, files: p.files })
),

team.sendMessageToAgent: httpPost<void, { team_id: string; slot_id: string; content: string; files?: string[] }>(
  (p) => `/api/teams/${p.team_id}/agents/${p.slot_id}/messages`,
  (p) => ({ content: p.content, files: p.files })
),
```

**验证**:
- [ ] `grep -r "ipcBridge.team.sendMessage\b" src/` → 零结果
- [ ] `grep -r "ipcBridge.team.sendMessageToAgent" src/` → 零结果
- [ ] `bunx tsc --noEmit` 无类型错误
- [ ] `bun run lint:fix` 无报错

---

## Task 6-B: 代码层静态验证（全量 grep）

**执行者**: 开发人员（或 CI）

```bash
# 1. 无废弃 API 调用
grep -r "ipcBridge.team.sendMessage\b" src/ && echo "FAIL" || echo "OK"
grep -r "ipcBridge.team.sendMessageToAgent" src/ && echo "FAIL" || echo "OK"

# 2. 无 team_id 残留在消息发送路径
grep -r "team_id.*executeCommand\|executeCommand.*team_id" src/ && echo "FAIL" || echo "OK"

# 3. 编译 + lint
bunx tsc --noEmit
bun run lint:fix
```

- [ ] 所有 grep 检查通过（零结果）
- [ ] TypeScript 编译无错
- [ ] Lint 无报错

---

## Task 6-C: 手动全链路验证

按 `docs/phase1/REGRESSION.md` 逐项操作，截图记录关键步骤：

**消息发送**:
- [ ] 创建 team → 2 个 agent
- [ ] 向 lead 发消息，验证 Network 请求走 `POST /api/conversations/{lead_conv_id}/messages`
- [ ] 向 teammate 发消息，验证走各自 `conversation_id`
- [ ] 消息历史正确显示

**Agent 状态**:
- [ ] Agent 收到消息后状态从 idle → working → idle（WS 事件驱动）
- [ ] `AgentStatusBadge` 颜色正确变化

**Session**:
- [ ] 进入 team 页面 → `POST /api/teams/{id}/session` 被调用
- [ ] 离开后重新进入 → session 仍然正常

---

## Task 6-D: E2E 测试

**现有测试**（确保未回归）:
- [ ] `bun run test` 全量通过（含现有 team-create、team-whitelist）

**新增测试**:
- [ ] 编写 `team-chat.e2e.ts` — 验证消息发送到正确 conversation
  - 禁止 mock，禁止跳过正式流程直接调 API
  - 必须走真实 UI 操作（输入框 → 发送按钮 → 验证消息出现）
- [ ] 新 E2E 通过

---

## Task 6-E: 回归报告

完成后在本目录创建 `VERIFY-REPORT.md`，记录：
- 验证日期
- 每项检查结果（pass/fail）
- 发现的问题及修复方式（若有）
- 截图路径（若有）
