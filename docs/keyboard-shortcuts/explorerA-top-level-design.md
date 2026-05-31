# AionUI Keyboard Shortcuts Top-Level Design

Author: explorerA  
Scope: design review only; no business code changes.

## Technical Stack Positioning

AionUI desktop is an Electron app built with `electron-vite`, React 19, React Router hash routes, Arco Design, IconPark icons, UnoCSS, TypeScript, Vitest, and Playwright. The desktop renderer lives under `packages/desktop/src/renderer`; Electron main and preload live under `packages/desktop/src/index.ts`, `packages/desktop/src/process`, and `packages/desktop/src/preload`.

The current bridge model is hybrid:

- Most product data and settings are now routed through aioncore HTTP/WS APIs via `packages/desktop/src/common/adapter/ipcBridge.ts` and `httpBridge.ts`.
- Electron-native operations remain IPC providers through `@office-ai/platform` bridge, initialized by `packages/desktop/src/process/bridge/index.ts`.
- Preload exposes one generic `window.electronAPI.emit/on` bridge in `packages/desktop/src/preload/main.ts`, plus backend port bootstrap and tray DOM event forwarding.
- Renderer-side persisted preferences use `configService` in `packages/desktop/src/common/config/configService.ts`, backed by `/api/settings/client`.
- Main-process-only local settings use `ProcessConfig` in `packages/desktop/src/process/utils/initStorage.ts`, backed by `aionui-config.txt`.

This means keyboard shortcuts should be designed as renderer-first command dispatch for UI actions, with main-process boundaries only for Electron-native accelerators, global OS shortcuts, and persistence that affects main process behavior.

## Existing Shortcut Implementation

Current shortcuts are scattered and mostly component-local:

- Window-level conversation shortcuts are mounted in `packages/desktop/src/renderer/components/layout/Layout.tsx` through `useConversationShortcuts`.
- `packages/desktop/src/renderer/hooks/ui/useConversationShortcuts.ts` handles desktop-only `Ctrl+Tab` / `Ctrl+Shift+Tab` conversation cycling and `Ctrl/Cmd+T` new conversation navigation to `/guid`.
- `packages/desktop/src/renderer/pages/conversation/Preview/hooks/usePreviewKeyboardShortcuts.ts` handles `Ctrl/Cmd+S` save for dirty preview content.
- `packages/desktop/src/renderer/pages/conversation/components/ConversationTitleMinimap/useMinimapPanel.ts` captures `Ctrl/Cmd+F` in Electron desktop for current conversation search.
- `packages/desktop/src/renderer/pages/conversation/GroupedHistory/ConversationSearchPopover.tsx` captures `Ctrl/Cmd+Shift+F` for global conversation message search.
- `packages/desktop/src/renderer/components/layout/Sider/index.tsx` captures `Ctrl/Cmd+Shift+L` for logout, but only when browser/WebUI auth logout is visible.
- `packages/desktop/src/process/utils/zoom.ts` uses Electron `before-input-event` for `Ctrl/Cmd +`, `Ctrl/Cmd -`, and `Ctrl/Cmd 0` zoom, persisted to `ui.zoomFactor`.
- Pet confirm renderer has isolated confirmation shortcuts such as Enter/Escape/A/Y/number keys in `packages/desktop/src/renderer/pet/petConfirmRenderer.ts`.

There is no central command registry, no central shortcut registry, and no shared conflict model. Context control is implemented case by case with checks like `event.defaultPrevented`, `event.isComposing`, `window.electronAPI`, and route-local state.

## Relevant Settings And Storage Structure

Settings have two UI surfaces:

- Modal settings: `packages/desktop/src/renderer/components/settings/SettingsModal/index.tsx`, with a smaller tab set (`model`, `tools`, `webui`, `system`, `about`, plus extension tabs).
- Route settings: `packages/desktop/src/renderer/pages/settings/*`, with sidebar entries from `SettingsSider.tsx`: `agent`, `model`, `assistants`, `capabilities`, `display`, `webui`, `pet`, `system`, `about`, and extension tabs.

Recommended shortcut customization UI should be route-based, e.g. `/settings/shortcuts`, because the route settings surface is the canonical full settings shell. The modal can later deep-link to the route or show a read-only shortcuts help panel.

Persistence recommendation:

- Store user shortcut overrides in backend client settings via `configService`, key proposal: `keyboard.shortcuts`.
- Add the key to `ConfigKeyMap` and `IConfigStorageRefer` only if legacy Electron-local storage compatibility is required. Prefer the backend client settings path for WebUI consistency and existing `/api/settings/client` migration behavior.
- Keep Electron-local `ProcessConfig` only for main-process accelerators that must be available before renderer boot, such as zoom or future OS-level global shortcuts.

Suggested persisted shape:

```ts
type ShortcutBinding = {
  commandId: string;
  accelerator: string | null;
  scope?: 'global' | 'route' | 'component';
  enabled?: boolean;
};

type KeyboardShortcutsConfig = {
  version: 1;
  bindings: ShortcutBinding[];
};
```

## Recommended Architecture

### Command Registry

Create a renderer command registry as the stable semantic layer, for example:

- `packages/desktop/src/renderer/commands/types.ts`
- `packages/desktop/src/renderer/commands/registry.ts`
- `packages/desktop/src/renderer/commands/builtinCommands.ts`

Each command should define:

- `id`: stable string such as `app.openSettings`, `conversation.new`, `conversation.findCurrent`, `conversation.searchAll`.
- `titleKey`: i18n key.
- `category`: app, conversation, workspace, preview, settings, developer.
- `defaultShortcut`: platform-aware accelerator or none.
- `when`: context predicate key or function.
- `run(ctx)`: implementation using injected router, layout, preview, conversation, and IPC services.
- `risk`: normal, destructive, confirmRequired, developerOnly.

The command registry should be the single source for command palette, shortcuts help, settings customization, and default keybindings. Avoid tying keyboard shortcuts directly to component event handlers.

### Shortcut Registry

Create a shortcut registry that consumes command definitions plus user overrides:

- `packages/desktop/src/renderer/shortcuts/accelerator.ts`: normalize keyboard events and Electron-style accelerators.
- `packages/desktop/src/renderer/shortcuts/defaultBindings.ts`: default bindings derived from commands.
- `packages/desktop/src/renderer/shortcuts/shortcutRegistry.ts`: conflict detection and active binding lookup.
- `packages/desktop/src/renderer/shortcuts/useShortcutProvider.ts`: document/window listener lifecycle.

Important behavior:

- Normalize `CtrlOrCmd` per platform for display, but keep actual matching explicit.
- Ignore events during IME composition.
- Respect `event.defaultPrevented`.
- Do not steal text-editing keys from inputs, textareas, contenteditable nodes, CodeMirror, Monaco, terminal/webview contexts unless the command is explicitly allowed in editable context.
- Resolve priority by scope: modal/component > route/page > app global > main-process accelerator.
- Provide deterministic conflict diagnostics for settings UI.

### Provider Mounting Location

Mount one app-level provider near the root, after router and existing contexts are available:

- Candidate: inside `Layout` under `NavigationHistoryProvider`, because it already has `navigate`, layout state, route location, and app-wide lifecycle.
- Better long-term candidate: a new `AppCommandProvider` wrapping `Outlet` inside `Layout`, with adapters for router, preview context, layout context, and command execution.

Local providers should still exist for strongly local behavior:

- Preview panel can register `preview.save` only while editable preview is mounted.
- Conversation title minimap can register search-result navigation while its panel is open.
- Confirmation modals should keep Enter/Escape semantics local and high-priority.

Do not put all keyboard logic into `window.addEventListener` scattered across components. Instead, local surfaces should register scoped commands or handlers with the shortcut provider.

### IPC Boundary

Renderer-side commands should call existing `ipcBridge` or `configService` APIs. The command registry should not import Electron directly.

Main-process participation should be limited to:

- Existing zoom shortcuts in `process/utils/zoom.ts`, unless moved later into the unified model with a main-process adapter.
- Future OS-level global shortcuts via Electron `globalShortcut`, if AionUI ever supports shortcuts while unfocused. These require explicit settings, permission UX, and platform conflict checks.
- Native actions already exposed by `ipcBridge.application`, `dialog`, `shell`, and `windowControls`.

If custom shortcuts must affect main process before renderer initialization, add typed IPC providers under `application` or `systemSettings`, not ad hoc preload APIs.

### Settings UI

Add a route settings page rather than overloading the existing System tab:

- New route: `/settings/shortcuts`.
- Add `shortcuts` to `BUILTIN_TAB_IDS` in `SettingsSider.tsx` and `SettingsPageWrapper.tsx`.
- UI should group commands by category, show current effective shortcut, default shortcut, conflict state, and reset controls.
- Editing should validate before persist and store only overrides in `keyboard.shortcuts`.
- Help panel can be command-registry-driven and opened by `Ctrl/Cmd+Shift+/`.

## Default Shortcut Direction

Based on `C:\Projects\AionUI\raw\shortcuts_function_merged.md`, start conservative:

- Adopt: `Ctrl/Cmd+,` open settings, `Ctrl/Cmd+Shift+/` shortcuts help, `Ctrl/Cmd+K` and/or `Ctrl/Cmd+Shift+P` command palette, `Ctrl/Cmd+B` toggle sidebar, `Ctrl/Cmd+O` open folder/project, `Ctrl/Cmd+F` find current conversation, `Ctrl/Cmd+Shift+F` search conversations, `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle conversations, `Ctrl/Cmd+P` search files, `Ctrl/Cmd+Shift+M` model selector.
- Preserve existing: `Ctrl/Cmd+T` new conversation unless product decides `Ctrl+T` belongs to browser tabs.
- Keep local: `Ctrl/Cmd+S` preview save, Enter/Escape confirmation handling, search-result arrows/Enter.
- Avoid default binding for high-risk or low-frequency actions: auto-approve permissions, delete/archive, logout, forced reload, trace recording, language/theme presets.

## Risks

- Shortcut collisions are currently silent because handlers are scattered. A central registry must surface conflicts before enabling custom overrides.
- Input contexts are high-risk: send boxes, slash command menus, CodeMirror/Monaco editors, webviews, browser previews, and future terminal components may own common keys.
- Electron `before-input-event` zoom shortcuts can preempt renderer shortcuts; leave them documented as reserved until unified.
- WebUI/browser mode should not hijack browser-native shortcuts. Existing code already checks `window.electronAPI`; the provider should keep that distinction.
- Persisted custom shortcuts can break navigation if invalid or conflicting. Store versioned config and provide reset-to-default.
- Cross-platform display and matching need care: Windows/Linux `Ctrl`, macOS `Meta`, AltGraph, non-US layouts, IME composition, numpad keys.
- Settings route additions affect extension tab anchoring and mobile settings navigation; changes should be tested in both desktop and mobile viewport layouts.

## Migration Steps

1. Inventory existing shortcuts and mark reserved accelerators: current renderer handlers, main-process zoom, pet confirmation, browser/webview/editor defaults.
2. Introduce command types and builtin command registry without changing behavior.
3. Add shortcut normalization and conflict detection tests.
4. Add an app-level `ShortcutProvider` in `Layout`, initially registering only existing `useConversationShortcuts` behavior behind the same defaults.
5. Migrate `Ctrl/Cmd+F`, `Ctrl/Cmd+Shift+F`, `Ctrl/Cmd+S`, and logout handling into scoped registrations while preserving current behavior.
6. Add `keyboard.shortcuts` persistence through `configService`, including validation and reset.
7. Add `/settings/shortcuts` UI and a shortcuts help panel driven by the same registry.
8. Add the command palette after command execution is centralized; do not create a palette with a separate action model.
9. Expand defaults from the merged shortlist only after conflict telemetry/testing.
10. Keep main-process zoom shortcuts as reserved until a deliberate main/renderer shortcut ownership pass.

## Key Conclusion

AionUI should not add more isolated keyboard hooks. The right top-level design is a renderer command registry plus a scoped shortcut registry, mounted near `Layout`, persisted through backend client settings, and bridged to main only for Electron-native or OS-global behavior. This gives AionUI one semantic command layer for keyboard shortcuts, command palette, help, and settings customization while preserving local editor/search/confirmation behavior.
