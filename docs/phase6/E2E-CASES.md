# Team E2E 测试用例（主流程）

**设计日期**: 2026-04-29  
**版本**: 1.0  
**设计原则**: 全部走真实 UI 操作，禁止 mock，禁止跳过正式流程直接调 API

---

## 核心约束

1. **禁止 mock invokeBridge**：不允许用 `invokeBridge` 直接调 API 代替用户操作（仅用于验证、清理、setup）
2. **禁止跳过前端**：所有操作必须模拟真实用户行为（点击、输入、等待）
3. **必须等真实推理**：发消息后必须等 agent 真正回复，不能 mock 响应
4. **依赖后端服务**：测试依赖 `aionui-backend` 运行
5. **超时设置合理**：agent 推理可能较长，建议 2-5 分钟

---

## Case 1: 创建 Team（全 UI 操作）

### 目的
验证从 Sider 创建按钮到 Team 页面导航的完整流程。

### 前置条件
- 应用已启动
- 至少有一个支持的 Leader agent 已安装（Claude / Gemini / Codex）
- Sider 中可见 "Teams" 区块

### 步骤

| # | 操作 | 期望结果 | 关键 Selector |
|---|-----|--------|-------------|
| 1 | 等待 Sider 中 "Teams" 文本出现 | 看到 Teams 区块 | `text=Teams` 或 `text=团队` |
| 2 | 点击 "+" 创建按钮 | TeamCreateModal 打开 | `[data-testid="team-create-btn"]` |
| 3 | 在 modal 名称输入框输入团队名 (e.g. "E2E Test Team 001") | 输入框显示输入值 | `.arco-modal textarea:first` 或 `.arco-modal input:first` |
| 4 | 点击 Leader 下拉框 | 下拉选项展开 (portaled to body) | `[data-testid="team-create-leader-select"]` |
| 5 | 从选项列表选择 Claude / Gemini | 选项被选中，Create 按钮变可用 | `[data-testid^="team-create-agent-option-"]` |
| 6 | （可选）选择 Workspace | Workspace 路径显示（或保留空） | WorkspaceFolderSelect 内 |
| 7 | 点击 "Create" 按钮 | 页面导航到 `/team/{id}` | `.arco-modal .arco-btn-primary` |
| 8 | 等待 Team 页面加载完成 | URL 变为 `#/team/{teamId}` | `page.waitForURL(/\/team\//)`  |
| 9 | 验证 Sider 显示新创建的 team 名称 | Team 名称出现在 Sider | `text=E2E Test Team 001` |
| 10 | 验证 Tab 栏显示 Leader agent | 第一个 tab 显示 Leader 的名称 + 冠图标 | `[data-testid="team-tab-bar"]` 内 |

### 断言

```typescript
// 页面成功导航
await expect(page).toHaveURL(/\/team\//);

// Modal 已关闭
await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });

// Team 名称在 Sider 可见
await expect(page.locator('text=E2E Test Team 001').first()).toBeVisible();

// Tab 栏显示 Leader
const tabBar = page.locator('[data-testid="team-tab-bar"]');
await expect(tabBar).toBeVisible();
```

### 超时设置
- 整体: **30 秒**（UI 操作较快）
- 导航: **15 秒**（创建 API 调用 + 路由跳转）
- Sider 更新: **10 秒**（SWR 重新获取团队列表）

### 涉及的后端功能
- ✅ `POST /api/teams` 创建团队
- ✅ `POST /api/teams/{id}/session` 初始化 session（自动在页面加载时触发）

### 关键 DOM 结构
```
Sider
  ├─ TeamSiderSection
  │   ├─ Plus icon [data-testid="team-create-btn"]
  │   └─ Team list items
  │
TeamCreateModal (.arco-modal)
  ├─ Team name input
  ├─ Leader select [data-testid="team-create-leader-select"]
  │   └─ Options [data-testid="team-create-agent-option-{key}"] (portaled)
  ├─ Workspace select (WorkspaceFolderSelect)
  └─ Cancel / Create buttons (.arco-btn-text / .arco-btn-primary)
```

---

## Case 2: 向 Leader 发消息并等待推理回复

### 目的
验证消息发送到正确的 conversation，leader agent 状态从 idle → active，最后回复消息出现。

### 前置条件
- 已执行 Case 1，Team 已创建且正常显示
- Leader agent 已激活（可接收消息）
- WebSocket 连接已建立（用于接收实时状态更新和消息）

### 步骤

| # | 操作 | 期望结果 | 关键 Selector / 事件 |
|---|-----|--------|------------------|
| 1 | 确保在 Leader tab 已激活 | Leader tab 显示高亮（蓝色） | active tab 具有 `border-t-2 border-t-primary-6` |
| 2 | 找到聊天输入框 | TextArea 获得 focus | `textarea[placeholder*="Send message"]` 或 `textarea[placeholder*="发送消息"]` |
| 3 | 在输入框输入测试消息 (e.g. "Hello team, please help me...") | 输入框显示消息内容 | textarea 内容 |
| 4 | 按 Enter 或点击发送按钮 | 消息立刻出现在聊天区（用户消息，右对齐） | 执行 `textarea.press('Enter')` 或点击发送按钮 |
| 5 | 观察 Leader agent 状态 badge | Badge 从灰色变为绿色（脉冲动画） | AgentStatusBadge 应用 `animate-pulse` 和 `bg-green-500` |
| 6 | 等待 Network 请求 | 检查 `/api/conversations/{conversation_id}/messages` POST 请求 | DevTools Network tab 或 `page.waitForResponse()` |
| 7 | 等待 WebSocket 消息 | 接收 `team.agent.status` 事件，status = "active" | WS 监听（或观察 UI 状态变化）|
| 8 | 等待 AI 回复消息 | 新消息出现在聊天区（左对齐，来自 AI） | 轮询 `.message-item.text.justify-start` 最后一个元素的文本内容 |
| 9 | 观察回复内容非空 | AI 回复包含有意义的文本 | 不是空字符串或加载占位符 |
| 10 | 观察 Leader 状态恢复 idle | Badge 变回灰色，脉冲停止 | AgentStatusBadge 无 `animate-pulse`，回到静态灰色 |

### 断言

```typescript
// 消息立刻出现（用户消息，右对齐）
const userMessages = page.locator('.message-item.text.justify-end');
await expect(userMessages.last()).toContainText('Hello team');

// Leader 状态变为 active
const leaderBadge = page.locator('[data-testid="team-tab-bar"] .agent-status-badge').first();
await expect(leaderBadge).toHaveClass(/animate-pulse/);  // 绿色脉冲

// AI 回复出现
const aiMessages = page.locator('.message-item.text.justify-start');
const lastAiMsg = aiMessages.last();
await expect(lastAiMsg).toBeVisible({ timeout: 300000 });  // 等到 5 分钟

// 回复包含非空文本
const replyText = await lastAiMsg.evaluate(el => {
  const shadow = el.querySelector('.markdown-shadow');
  if (shadow?.shadowRoot) {
    return shadow.shadowRoot.textContent?.trim() ?? '';
  }
  return el.textContent?.trim() ?? '';
});
expect(replyText.length).toBeGreaterThan(0);

// Leader 状态恢复 idle
await expect(leaderBadge).not.toHaveClass(/animate-pulse/, { timeout: 30000 });
```

### 超时设置
- 消息发送确认: **5 秒**
- 状态变为 active: **10 秒**（WS 延迟 + UI 更新）
- AI 回复到达: **5 分钟 (300 秒)**（Claude 推理可能耗时）
- 状态恢复 idle: **30 秒**（推理完成 + 状态更新）

### 涉及的后端功能
- ✅ `POST /api/conversations/{conversation_id}/messages` 发送消息
- ✅ `GET /api/conversations/{conversation_id}` 轮询消息历史（或 WebSocket streaming）
- ✅ `WebSocket: team.agent.status` 实时状态推送

### 关键 DOM 结构
```
TeamPage
  ├─ TeamTabs (Agent tab 栏)
  │   ├─ Leader Tab (active)
  │   │   ├─ AgentIdentity (名称 + 冠)
  │   │   ├─ AgentStatusBadge (灰/绿)
  │   └─ Teammate Tab
  │
  └─ ChatArea (聊天区域)
      ├─ User Message (right-aligned) - 立刻出现
      ├─ Status Badge transition (灰 → 绿 脉冲)
      └─ AI Message (left-aligned) - 流式到达后完整渲染
```

### 注意事项
- **流式消息**：Prompt Thinking 等特殊块可能先到达，不计为"回复"
- **Shadow DOM**：AI 文本通过 Shadow DOM 渲染，需要 `pierce()` 或 `evaluate()` 访问
- **并发 agents**：如果同时有多个 agent，需要确认观察的是 Leader tab 的消息

---

## Case 3: 通过推理 Spawn 新 Teammate

### 目的
验证 Leader agent 通过 MCP `team_spawn_agent` 工具创建 teammate，前端 UI 实时更新 tab。

### 前置条件
- 已执行 Case 2，Leader 能正常接收并回复消息
- 后端支持 `team_spawn_agent` MCP 工具（需要在 MCP stubs 中暴露）
- 至少有一个可用的 preset 或可选的 agent

### 核心原则
Team 的主要流程全是**推理+对话**完成的。创建成员不是前端直接调 API，而是：
1. 用户提需求 → 2. Leader 返回阵容推荐 → 3. 用户确认 → 4. Leader 才 spawn

### 步骤

| # | 操作 | 期望结果 | 关键 Selector / 事件 |
|---|-----|--------|------------------|
| 1 | 向 Leader 发消息，描述任务需求 (e.g. "帮我做一个前端项目，需要一个代码审查员和一个测试员") | 消息出现在聊天区 | 同 Case 2 步骤 3-4 |
| 2 | 等待 Leader 推理 | Leader badge 从 idle → active（绿脉冲） | AgentStatusBadge active state |
| 3 | **等待 Leader 返回阵容推荐** | 回复中包含成员配置信息（agent 类型、模型、角色） | 验证回复文本包含 agent 类型关键词 |
| 4 | **验证阵容推荐内容** | 推荐中包含：agent 类型（如 claude/codex）+ 模型信息 + 角色分配 | 文本断言 |
| 5 | **用户回复确认**（输入"同意"或"可以"） | 确认消息出现在聊天区 | 同 Case 2 发送步骤 |
| 6 | 等待 Leader 再次推理 | Leader badge 从 idle → active | AgentStatusBadge active state |
| 7 | Leader 调用 `team_spawn_agent` MCP 工具 | 后端日志可见工具调用 | Backend logs 或 MCP trace |
| 8 | 等待 WebSocket 事件 `team.agent.spawned` | 前端收到新 agent 信息（slot_id, name, status） | WS 事件监听或 UI 更新 |
| 9 | 观察新 Agent Tab 出现 | Tab 栏中出现新的 tab 项（位置在 Leader 后） | `[data-testid="team-tab-bar"]` 子元素数量 +1 |
| 10 | 验证新 Tab 的名称和状态 badge | Tab 显示 agent 名称 + idle badge | 新 tab 内的 TeamAgentIdentity 文本 + badge |
| 11 | 点击新 Tab 切换到 teammate | 聊天区显示该 agent 的空对话或前置消息 | 新 tab active，聊天区更新 |
| 12 | 验证新 agent 的 conversation 已创建 | Network tab 显示 conversation 已初始化 | Backend 数据库或 API 验证 |

### 断言

```typescript
const tabsBefore = await page.locator('[data-testid="team-tab-bar"] > div').count();
const input = page.locator('textarea[placeholder*="发送消息"]').first();

// Step 1: 发送任务需求
await input.fill('帮我做一个前端项目，需要一个代码审查员和一个测试员');
await input.press('Enter');

// Step 3: 等待 Leader 返回阵容推荐
const recommendationMsg = page.locator('.message-item.text.justify-start').last();
await expect(recommendationMsg).toBeVisible({ timeout: 300_000 });

// Step 4: 验证阵容推荐包含 agent 类型和模型信息
const replyText = await recommendationMsg.textContent();
expect(replyText).toMatch(/claude|codex|gemini/i); // 包含 agent 类型
expect(replyText).toMatch(/model|模型|sonnet|opus|haiku/i); // 包含模型信息

// Step 5: 用户确认
await input.fill('同意，开始创建');
await input.press('Enter');

// Step 8-9: 等待新 tab 出现（Leader spawn 后 WS 推送）
await expect(async () => {
  const tabsNow = await page.locator('[data-testid="team-tab-bar"] > div').count();
  expect(tabsNow).toBeGreaterThan(tabsBefore);
}).toPass({ timeout: 300_000 });

// Step 10: 验证新 tab 名称
const allTabs = page.locator('[data-testid="team-tab-bar"] > div');
const newTab = allTabs.nth(await allTabs.count() - 1);
const tabName = await newTab.textContent();
expect(tabName).not.toMatch(/Leader/i);
expect(tabName?.length).toBeGreaterThan(0);
```

### 超时设置
- Leader 推理: **5 分钟 (300 秒)**
- WebSocket 事件接收: **10 秒**
- 新 Tab 渲染: **5 秒**

### 涉及的后端功能
- ✅ `team_spawn_agent` MCP 工具（由 Leader 通过推理调用）
- ✅ `WebSocket: team.agent.spawned` 事件推送
- ✅ `POST /api/conversations` 为新 agent 创建 conversation
- ✅ `POST /api/teams/{id}/agents` 添加新 agent 到 team

### 关键 MCP 工具签名（参考）
```typescript
// 预期的 MCP 工具调用（由 Leader 自主决定调用）
team_spawn_agent({
  team_id: string;
  name: string;  // e.g. "Code Reviewer"
  preset_id?: string;  // e.g. "builtin-code-reviewer"
  role?: 'teammate';
})
→ { slot_id: string; conversation_id: string }
```

### 注意事项
- **非确定性**：Leader 是否真的会调用 MCP 工具取决于推理，可能需要多次尝试或更精确的 prompt
- **MCP 权限**：后端必须在 team MCP server 中暴露该工具，否则 Leader 无法调用
- **失败处理**：如果 spawn 失败，Leader 会返回错误信息，前端不会添加新 tab

---

## Case 4: 成员间通信（向 Teammate 发消息）

### 目的
验证向 teammate 发消息，teammate 接收并回复的完整链路。

### 前置条件
- 已执行 Case 3，Team 中至少有 Leader + 1 个 Teammate
- Teammate tab 已可见

### 步骤

| # | 操作 | 期望结果 | 关键 Selector |
|---|-----|--------|-------------|
| 1 | 点击 Teammate tab | Teammate tab 变为 active（蓝色高亮） | 第二个或后续的 tab |
| 2 | 观察聊天区切换 | 聊天区显示该 teammate 的对话（可能为空或包含历史消息） | ChatArea 内容变化 |
| 3 | 在输入框输入消息 (e.g. "Review this code for me") | 输入框显示消息 | `textarea[placeholder*="发送消息"]` |
| 4 | 按 Enter 发送 | 消息立刻出现在聊天区（用户消息，右对齐） | `.message-item.text.justify-end` |
| 5 | 观察 Teammate 状态 badge | Badge 从灰色变为绿色（脉冲） | 该 tab 内的 AgentStatusBadge |
| 6 | 等待 Network 请求 | `POST /api/conversations/{teammate_conv_id}/messages` 被调用 | Network tab 或 page.waitForResponse() |
| 7 | 等待 Teammate 回复 | 新 AI 消息出现在聊天区（左对齐） | `.message-item.text.justify-start` 的最后元素 |
| 8 | 观察 Teammate 状态恢复 idle | Badge 变回灰色 | AgentStatusBadge 无 animate-pulse |

### 断言

```typescript
// 切换到 teammate tab
const allTabs = page.locator('[data-testid="team-tab-bar"] > div');
const secondTab = allTabs.nth(1);
await secondTab.click();

// Teammate tab 是 active
await expect(secondTab).toHaveClass(/border-t-primary-6/);

// 发送消息
const input = page.locator('textarea[placeholder*="发送消息"]').first();
await input.fill('Review this code for me');
await input.press('Enter');

// 消息出现
const userMsg = page.locator('.message-item.text.justify-end').last();
await expect(userMsg).toContainText('Review this code');

// Teammate 状态变 active
const teammateBadge = secondTab.locator('.agent-status-badge');
await expect(teammateBadge).toHaveClass(/animate-pulse/);

// AI 回复出现
const aiMsg = page.locator('.message-item.text.justify-start').last();
await expect(aiMsg).toBeVisible({ timeout: 300000 });

// 状态恢复 idle
await expect(teammateBadge).not.toHaveClass(/animate-pulse/, { timeout: 30000 });
```

### 超时设置
- 消息发送: **5 秒**
- 状态变 active: **10 秒**
- AI 回复: **5 分钟 (300 秒)**
- 状态恢复 idle: **30 秒**

### 涉及的后端功能
- ✅ `POST /api/conversations/{conversation_id}/messages` 发送消息
- ✅ `WebSocket: team.agent.status` 状态推送
- ✅ 消息流式返回（同 Case 2）

---

## Case 5: 删除 Team

### 目的
验证通过 Sider 右键菜单删除 Team 的完整流程。

### 前置条件
- 已执行 Case 1 或之前的 case，Team 在 Sider 中可见

### 步骤

| # | 操作 | 期望结果 | 关键 Selector |
|---|-----|--------|-------------|
| 1 | 在 Sider 中找到要删除的 Team 项 | Team 名称显示在 Sider | Sider 中的 team list |
| 2 | 右键点击 Team 项 | 上下文菜单出现，包含 Delete 选项 | `.arco-dropdown-menu` 或自定义菜单 |
| 3 | 点击 Delete | 确认对话框弹出 | `.arco-modal` 包含确认文本 |
| 4 | 点击确认删除按钮 | Modal 关闭，发送 `DELETE /api/teams/{id}` 请求 | `.arco-btn-status-danger` 或确认按钮 |
| 5 | 等待 API 响应 | 请求成功（响应 204 或 200） | Network tab 确认 |
| 6 | 观察导航 | 如果当前在 Team 页面，自动导航离开（回到 guid 或其他页面） | URL 变化 `#/guid` 或其他 |
| 7 | 观察 Sider 更新 | Sider 中 Team 项消失 | Team 名称在 Sider 不可见 |
| 8 | 验证 Team 数据删除 | Backend 数据库中 Team 不存在 | 可选：调用 `GET /api/teams` 验证 |

### 断言

```typescript
// 右键点击 team
const teamItem = page.locator('text=E2E Test Team 001').first();
await teamItem.click({ button: 'right' });

// 菜单出现
const deleteOption = page.locator('.arco-dropdown-menu-item').filter({ hasText: /Delete|删除/ });
await expect(deleteOption).toBeVisible();

// 点击 Delete
await deleteOption.click();

// 确认对话框出现
const modal = page.locator('.arco-modal');
await expect(modal).toBeVisible();

// 点击确认按钮
const confirmBtn = modal.locator('.arco-btn-status-danger');
await confirmBtn.click();

// Modal 关闭
await expect(modal).toBeHidden({ timeout: 5000 });

// Team 从 Sider 消失
await expect(page.locator('text=E2E Test Team 001')).toBeHidden({ timeout: 10000 });

// 可选：验证导航（如果在 team 页面）
// await expect(page).toHaveURL(/#\/guid/);
```

### 超时设置
- API 删除: **10 秒**
- Sider 更新: **10 秒**（SWR 重新获取）

### 涉及的后端功能
- ✅ `DELETE /api/teams/{id}` 删除 Team
- ✅ 清理相关的 conversations 和 agents

---

## 综合场景：完整的 Team 生命周期

**建议将以上 5 个 case 组合成一个综合 E2E 测试脚本 `team-main-flow.e2e.ts`，顺序执行**：

```typescript
test.describe('Team Main Flow - Complete Lifecycle', () => {
  let teamId: string;

  test('Case 1: Create team', async ({ page }) => {
    // ... Case 1 steps
    teamId = extractTeamIdFromUrl(page.url());
  });

  test('Case 2: Send message to leader and wait for reply', async ({ page }) => {
    // ... Case 2 steps
  });

  test('Case 3: Spawn teammate via MCP', async ({ page }) => {
    // ... Case 3 steps
  });

  test('Case 4: Send message to teammate', async ({ page }) => {
    // ... Case 4 steps
  });

  test('Case 5: Delete team', async ({ page }) => {
    // ... Case 5 steps
  });
});
```

---

## 环境依赖清单

| 依赖 | 版本/状态 | 必须 | 备注 |
|------|---------|------|------|
| `aionui-backend` | latest | ✅ 是 | 需要运行在 `http://127.0.0.1:5000` 或配置的端口 |
| Claude agent | installed | ✅ 是 | 作为 Leader 或 Teammate |
| Gemini agent | installed | ❌ 可选 | 可用于多后端测试 |
| WebSocket | enabled | ✅ 是 | 用于实时状态推送 |
| 网络连接 | stable | ✅ 是 | 测试依赖稳定的网络 |

---

## 关键 Selector 和 Helper

### 基础 Selector

```typescript
// Team 创建按钮
const TEAM_CREATE_BTN = '[data-testid="team-create-btn"]';

// Team 创建 Modal
const TEAM_CREATE_MODAL = '.arco-modal';
const TEAM_CREATE_LEADER_SELECT = '[data-testid="team-create-leader-select"]';
const TEAM_CREATE_AGENT_OPTION = '[data-testid^="team-create-agent-option-"]';

// Team Tab 栏
const TEAM_TAB_BAR = '[data-testid="team-tab-bar"]';
const TEAM_TAB_ITEM = `${TEAM_TAB_BAR} > div`;  // 每个 agent tab

// 聊天相关
const CHAT_INPUT = 'textarea[placeholder*="发送消息"], textarea[placeholder*="Send message"]';
const USER_MESSAGE = '.message-item.text.justify-end';
const AI_MESSAGE = '.message-item.text.justify-start';
const AGENT_STATUS_BADGE = '.agent-status-badge';

// 聊天空状态
const TEAM_CHAT_EMPTY_STATE = '[data-testid="team-chat-empty-state"]';
```

### 推荐的 Helper 函数

```typescript
// 创建 Team（UI 操作）
export async function createTeamViaUI(
  page: Page,
  teamName: string,
  leaderType: 'claude' | 'gemini' | 'codex'
): Promise<string> {
  const createBtn = page.locator(TEAM_CREATE_BTN).first();
  await createBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await createBtn.click();
  
  // ... fill form, submit, extract teamId
  return teamId;
}

// 等待 AI 回复
export async function waitForAiReply(
  page: Page,
  timeoutMs: number = 300_000
): Promise<string> {
  const msg = page.locator(AI_MESSAGE).last();
  await msg.waitFor({ state: 'visible', timeout: timeoutMs });
  
  return await msg.evaluate(el => {
    const shadow = el.querySelector('.markdown-shadow');
    if (shadow?.shadowRoot) {
      return shadow.shadowRoot.textContent?.trim() ?? '';
    }
    return el.textContent?.trim() ?? '';
  });
}

// 发送消息
export async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.locator(CHAT_INPUT).first();
  await input.fill(text);
  await input.press('Enter');
}

// 等待 Agent 状态变为 active
export async function waitForAgentActive(
  page: Page,
  agentIndex: number = 0,
  timeoutMs: number = 15_000
): Promise<void> {
  const badge = page.locator(AGENT_STATUS_BADGE).nth(agentIndex);
  await expect(badge).toHaveClass(/animate-pulse/, { timeout: timeoutMs });
}

// 等待 Agent 状态恢复 idle
export async function waitForAgentIdle(
  page: Page,
  agentIndex: number = 0,
  timeoutMs: number = 30_000
): Promise<void> {
  const badge = page.locator(AGENT_STATUS_BADGE).nth(agentIndex);
  await expect(badge).not.toHaveClass(/animate-pulse/, { timeout: timeoutMs });
}
```

---

## Case 12: 成员 Shutdown（通过推理下线 Teammate）

### 目的
验证 Leader 通过推理调用 `team_shutdown_agent` MCP 工具下线成员，前端 Tab 实时消失。

### 前置条件
- 已执行 Case 3，Team 中至少有 Leader + 1 个 Teammate
- `team_shutdown_agent` MCP 工具后端已实现
- Teammate 能响应 shutdown_request（回复 `shutdown_approved`）

### 核心原则
同 Case 3：全程推理+对话完成，不直接调 removeAgent API。

### 步骤

| # | 操作 | 期望结果 | 关键 Selector / 事件 |
|---|-----|--------|------------------|
| 1 | 记录当前 Tab 数量 | 已知 Tab 数（如 Leader + 1 Teammate = 2） | `[data-testid="team-tab-bar"]` 子元素 count |
| 2 | 向 Leader 发消息要求下线成员 (e.g. "把测试员下线，任务已完成") | 消息出现在聊天区 | 同 Case 2 发送步骤 |
| 3 | 等待 Leader 推理 | Leader badge idle → active | AgentStatusBadge active state |
| 4 | Leader 调用 `team_shutdown_agent` MCP 工具 | 后端发送 shutdown_request 到 Teammate mailbox | Backend logs |
| 5 | Teammate 收到 shutdown_request 并回复 `shutdown_approved` | Teammate 自动响应（无需用户干预） | Backend logs |
| 6 | 等待 WebSocket 事件 `team.agent.removed` | 前端收到 slot_id | WS 事件 |
| 7 | 验证 Teammate Tab 消失 | Tab 栏数量 -1 | `[data-testid="team-tab-bar"]` 子元素 count 减少 |
| 8 | 验证 Leader 回复确认 | Leader 回复中包含"已下线"或类似确认 | 消息文本断言 |

### 断言

```typescript
const tabsBefore = await page.locator('[data-testid="team-tab-bar"] > div').count();
const input = page.locator('textarea[placeholder*="发送消息"]').first();

// Step 2: 要求 Leader 下线成员
await input.fill('把测试员下线，任务已经完成了');
await input.press('Enter');

// Step 6-7: 等待 Tab 消失
await expect(async () => {
  const tabsNow = await page.locator('[data-testid="team-tab-bar"] > div').count();
  expect(tabsNow).toBeLessThan(tabsBefore);
}).toPass({ timeout: 300_000 });

// Step 8: Leader 确认下线
const lastReply = page.locator('.message-item.text.justify-start').last();
const replyText = await lastReply.textContent();
expect(replyText).toMatch(/下线|shutdown|removed|已移除/i);
```

### 超时设置
- Leader 推理: **5 分钟 (300 秒)**
- Teammate 响应 shutdown: **30 秒**（自动响应，不需要用户操作）
- Tab 消失: **10 秒**

### 状态
⚠️ **依赖 `team_shutdown_agent` MCP 工具后端实现**（Wave 5 中 `team_spawn_agent` 落地后同步可用）

### 注意事项
- Teammate 可能拒绝 shutdown（回复 `shutdown_rejected: reason`），此时 Tab 不应消失
- 如果 Teammate 正在 working 状态，shutdown 可能被延迟到回合结束
- 这是完整的推理链路：Leader 判断 → MCP 调用 → Teammate 响应 → 前端 UI 更新

---

## 已知限制和未来改进

1. **通过推理 Spawn Agent 的不确定性**：
   - Leader 是否真的调用 `team_spawn_agent` 取决于其推理决策
   - 建议在 Case 3 中对 prompt 进行精确工程设计，或在后端提供测试工具钩子
   
2. **流式消息处理**：
   - Thinking blocks 和其他特殊块的到达顺序可能影响测试断言
   - 建议在 Case 2/4 中对消息类型进行防守式检查

3. **性能和超时**：
   - 5 分钟的 AI 推理超时可能过长，建议根据实际环境调整
   - 可考虑在开发环境使用更快的模型（e.g. Haiku）加快测试

4. **并发性**：
   - 当前 case 按顺序执行，未验证并发发消息的场景
   - 可在未来增加并发测试 case

---

## 参考文档

- [Team MCP UI 交互流程研究](./team_mcp_ui_research.md) — 详细的 UI 流程和 selector 映射
- [Team MCP 通信协议研究](./team_mcp_protocol_research.md) — 后端 API 和 WebSocket 格式
- [Phase 1 回归报告](../phase1/REGRESSION.md) — 早期手动验证清单
- [现有 E2E 测试](../../tests/e2e/specs/) — team-create.e2e.ts, team-empty-state.e2e.ts 等
- [E2E Helper 库](../../tests/e2e/helpers/) — teamHelpers.ts, conversation.ts, selectors.ts

---

## 修订历史

| 版本 | 日期 | 作者 | 变更 |
|------|------|------|------|
| 1.0 | 2026-04-29 | E2E Tester A | 初始设计，5 个核心 case + 综合场景 |
| 1.1 | 2026-04-29 | E2E Tester B | 补充 Case 6-11（单聊转群聊 + 边界场景） |
| 1.2 | 2026-04-29 | Leader | Case 3 补充阵容推荐→用户确认流程；新增 Case 12 成员 Shutdown |

