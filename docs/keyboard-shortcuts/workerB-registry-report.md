# Worker B Registry Report

## Scope

Implemented a renderer-first command and shortcut registry V1. The registry is mounted from `Layout` and handles only focused renderer UI commands. It does not register Electron `globalShortcut` and does not add preload or main-process keyboard IPC.

## Changed Files

- `packages/desktop/src/renderer/commands/types.ts`
- `packages/desktop/src/renderer/commands/builtinCommands.ts`
- `packages/desktop/src/renderer/commands/registry.ts`
- `packages/desktop/src/renderer/shortcuts/accelerator.ts`
- `packages/desktop/src/renderer/shortcuts/defaultBindings.ts`
- `packages/desktop/src/renderer/shortcuts/shortcutRegistry.ts`
- `packages/desktop/src/renderer/shortcuts/types.ts`
- `packages/desktop/src/renderer/hooks/ui/useGlobalShortcuts.ts`
- `packages/desktop/src/renderer/components/layout/Layout.tsx`
- `packages/desktop/src/renderer/shortcuts/catalog.ts`
- `packages/desktop/src/common/config/configKeys.ts`
- `packages/desktop/src/common/config/storage.ts`
- `packages/desktop/src/common/config/configMigration.ts`

## Default Enabled Bindings

| Command                        | Binding             | Behavior                                                                        |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------- |
| `conversation.new`             | `CtrlOrCmd+T`       | Navigate to `/guid`.                                                            |
| `conversation.nextVisible`     | `Ctrl+Tab`          | Cycle to the next visible conversation by sidebar order.                        |
| `conversation.previousVisible` | `Ctrl+Shift+Tab`    | Cycle to the previous visible conversation by sidebar order.                    |
| `app.openSettings`             | `CtrlOrCmd+,`       | Navigate to `/settings/model`.                                                  |
| `app.toggleSidebar`            | `CtrlOrCmd+B`       | Toggle the main left sidebar.                                                   |
| `navigation.back`              | `CtrlOrCmd+[`       | Use `NavigationHistoryContext.back()`.                                          |
| `navigation.forward`           | `CtrlOrCmd+]`       | Use `NavigationHistoryContext.forward()`.                                       |
| `workspace.togglePanel`        | `CtrlOrCmd+Shift+E` | Dispatch the existing workspace panel toggle event on conversation/team routes. |

## Existing And Reserved Bindings

`conversation.findCurrent` (`CtrlOrCmd+F`) and `conversation.searchAll` (`CtrlOrCmd+Shift+F`) are listed as existing local commands only. Their current capture-phase component listeners remain the owners for V1.

`preview.save` (`CtrlOrCmd+S`) remains a component-local preview shortcut. Zoom (`CtrlOrCmd+=`, `CtrlOrCmd+-`, `CtrlOrCmd+0`) remains marked as main-process reserved because it is owned by Electron `before-input-event`.

## Context Guard

The provider ignores shortcuts when:

- the event is already `defaultPrevented`;
- IME composition is active;
- the app is not running in Electron desktop mode;
- the target is an editable surface: `input`, `textarea`, `select`, contenteditable, CodeMirror, Monaco, terminal, webview, iframe, or explicit `data-shortcuts-scope` editor/terminal/webview markers.

Commands can opt into editable contexts with `allowInEditable`; V1 global commands do not.

## Persistence Boundary

The renderer reads user overrides from `configService` key `keyboard.shortcuts`:

```ts
type KeyboardShortcutsConfig = {
  version: 1;
  bindings: {
    commandId: string;
    accelerator: string | null;
    scope?: 'global' | 'route' | 'component';
    enabled?: boolean;
  }[];
};
```

Overrides are merged over command defaults at runtime. Invalid or disabled bindings are ignored. The config key is typed in `ConfigKeyMap` and `IConfigStorageRefer`; no main-process storage or `globalShortcut` path was added.

## Test Suggestions

- Unit: accelerator parsing and matching for `CtrlOrCmd`, `Ctrl+Tab`, `Ctrl+Shift+Tab`, `CtrlOrCmd+,`, `CtrlOrCmd+[`, `CtrlOrCmd+]`, and `CtrlOrCmd+Shift+E`.
- Unit: editable guard for input, textarea, contenteditable, CodeMirror, Monaco, terminal, webview, iframe, and IME composition.
- Unit: registry conflicts for duplicate enabled bindings and collisions with existing/reserved commands.
- Integration: verify `CtrlOrCmd+T`, `Ctrl+Tab`, `Ctrl+Shift+Tab`, `CtrlOrCmd+,`, `CtrlOrCmd+B`, `CtrlOrCmd+[`, `CtrlOrCmd+]`, and `CtrlOrCmd+Shift+E` in Electron desktop.
- Regression: verify `CtrlOrCmd+F` and `CtrlOrCmd+Shift+F` still open the existing conversation search UIs and are not consumed by the new provider.
- Boundary: verify zoom shortcuts still follow main-process behavior and renderer registry does not consume them.
