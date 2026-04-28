# E2E Test Coverage Audit — Team MCP vs PRD

**Date**: 2026-04-28  
**Scope**: 27 PRD feature points vs 19 E2E test files  
**Result**: 20/27 features covered (74%), 7 gaps identified

---

## Coverage Matrix

| # | 功能 | 有测试 | 测试文件 | 备注 |
|----|------|--------|---------|------|
| 1 | 点击 Sider 创建按钮 → 打开 Modal | ✅ | team-create.e2e.ts | 验证 modal 打开、输入框可见 |
| 2 | 填写名称 + 选 Leader + 选 Workspace → 创建成功 | ✅ | team-create.e2e.ts | 支持 claude/codex/gemini 多后端 |
| 3 | 创建后自动导航到 /team/{id} | ✅ | team-create.e2e.ts | URL 验证 + sidebar 显示 |
| 4 | 创建时的验证（空名称、未选 leader） | ⚠️ 部分 | team-name-validation.e2e.ts | 仅覆盖空名称 + 空格，未覆盖"未选 leader" |
| 5 | Agent Tab 栏显示（状态指示器、leader冠标、权限badge） | ✅ | team-member-ops.e2e.ts, team-member-init-failure.e2e.ts | 状态 badge + 权限标记已验证 |
| 6 | Tab 切换 | ✅ | team-tab-context.e2e.ts, team-member-messaging.e2e.ts | 验证 leader/member tab 切换 + 历史保留 |
| 7 | Tab 拖拽排序 | ❌ | - | **缺失**：无 drag-drop 测试 |
| 8 | 全屏模式 | ✅ | team-view-modes.e2e.ts | fullscreen 按钮切换验证 |
| 9 | 群聊：在 team 页面发消息 → leader 收到并回复 | ✅ | team-communication.e2e.ts | UI 发消息 → AI 回复流程 |
| 10 | 单聊：切到 member tab → 发消息 → 该 agent 收到 | ✅ | team-member-messaging.e2e.ts | 直接在 member tab 发消息 → 消息可见 |
| 11 | 消息发送失败的错误处理 | ❌ | - | **缺失**：无网络错误/超时/失败场景 |
| 12 | 重命名 agent（双击 tab） | ✅ | team-member-ops.e2e.ts | 双击 → 输入 → Enter 验证 |
| 13 | 删除 agent（X 按钮 + 确认） | ✅ | team-member-ops.e2e.ts | 移除成员 + 确认模态 |
| 14 | 添加 agent（⚠️ 无 UI 入口，仅 API） | ⚠️ | team-member-ops.e2e.ts, team-agent-lifecycle.e2e.ts | 通过 IPC/leader 聊天命令，无 UI 按钮 |
| 15 | 重命名 team（sidebar 右键菜单） | ✅ | team-rename-pin.e2e.ts | 右键菜单 → rename modal → 验证 |
| 16 | 删除 team（sidebar 右键菜单 + 确认） | ✅ | team-delete.e2e.ts | 右键菜单 → 确认 modal → 导航离开 |
| 17 | Pin team | ✅ | team-rename-pin.e2e.ts | pin/unpin 改变排序 + 验证 |
| 18 | Session mode 切换 | ✅ | team-session-mode.e2e.ts | 模式选择器 → 下拉菜单 → 验证持久化 |
| 19 | Workspace 更新 | ✅ | team-workspace-migration.e2e.ts | 工作空间迁移 → 所有 agent 同步更新 |
| 20 | 单聊转 Team：agent 调用 aion_create_team | ❌ | - | **缺失**：无单聊转群聊流程测试 |
| 21 | agent.status 变更 → UI 状态指示器更新 | ✅ | team-agent-lifecycle.e2e.ts | active badge 出现/消失 |
| 22 | agent.spawned → tab 出现 | ✅ | team-agent-lifecycle.e2e.ts, team-tab-context.e2e.ts | leader 添加成员 → tab 出现 |
| 23 | agent.removed → tab 消失 | ✅ | team-agent-lifecycle.e2e.ts | leader fire 成员 → tab 消失 |
| 24 | list-changed → sidebar 列表刷新 | ✅ | team-rename-pin.e2e.ts | team 创建/删除 → sidebar 刷新 |
| 25 | 访问已删除 team 的 URL | ✅ | team-stale-url.e2e.ts | 导航到已删 team URL → 无崩溃 |
| 26 | Agent 初始化失败 | ✅ | team-member-init-failure.e2e.ts | 失败 badge 显示 + 移除按钮 |
| 27 | 网络断连恢复 | ❌ | - | **缺失**：无网络断连/重连测试 |

---

## 覆盖率统计

- **完全覆盖**: 20/27 (74%)
- **部分覆盖**: 1/27 (4%) — 项目 #4 仅覆盖空名称
- **缺失**: 6/27 (22%)

---

## 缺失功能详情

### ❌ 项目 #7 — Tab 拖拽排序
**PRD 规格**:
- Team 详情页 §2.2：leader 固定首位，排序存 localStorage

**为什么缺失**:
- Playwright 没有内置 drag-drop API，需要 `dragTo()` 或 `mouse.move()` 模拟
- 团队决策暂未优先级排序

**建议修复**:
```typescript
// 示例（不含实现）
test('drag member tab to reorder', async ({ page }) => {
  const tab1 = page.locator('[data-testid="tab-X"]');
  const tab2 = page.locator('[data-testid="tab-Y"]');
  await tab1.dragTo(tab2); // 或使用 mouse.move() 模拟
  // 验证 localStorage 中的顺序已变更
});
```

---

### ❌ 项目 #11 — 消息发送失败的错误处理
**PRD 规格**:
- 消息发送 / 群聊 / 单聊失败的 error UI

**为什么缺失**:
- 需要模拟网络错误（Playwright 的 `route().abort()` 或 mock 后端）
- 当前测试只验证"成功路径"

**建议修复**:
```typescript
test('message send error shows toast', async ({ page }) => {
  await page.route('**/api/teams/*/messages', (route) => {
    route.abort('failed');
  });
  await chatInput.fill('Test');
  await chatInput.press('Enter');
  // 验证错误提示 UI（toast / modal）
});
```

---

### ❌ 项目 #20 — 单聊转 Team（Solo → Team）
**PRD 规格** (§13):
- Agent 在单聊中调用 `aion_create_team` 工具
- 前端自动跳转到 `/team/{id}`

**为什么缺失**:
- 需要 agent 在单聊对话中主动提议并调用 MCP 工具
- 这是"端到端 LLM 决策"流程，之前没有 agent 推理测试基础设施

**建议修复**:
```typescript
test('agent proposes team in solo chat and transitions', async ({ page }) => {
  // 导航到单聊
  await navigateTo(page, '#/conversation/<solo-id>');
  
  // 发送提示让 agent 认识到需要多 agent 协作
  await chatInput.fill('Complex task needing team...');
  await chatInput.press('Enter');
  
  // 等待 agent 调用 aion_create_team（MCP 工具确认）→ 自动转到 team 页
  await page.waitForURL(/\/team\//, { timeout: 120_000 });
  
  // 验证 URL 变更 + team 页已加载
  expect(page.url()).toMatch(/\/team\//);
});
```

---

### ❌ 项目 #27 — 网络断连恢复
**PRD 规格**:
- 网络断连后自动重连 / graceful degradation

**为什么缺失**:
- Electron main process 的网络恢复逻辑（`ipcBridge` 层）
- 需要 Playwright 模拟离线状态（`page.context().setOffline(true)`）

**建议修复**:
```typescript
test('team remains stable after network reconnect', async ({ page }) => {
  await page.context().setOffline(true);
  await page.waitForTimeout(2_000);
  
  // 触发消息（应该失败或排队）
  await chatInput.fill('Test');
  await chatInput.press('Enter');
  
  // 重新上线
  await page.context().setOffline(false);
  await page.waitForTimeout(2_000);
  
  // 验证消息最终成功或错误提示出现
});
```

---

### ⚠️ 项目 #4（部分缺失）— 创建时的验证
**PRD 规格**:
- 名称空 → 警告 + focus ✅
- Leader 未选 → 警告 ❌

**缺失部分**:
- 没有验证"不选 leader 的情况下创建按钮是否禁用"

**建议修复**:
```typescript
test('create button disabled when leader not selected', async ({ page }) => {
  const { modal, nameInput, createBtn } = await openCreateModal(page);
  
  // 填写名称但不选 leader
  await nameInput.fill('Test Team');
  
  // 创建按钮应该禁用
  await expect(createBtn).toBeDisabled();
  
  await closeModal(page);
});
```

---

## 测试文件总览

| 文件 | 用途 | 核心功能 |
|------|------|--------|
| **team-create.e2e.ts** | 创建流程多后端参数化 | 🔲 创建 modal、表单填充、导航 |
| **team-communication.e2e.ts** | 群聊 | 🔲 leader 收消息、AI 回复 |
| **team-member-ops.e2e.ts** | Agent 管理 | 🔲 重命名、删除、添加（IPC） |
| **team-rename-pin.e2e.ts** | Sidebar 管理 | 🔲 team 重命名、pin/unpin 排序 |
| **team-delete.e2e.ts** | Team 删除 | 🔲 右键菜单 → 确认 → 导航 |
| **team-tab-context.e2e.ts** | Tab 持久化 | 🔲 tab 切换 → 历史完整性 |
| **team-agent-lifecycle.e2e.ts** | agent 生命周期 | 🔲 添加 → 初始化 → 删除（leader 命令） |
| **team-view-modes.e2e.ts** | 视图切换 | 🔲 全屏、模型选择器 |
| **team-member-messaging.e2e.ts** | 单聊 | 🔲 member tab 消息 |
| **team-session-mode.e2e.ts** | 权限模式 | 🔲 模式选择器 → 持久化 |
| **team-whitelist.e2e.ts** | Agent 白名单 | 🔲 dropdown 只显示白名单 |
| **team-name-validation.e2e.ts** | 输入验证 | 🔲 空名称、长名称、空格 |
| **team-stale-url.e2e.ts** | 错误处理 | 🔲 已删 team URL → 无崩溃 |
| **team-member-init-failure.e2e.ts** | 初始化失败 | 🔲 failed badge + 移除按钮 |
| **team-workspace-migration.e2e.ts** | 工作空间迁移 | 🔲 迁移后 team 仍可用 + 所有 agent 同步 |
| **team-empty-state.e2e.ts** (spec) | Empty 状态 | 🔲 建议卡片、placeholder 文本 |
| **team-create-preset-leader.e2e.ts** (spec) | 预设 leader | 🔲 预设助手 → 创建 team |
| **team-describe-assistant.e2e.ts** (spec) | MCP TCP 桥接 | 🔲 team_describe_assistant + team_spawn_agent |

---

## 建议优先级

### 🔴 **P0（高优先级）** — 影响核心功能
1. **项目 #20**（单聊转 Team）— PRD 特色功能，当前无验证
2. **项目 #11**（发送失败处理）— 生产体验必需

### 🟡 **P1（中优先级）** — 增强覆盖率
3. **项目 #4**（leader 未选验证）— 修改 team-name-validation.e2e.ts
4. **项目 #27**（网络恢复）— Electron resilience 测试基础设施

### 🟢 **P2（低优先级）** — 完整性
5. **项目 #7**（拖拽排序）— 交互测试复杂度高

---

## 结论

- **现状**：74% 功能覆盖，主流程（创建、消息、管理、导航）已验证
- **缺口**：6 个场景，其中 2 个是关键功能（单聊转 team、错误处理）
- **下一步**：优先添加 #20 和 #11，再补 #27（网络恢复）

---

**报告生成**: 2026-04-28 | **审计员**: E2E Coverage Checker
