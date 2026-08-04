# E2E 测试指南

## 快速开始

### 1. 构建应用

E2E 测试会直接启动 Electron（`electron .`），并加载 `out/` 中预先构建的文件。**修改源代码后必须重新构建，测试才能使用这些变更。**

```bash
# 完整构建（main + preload + renderer）
bunx electron-vite build
```

> `bun run start`（`electron-vite dev`）使用 Vite 的 HMR，并会自动热重载。
> E2E 测试不使用 Vite 开发服务器，而是加载 `out/` 中的静态文件。

### 2. 确保 `aioncore` 位于 PATH 中

Electron 主进程会在启动时生成 `aioncore` 二进制进程，
并通过 `window.__backendPort` 将其端口暴露给渲染进程。系统通过
`which aioncore` 定位该二进制文件，因此 Playwright 运行器继承的
`PATH` 必须能够访问它。否则，`__backendPort` 将为 `0`，
渲染进程发起的每个 HTTP 调用（或使用
`tests/e2e/helpers/httpBridge.ts` 的 E2E 辅助函数发起的调用）都会失败，并显示 `Failed to fetch`。

```bash
# 安装后端二进制文件（构建到 ~/.cargo/bin/aioncore）
cd ../AionCore && cargo install --path crates/aionui-app

# 确保运行测试时它位于 PATH 中
export PATH="$HOME/.cargo/bin:$PATH"
```

### 3. 运行测试

```bash
# 所有 E2E 测试
bun run test:e2e

# 指定测试文件
npx playwright test --config playwright.config.ts tests/e2e/specs/team-workspace-migration.e2e.ts --reporter=list
```

### 3. 查看结果

```bash
# 打开 HTML 报告
npx playwright show-report tests/e2e/report
```

截图、跟踪记录和视频保存在 `tests/e2e/results/` 中。

---

## 架构

### 应用生命周期

```
Playwright 启动 Electron 应用（每个 worker 一个单例）
    → 应用加载 out/main/index.js
    → 主进程创建 BrowserWindow
    → 渲染进程加载 out/renderer/index.html（HashRouter）
    → 测试与渲染进程页面交互
    → 应用会跨所有测试文件持续运行（describe 之间不会重启）
    → worker 退出时关闭应用
```

**关键设计决策：** 所有测试共享一个 Electron 实例。重启需要约 25～30 秒，因此测试会复用同一个应用进程。

### 两种启动模式

| 模式                 | 触发方式                 | 运行内容                      | 使用场景  |
| -------------------- | ------------------------ | ----------------------------- | --------- |
| **开发**（本地默认） | `E2E_DEV=1` 或未设置变量 | 从项目根目录执行 `electron .` | 本地开发  |
| **打包**             | `E2E_PACKAGED=1` 或 CI   | 运行 `out/` 中构建好的应用    | CI 流水线 |

两种模式都会加载 `out/` 中预先构建的文件。区别在于，打包模式使用 `NODE_ENV=production` 和特定平台的可执行文件。

### 目录结构

```
tests/e2e/
├── fixtures.ts         # Electron 应用启动、页面 fixture、单例管理
├── helpers/
│   ├── index.ts        # 重新导出所有辅助函数
│   ├── bridge.ts       # invokeBridge()——与主进程进行 IPC 通信
│   ├── navigation.ts   # 路由辅助函数（navigateTo、goToGuid、goToSettings）
│   ├── conversation.ts # 聊天辅助函数（sendMessage、waitForAiReply、selectAgent）
│   ├── selectors.ts    # UI 元素的 CSS 选择器
│   ├── assertions.ts   # 自定义断言（expectBodyContainsAny、错误收集器）
│   ├── extensions.ts   # 扩展快照辅助函数
│   ├── assistantSettings.ts # Assistant CRUD 辅助函数
│   ├── teamConfig.ts   # TEAM_SUPPORTED_BACKENDS 白名单
│   └── screenshots.ts  # 手动截图辅助函数
├── specs/
│   ├── README.md       # Team E2E 规范（Team 测试规则）
│   ├── app-launch.e2e.ts
│   ├── team-create.e2e.ts
│   ├── team-workspace-migration.e2e.ts
│   └── ...             # 约 30 多个测试文件
├── results/            # 测试产物（gitignored）
├── report/             # HTML 报告（gitignored）
└── screenshots/        # 手动截图（gitignored）
```

---

## 编写测试

### 基本模式

```ts
import { test, expect } from '../fixtures';
import { invokeBridge, navigateTo } from '../helpers';

test.describe('Feature Name', () => {
  test('what it should do', async ({ page, electronApp }) => {
    // 1. Navigate
    await navigateTo(page, '#/some-route');

    // 2. Interact
    const input = page.locator('textarea').first();
    await input.fill('Hello');
    await input.press('Enter');

    // 3. Assert UI
    await expect(page.locator('text=Hello')).toBeVisible({ timeout: 10_000 });

    // 4. Assert backend (optional)
    const data = await invokeBridge(page, 'some.bridge-key', { param: 'value' });
    expect(data.field).toBe('expected');
  });
});
```

### 关键辅助函数

| 辅助函数                         | 用途                                           | 导入位置     |
| -------------------------------- | ---------------------------------------------- | ------------ |
| `invokeBridge(page, key, data)`  | 调用主进程 IPC                                 | `../helpers` |
| `navigateTo(page, hash)`         | 通过侧边栏 UI 导航                             | `../helpers` |
| `waitForAiReply(page)`           | 等待 AI 响应（处理 Shadow DOM）                | `../helpers` |
| `selectAgent(page, backend)`     | 为后端选择可用的 Assistant                     | `../helpers` |
| `sendMessageFromGuid(page, msg)` | 发送消息并获取会话 ID                          | `../helpers` |
| `deleteConversation(page, id)`   | 按 ID 删除会话（清理）                         | `../helpers` |
| `MODE_SELECTOR`                  | 模式选择器胶囊 `[data-testid="mode-selector"]` | `../helpers` |
| `modeMenuItemByValue(value)`     | 模式下拉项 `[data-mode-value="..."]`           | `../helpers` |

### invokeBridge 规则

| 允许                                               | 禁止                               |
| -------------------------------------------------- | ---------------------------------- |
| **准备：** 读取初始状态（`team.list`、`team.get`） | **触发操作**（添加成员、发送消息） |
| **断言：** 验证后端与 UI 一致                      | 操作必须通过 UI 交互完成           |
| **清理：** 删除测试数据（`team.remove`）           |                                    |

### 超时指南

| 操作                           | 超时时间           |
| ------------------------------ | ------------------ |
| UI 元素可见                    | 5,000 - 15,000ms   |
| 导航并等待稳定                 | 10,000ms           |
| AI 响应（单模型）              | 120,000ms          |
| Team 操作（Leader 推理 + MCP） | 60,000 - 120,000ms |
| 成员初始化                     | 60,000ms           |

### 模拟原生对话框（Electron）

```ts
// Mock file open dialog
await electronApp.evaluate(async ({ dialog }, targetPath) => {
  dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [targetPath] });
}, '/path/to/target');
```

### Shadow DOM

AI 消息文本渲染在 Shadow DOM（`.markdown-shadow`）中。请使用会自动处理此情况的 `waitForAiReply()` 辅助函数。如果需要直接访问：

```ts
const text = await page.evaluate(() => {
  const el = document.querySelector('.message-item.text.justify-start:last-child');
  const shadow = el?.querySelector('.markdown-shadow');
  return shadow?.shadowRoot?.textContent?.trim() ?? '';
});
```

### 截图

```ts
// Manual screenshot (saved to tests/e2e/results/)
await page.screenshot({ path: 'tests/e2e/results/my-step.png' });
```

失败的测试会自动把截图附加到 HTML 报告中。

---

## 环境变量

| 变量             | 默认值                        | 用途                     |
| ---------------- | ----------------------------- | ------------------------ |
| `E2E_PACKAGED=1` | 未设置（开发模式）            | 使用 `out/` 中的打包应用 |
| `E2E_DEV=1`      | 未设置                        | 强制使用开发模式         |
| `TEAM_AGENT`     | 全部（`claude,codex,gemini`） | 筛选 Team Leader 类型    |
| `CI`             | 未设置                        | 自动选择打包模式         |

测试启动时会自动设置以下变量：

| 变量                         | 值  | 用途                 |
| ---------------------------- | --- | -------------------- |
| `AIONUI_E2E_TEST`            | `1` | 应用识别测试模式     |
| `AIONUI_DISABLE_AUTO_UPDATE` | `1` | 不检查更新           |
| `AIONUI_DISABLE_DEVTOOLS`    | `1` | 不打开 DevTools 窗口 |
| `AIONUI_CDP_PORT`            | `0` | 禁用 CDP             |

---

## NPM 脚本

| 命令                              | 范围                 |
| --------------------------------- | -------------------- |
| `bun run test:e2e`                | 所有 E2E 测试        |
| `bun run test:e2e:team`           | 所有 `team-*.e2e.ts` |
| `bun run test:e2e:team:create`    | 仅创建 Team          |
| `bun run test:e2e:team:lifecycle` | 添加 + 解雇成员      |
| `bun run test:e2e:team:whitelist` | Agent 白名单下拉列表 |
| `bun run test:e2e:team:comm`      | 发送消息             |

### 示例

```bash
# 在本地运行所有 E2E（开发模式，需要先构建）
bunx electron-vite build && bun run test:e2e

# 使用 list reporter 仅运行 Team 测试
bun run test:e2e:team

# 运行指定测试文件
npx playwright test --config playwright.config.ts tests/e2e/specs/app-launch.e2e.ts

# 仅测试 gemini Leader 类型
TEAM_AGENT=gemini bun run test:e2e:team

# 使用打包模式运行（类似 CI）
E2E_PACKAGED=1 bun run test:e2e
```

---

## 故障排除

### 测试因界面过期或行为旧而失败

**原因：** 源代码变更后没有重新构建。

```bash
bunx electron-vite build
```

### `Bridge invoke timeout: xxx`

**原因：** `xxx` 的 IPC Provider 不存在或尚未注册。

- 检查 `src/common/adapter/ipcBridge.ts` 中的端点定义
- 检查对应的 Bridge 文件（例如 `src/process/bridge/teamBridge.ts`）中是否调用了 `.provider()` 进行注册
- 重新构建：`bunx electron-vite build`

### 应用可以启动，但页面为空白

**原因：** Renderer 构建缺失或已损坏。

```bash
bunx electron-vite build
```

### 涉及 AI 响应的测试不稳定

- 增加超时时间（AI 推理时长会随负载变化）
- 使用 `expect.poll()`，不要使用固定的 `waitForTimeout()`
- 为 MCP 确认对话框添加重试逻辑（参见 `autoApproveMcpDialogs` 模式）

### 侧边栏残留测试数据

```bash
# 通过数据库清理
sqlite3 "~/Library/Application Support/AionUi-Dev/aionui/aionui.db" \
  "DELETE FROM teams WHERE name LIKE 'E2E%';"
```

或者在测试开始时添加清理逻辑：

```ts
const teams = await invokeBridge(page, 'team.list', { userId: 'system_default_user' });
for (const t of teams) {
  if (t.name.startsWith('E2E')) {
    await invokeBridge(page, 'team.remove', { id: t.id }).catch(() => {});
  }
}
```
