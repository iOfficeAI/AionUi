# 回归清单 — Team MCP 迁移验证

**执行时机**: Phase 6 Task 6-C 手动全链路验证时，逐项对照本清单。每个 Phase 有自己的 MILESTONE.md 验证项，本文件是 Phase 6 的最终兜底清单。

无独立回归 Phase — 各 Phase 在 MILESTONE.md 中自带完成标准和验证步骤，后端联调等待服务端 ready 时再做。

---

## 消息发送验证

- [ ] 创建 team（至少 2 个 agent）
- [ ] 向 lead 发消息 → 消息出现在 lead conversation
  - 验证点: 请求走 `POST /api/conversations/{lead_conversation_id}/messages`，非旧 team 端点
- [ ] 向 teammate 发消息 → 消息出现在 teammate conversation
  - 验证点: 请求走 `POST /api/conversations/{teammate_conversation_id}/messages`
- [ ] 检查消息历史 → 两个 conversation 各自有独立历史
- [ ] 文件随消息发送 → 文件正确关联到 conversation

---

## Agent 状态显示验证

- [ ] Agent idle → `AgentStatusBadge` 显示灰色
- [ ] Agent working（后端推送 `working` / `thinking` / `tool_use`）→ `AgentStatusBadge` 显示绿色 + 脉冲动画
- [ ] Agent 完成 → 状态回到 idle
- [ ] Agent 错误 → `AgentStatusBadge` 显示红色

---

## Team 管理操作验证

- [ ] Add agent → 新 agent 在 tab 栏出现
- [ ] Remove agent → tab 栏移除该 agent，自动切换到 leader tab
- [ ] Rename agent → tab 标题实时更新
- [ ] Rename team → 侧边栏 team 名称更新

---

## Session 生命周期验证

- [ ] 进入 team 页面 → `ensureSession` 被调用（`POST /api/teams/{id}/session`）
- [ ] 重新进入 app → `ensureSession` 被调用，agent 继续工作
- [ ] 关闭 team → 可选调用 `stop`（`DELETE /api/teams/{id}/session`）
- [ ] 并行打开多个 team → 各自独立 session，互不干扰

---

## UI 边界验证

- [ ] 空状态（0 agents）→ 显示提示或加载中，无崩溃
- [ ] 切换 agent tab → 聊天区切换，无 session 额外操作
- [ ] 模式选择器（plan/auto）→ 仍可用，路由正确
- [ ] 消息发送失败 → 显示错误提示，UI 不冻结
- [ ] 后端推送未知 status 值 → 前端 fallback 到 idle，不报错

---

## 代码层验证

- [ ] 全局 grep `ipcBridge.team.sendMessage` → 零调用
- [ ] 全局 grep `ipcBridge.team.sendMessageToAgent` → 零调用
- [ ] 全局 grep `team_id.*AcpSendBox\|AcpSendBox.*team_id` → 零出现
- [ ] TypeScript 编译无错: `bunx tsc --noEmit`
- [ ] Lint 无报错: `bun run lint:fix`

---

## E2E 测试验证

- [ ] `team-create.e2e.ts` — 创建 team 流程不变
- [ ] `team-whitelist.e2e.ts` — agent 权限管理
- [ ] 新增 `team-chat.e2e.ts` — 验证消息发送到正确的 conversation（真实 e2e，禁止 mock）
