# 当前快捷键新增项审查述职

审查范围：当前未提交 diff 中与 `workspace.searchFiles`、`appearance.toggleTheme`、`capabilities.openMcpTools`、workspace search event bridge、ThemeContext 接入相关的实现。

## 1. Blocking findings

未发现需要阻塞合入的问题。

具体核对点：

- `packages/desktop/src/renderer/commands/builtinCommands.ts:117` 到 `127`：`appearance.toggleTheme` 已注册为 `CtrlOrCmd+Shift+T`，通过 `CommandContext.appearance.setTheme` 在 light/dark 间切换。
- `packages/desktop/src/renderer/commands/builtinCommands.ts:130` 到 `140`：`capabilities.openMcpTools` 已注册为 `CtrlOrCmd+;`，目标路由为 `/settings/capabilities?tab=tools`。
- `packages/desktop/src/renderer/commands/builtinCommands.ts:171` 到 `184`：`workspace.searchFiles` 已注册为 `CtrlOrCmd+P`，并受 `workspaceAvailable` 与 conversation/team 路由条件保护。
- `packages/desktop/src/renderer/hooks/ui/useGlobalShortcuts.ts:72` 到 `87`：全局快捷键 context 已接入 `navigate`、`location`、`layout`、`navigationHistory`、`appearance`、`workspaceAvailable`。
- `packages/desktop/src/renderer/components/layout/Layout.tsx:443` 到 `445`：`GlobalShortcutsBridge` 放在 `LayoutContext.Provider` 与 `NavigationHistoryProvider` 内，能读取 Layout/Navigation/Theme 相关上下文。
- `packages/desktop/src/renderer/pages/conversation/Workspace/hooks/useWorkspaceSearch.ts:57` 到 `68`：workspace search 事件监听已正确注册和清理。

## 2. Non-blocking risks

- `packages/desktop/src/renderer/commands/builtinCommands.ts:178`：`CtrlOrCmd+P` 是平台/浏览器常见打印快捷键。当前 `useGlobalShortcuts` 在 `packages/desktop/src/renderer/hooks/ui/useGlobalShortcuts.ts:68` 到 `70` 限定 Electron desktop，且命令 `when` 限定 workspace route，风险可接受；但如果未来启用 WebUI 快捷键或主进程增加打印行为，需要显式纳入 reserved/conflict catalog。
- `packages/desktop/src/renderer/shortcuts/hotkeysAdapter.ts:20` 到 `31`：实现会全局覆盖 `hotkeys.filter` 并设置 `hotkeys-js` scope。当前仓库未发现其他 `hotkeys-js` 使用者，风险可接受；但后续若引入组件级 hotkeys-js，需要避免互相覆盖 filter/scope。
- `packages/desktop/src/renderer/pages/conversation/Workspace/hooks/useWorkspaceSearch.ts:58` 到 `61`：事件触发只负责切到 files tab、显示并聚焦搜索框，不会展开已折叠的 workspace tree。因为搜索输入在 toolbar 区域仍可见，这不是阻塞问题；但如果产品语义要求“搜索文件并展示结果树”，建议同时调用 workspace collapse setter 展开树。
- `packages/desktop/src/renderer/hooks/ui/useGlobalShortcuts.ts:34` 到 `55`：配置加载失败时只打印 warning，`shortcutConfig` 会保持 `undefined`，导致快捷键不注册。现有 `configService.whenReady()` 正常路径没问题；如要更强健，catch 中可降级为 `setShortcutConfig(null)`，让默认快捷键仍可用。

## 3. Tests or verification gaps

已执行：

```text
bunx vitest run tests/unit/renderer/shortcuts/shortcutRegistry.test.ts tests/unit/renderer/shortcuts/accelerator.dom.test.ts
Test Files  2 passed (2)
Tests       12 passed (12)
```

缺口：

- 缺少 `useGlobalShortcuts` 或 `hotkeysAdapter` 的 DOM 集成测试，尚未覆盖真实 `CtrlOrCmd+P`、`CtrlOrCmd+Shift+T`、`CtrlOrCmd+;` keydown 到 command.run 的链路。
- 缺少 workspace search event bridge 测试，尚未断言 `dispatchWorkspaceSearchEvent()` 后 `setActiveTab('files')`、`setShowSearch(true)` 和 input focus 行为。
- 缺少 ThemeContext 接入测试，尚未断言 `appearance.toggleTheme` 调用当前 provider 的 `setTheme`，以及 light/dark 状态切换后持久化路径不回退。
- 缺少路由验证测试，尚未断言 `capabilities.openMcpTools` 最终落在 capabilities 页 tools tab。

建议补测：

- 给 `hotkeysAdapter` 加一组 jsdom 单测：构造三个命令和 context，触发 keydown，断言 `preventDefault` 与 run 调用；同时覆盖 editable target 不触发。
- 给 `useWorkspaceSearch` 加 hook/component 测试：dispatch `WORKSPACE_SEARCH_EVENT` 后检查 files tab callback 和 focus。
- 给 `appearance.toggleTheme` 加 command-level 单测：传入 mock appearance context，分别从 `light`/`dark` 触发并断言目标主题。

## 4. 架构与最小改动原则

整体符合当前架构和最小改动原则。

- 新增命令集中在 `builtinCommands`，执行依赖通过 `CommandContext` 注入，没有在组件内散落新的全局 keydown listener。
- `ThemeContext` 接入位置合理：`main.tsx` 中 `ThemeProvider` 已包裹 `Layout`，`useGlobalShortcuts` 在 Layout 内读取 theme context，不需要额外全局状态。
- workspace search 采用已有 `workspaceEvents.ts` 的 window event bridge 模式，与 `workspace.togglePanel` 一致，改动面较小。
- `useConversationShortcuts` 被 `useGlobalShortcuts` 替代后，conversation tab/new conversation 逻辑迁入 registry，方向正确；不过这次变更已超出三条新增快捷键本身，建议后续继续用集成测试守住迁移行为。
