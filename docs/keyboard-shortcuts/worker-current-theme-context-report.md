# Worker 述职：主题快捷键上下文接入

## 负责范围

- 目标快捷键：`appearance.toggleTheme` / `CtrlOrCmd+Shift+T`
- 负责模块：
  - `packages/desktop/src/renderer/commands/types.ts`
  - `packages/desktop/src/renderer/hooks/ui/useGlobalShortcuts.ts`

## 实现内容

- 在 `CommandContext` 增加 `appearance` 字段：
  - `theme`
  - `setTheme`
- 在 `useGlobalShortcuts` 内调用现有 `useThemeContext()`，把当前主题状态和 setter 注入命令执行上下文。
- 未修改 `ThemeContext` 本身，继续复用现有主题持久化和应用逻辑。

## 边界与保留问题

- 当前只支持 light/dark 二态切换，因为现有 `Theme` 类型为 `'light' | 'dark'`。
- 文档中的“切换配色方案”可能指 CSS theme preset，而不是 light/dark。该语义尚未产品确认，本轮没有实现。
- `CtrlOrCmd+Shift+T` 在浏览器中常见为恢复关闭标签页；当前快捷键只在 Electron desktop renderer provider 中启用。

## 验证

- 子 Agent 已执行 targeted oxlint。
- 主流程后续执行并通过：
  - `bunx oxlint@1.56.0 ...`
  - `bun node_modules/vitest/vitest.mjs run tests/unit/renderer/shortcuts/shortcutRegistry.test.ts tests/unit/renderer/shortcuts/accelerator.dom.test.ts --config vitest.config.ts`
  - `bunx tsc --noEmit --pretty false`
