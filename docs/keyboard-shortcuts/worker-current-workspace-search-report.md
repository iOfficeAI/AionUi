# Worker 述职：工作区文件搜索快捷键桥接

## 负责范围

- 目标快捷键：`workspace.searchFiles` / `CtrlOrCmd+P`
- 负责模块：
  - `packages/desktop/src/renderer/utils/workspace/workspaceEvents.ts`
  - `packages/desktop/src/renderer/pages/conversation/Workspace/hooks/useWorkspaceSearch.ts`
  - `packages/desktop/src/renderer/pages/conversation/Workspace/index.tsx`

## 实现内容

- 在 `workspaceEvents.ts` 增加 `WORKSPACE_SEARCH_EVENT` 和 `dispatchWorkspaceSearchEvent()`，沿用已有 workspace window event bridge 模式。
- 在 `useWorkspaceSearch` 中监听 `WORKSPACE_SEARCH_EVENT`：
  - 调用可选 `onOpenSearch` 回调。
  - 设置 `showSearch` 为 `true`。
  - 延迟聚焦 `searchInputRef`，避免输入框尚未完成挂载。
- 在 `ChatWorkspace` 中传入 `onOpenSearch: () => setActiveTab('files')`，确保搜索事件触发时回到文件 tab。

## 边界与保留问题

- 当前只打开并聚焦已经挂载的 workspace 搜索输入，不强行展开更高层的工作区面板。
- 如果后续产品定义要求 `CtrlOrCmd+P` 一定展开工作区面板，需要把面板折叠状态/展开动作接入 `CommandContext` 或 workspace event detail。
- 搜索事件不穿透编辑器、终端、webview、输入框；这些由全局快捷键 adapter 的 editable target guard 统一处理。

## 验证

- 子 Agent 已执行 targeted oxlint。
- 主流程后续执行并通过：
  - `bunx oxlint@1.56.0 ...`
  - `bun node_modules/vitest/vitest.mjs run tests/unit/renderer/shortcuts/shortcutRegistry.test.ts tests/unit/renderer/shortcuts/accelerator.dom.test.ts --config vitest.config.ts`
  - `bunx tsc --noEmit --pretty false`
