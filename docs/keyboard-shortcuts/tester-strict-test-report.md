# Keyboard Shortcuts Strict Tester Report

Tester: independent strict tester for `keyboard_shortcuts` branch  
Workspace: `C:\Projects\AionUI\keyboard_shortcuts`  
Date: 2026-05-29

## Scope

Reviewed the current keyboard shortcuts implementation and tests without changing business code. The only write made by this tester is this report.

Core files reviewed:

- `packages/desktop/src/renderer/hooks/ui/useGlobalShortcuts.ts`
- `packages/desktop/src/renderer/shortcuts/accelerator.ts`
- `packages/desktop/src/renderer/shortcuts/shortcutRegistry.ts`
- `packages/desktop/src/renderer/shortcuts/defaultBindings.ts`
- `packages/desktop/src/renderer/shortcuts/catalog.ts`
- `packages/desktop/src/renderer/commands/builtinCommands.ts`
- `packages/desktop/src/renderer/pages/settings/ShortcutsSettings.tsx`
- `packages/desktop/src/renderer/components/layout/Layout.tsx`
- `tests/unit/renderer/shortcuts/accelerator.dom.test.ts`
- `tests/unit/renderer/shortcuts/shortcutRegistry.test.ts`

Additional static search covered existing key handlers and shortcut ownership under `packages/desktop/src`.

## Commands Executed

```powershell
Get-Location; git status --short
```

Result: confirmed workspace is `C:\Projects\AionUI\keyboard_shortcuts`; branch contains the expected keyboard shortcut changes and docs.

```powershell
bun node_modules/vitest/vitest.mjs run tests/unit/renderer/shortcuts/shortcutRegistry.test.ts tests/unit/renderer/shortcuts/accelerator.dom.test.ts --config vitest.config.ts
```

Result: passed.

```text
Test Files  2 passed (2)
Tests       10 passed (10)
Duration    12.76s
```

```powershell
bunx oxlint@1.56.0 packages/desktop/src/renderer/commands packages/desktop/src/renderer/shortcuts packages/desktop/src/renderer/hooks/ui/useGlobalShortcuts.ts packages/desktop/src/renderer/pages/settings/ShortcutsSettings.tsx tests/unit/renderer/shortcuts/shortcutRegistry.test.ts tests/unit/renderer/shortcuts/accelerator.dom.test.ts
```

Result: passed.

```text
Found 0 warnings and 0 errors.
```

```powershell
$ErrorActionPreference='Stop'; Get-ChildItem packages/desktop/src/renderer/services/i18n/locales/*/settings.json | ForEach-Object { $_.FullName; Get-Content -Raw $_.FullName | ConvertFrom-Json | Out-Null }
```

Result: passed for all locale `settings.json` files.

```powershell
git diff --check
```

Result: passed.

```powershell
rg -n 'addEventListener\([''"]keydown|onKeyDown|ctrlKey|metaKey|KeyboardEvent|globalShortcut|before-input-event|react-hotkeys|mousetrap|hotkey|shortcut' packages/desktop/src
```

Result: found existing local/global handlers in conversation search, preview save, workspace events, webview host, side bar logout, pet confirmation, and main-process zoom. No third-party shortcut library was found.

## Findings

### Blocking

No hard blocking defect was proven by the automated tests. The targeted unit tests, lint, locale JSON validation, and diff check all pass.

I do not recommend merging without addressing the important items below, because they are exactly the kind of keyboard regression that will not be caught by the current test suite.

### Important

1. Editable target protection misses valid `contenteditable` forms.

`isEditableShortcutTarget` protects `input`, `textarea`, `select`, `[contenteditable="true"]`, `[contenteditable=""]`, CodeMirror, Monaco, xterm, `webview`, `iframe`, and explicit `data-shortcuts-scope` markers. It does not protect `[contenteditable="plaintext-only"]` or the more general `[contenteditable]:not([contenteditable="false"])`.

Risk: if any editor, rich text surface, embedded component, or future command composer uses `contenteditable="plaintext-only"`, global shortcuts such as `CtrlOrCmd+T`, `CtrlOrCmd+B`, or navigation shortcuts can fire while the user is editing text.

Suggested fix: broaden the selector and add a unit test for `contenteditable="plaintext-only"` and nested children inside a contenteditable container.

2. Existing-local/reserved conflicts are diagnosed but not enforced.

The default V1 bindings do not directly take over `CtrlOrCmd+F`, `CtrlOrCmd+Shift+F`, `CtrlOrCmd+S`, or zoom shortcuts. However, persisted overrides can bind an enabled global command to one of these existing-local keys. `getShortcutConflicts` will warn, but `findShortcutCommand` still executes active bindings if the event reaches the window listener.

Concrete risk:

- `CtrlOrCmd+F` and `CtrlOrCmd+Shift+F` are relatively protected by existing document capture listeners that call `preventDefault`.
- `CtrlOrCmd+S` preview save uses a `window` keydown listener. The new global listener is mounted from `Layout`, so it can run before a preview-local `window` listener if a user override maps another command to `CtrlOrCmd+S`. That can prevent or preempt preview save.

Suggested fix: treat collisions with `existingLocal` and `reserved` shortcuts as hard-disabled effective bindings, or add a command-level policy that refuses persisted overrides into reserved accelerators unless the owning local module migrates into the registry.

3. Settings diagnostics are incomplete for unknown or shape-level invalid persisted entries.

`ShortcutsSettings` computes diagnostics from `normalizeKeyboardShortcutsConfig` plus `getShortcutConflicts`, and `catalog.ts` attaches diagnostics by `commandId`. Diagnostics with an unknown command id have no catalog row. Diagnostics with `commandIds: []`, such as invalid binding shape, also have no visible row.

Risk: the settings page claims to show saved overrides and conflict diagnostics, but some invalid persisted config states are silently invisible to the user. This also makes debugging corrupted config harder.

Suggested fix: add a top-level diagnostics panel for config-level and unknown-command diagnostics, separate from per-command rows.

4. Startup applies defaults before persisted config is known.

`useGlobalShortcuts` initializes `shortcutConfig` to `null`, and `null` means "use defaults" in `getEffectiveShortcutBindings`. Until `configService.whenReady()` resolves, a user who presses a shortcut can trigger the default binding even if persisted config later disables or remaps that command.

Risk: small but real startup race, especially if config initialization is delayed by backend/client-preference IO.

Suggested fix: distinguish "not loaded yet" from "no config saved"; do not execute configurable global shortcuts until shortcut config loading has completed.

### Suggestions

1. Add hook-level tests for `useGlobalShortcuts`.

Current tests validate parser and registry behavior, but no test mounts the hook and dispatches `keydown` through `window`. Missing coverage:

- listener is added and removed exactly once per render lifecycle
- non-Electron/WebUI path does not intercept browser shortcuts
- `event.preventDefault()` happens only when a runnable command matches
- config subscription updates are applied without stale closure behavior
- defaults do not fire while an editable target is focused

2. Add `findShortcutCommand` tests for event boundary behavior.

Specific cases to add:

- `event.defaultPrevented === true` returns `null`
- `event.isComposing === true` returns `null`
- `input`, `textarea`, `select`, `contenteditable=""`, `contenteditable="true"`, `contenteditable="plaintext-only"`, `.cm-content`, `.monaco-editor`, `.xterm`, `webview`, and `iframe` targets are blocked
- `allowInEditable: true` allows only explicitly opted-in commands
- `when(ctx) === false` does not call the command and does not prevent default at hook level

3. Add registry tests for disabled and invalid overrides.

Specific cases to add:

- `{ enabled: false }` removes a default binding
- invalid accelerator on a known command is reported and does not fall back unexpectedly
- unknown command diagnostics remain visible to the settings page through a top-level diagnostics model
- reserved/main-process accelerator override is reported and not made effective

4. Add settings page rendering tests.

Specific cases to add:

- persisted override changes the displayed current accelerator and shows the user override tag
- duplicate, invalid, reserved, and existing-local diagnostics render in visible UI
- unknown-command and invalid-shape diagnostics render in a top-level alert
- search matches command id, translated title, category, status, scope, and accelerator

5. Clarify accelerator display and normalization before enabling editing.

The UI currently displays literal `CtrlOrCmd` strings. That is acceptable for a read-only audit page, but once editing is enabled it should display platform-native labels (`Ctrl` on Windows/Linux, `Cmd` on macOS) while preserving a stable persisted representation.

## Boundary Review

Input protection:

- Covered: `input`, `textarea`, `select`, common CodeMirror/Monaco/xterm classes, `webview`, `iframe`, and explicit `data-shortcuts-scope` markers.
- Missing: `contenteditable="plaintext-only"` and a general editable attribute selector.

IME/default prevention:

- `findShortcutCommand` checks `event.defaultPrevented` and `event.isComposing` before matching. This is correct.
- Existing conversation search handlers also check these conditions.

Cross-platform `CtrlOrCmd`:

- `CtrlOrCmd` resolves through `isMacOS()` at parse time.
- Exact matching means `CtrlOrCmd` does not also match physical `Ctrl` on macOS, which is correct for app shortcuts.
- Lowercase `ctrlorcmd` is not accepted. This is acceptable for internal defaults, but should be considered if user editing accepts free-form text.

`Ctrl+Tab` / `Ctrl+Shift+Tab`:

- Exact modifier matching is tested.
- Commands are guarded by a `when` predicate that requires an active visible conversation with a next/previous target.
- These shortcuts are desktop-only through `isElectronDesktop()` in the hook.

Reserved/local shortcuts:

- Default global registry does not enable existing-local or main-process reserved commands.
- Existing local handlers still exist for conversation find, all-conversation search, preview save, workspace escape handling, webview host, side bar logout, and pet confirmation.
- Persisted overrides can still collide with existing-local shortcuts unless the registry starts enforcing diagnostics as effective-binding exclusions.

Settings page:

- It reads `keyboard.shortcuts` through `configService`, subscribes to changes, normalizes config, and feeds diagnostics into `createShortcutCatalog`.
- No stale memo issue was found in the reviewed code; `commands` is stable, and config/catalog/filter/group summaries are memoized with reasonable dependencies.
- Diagnostics that map to known command ids can render on rows. Unknown-command and shape-level diagnostics currently have no visible destination.

## Residual Risks

- No Electron runtime or Playwright/E2E test was executed, so actual menu/main-process interaction, webview focus behavior, and platform-native accelerator behavior are not proven.
- Full repository typecheck was not run in this tester pass; the requested shortcut-focused unit tests, lint, JSON validation, and diff check were run instead.
- `useConversationShortcuts.ts` remains in the tree but appears unused after `Layout` switched to `useGlobalShortcuts`. This is not a runtime regression by itself, but it can confuse future maintainers unless removed or explicitly left as historical code.

## Conclusion

Automated shortcut-focused checks pass, and the default V1 command set is reasonably conservative. I would not approve this branch for merge yet without fixing the important items around editable target coverage, reserved/local collision enforcement, and incomplete settings diagnostics.

Must fix before merge:

- broaden editable target detection and add tests for the missing contenteditable cases
- prevent effective persisted bindings from taking over reserved/existing-local accelerators
- add a visible settings-page destination for config-level and unknown-command diagnostics
- distinguish shortcut config "not loaded yet" from "no saved config" in `useGlobalShortcuts`

Recommended follow-up:

- add hook-level tests for `useGlobalShortcuts`
- add settings rendering tests for diagnostics and persisted overrides
- add Electron/E2E coverage for at least new conversation, conversation cycling, settings open, sidebar toggle, workspace toggle, and preview save coexistence
