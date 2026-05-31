# Owner Review: Keyboard Shortcuts

## Verdict

Do not merge.

The change mixes a read-only settings page with a runtime replacement of the existing conversation shortcut hook. The registry direction is reasonable, but the shipped state is not a closed product slice: the settings UI cannot edit or persist shortcuts, the runtime provider has no tests, and the documentation overstates or contradicts what the code actually does.

## Blocking Issues

1. **Settings page is not wired to persisted shortcut state.**

   `/settings/shortcuts` renders `shortcutCatalog`, which is a static catalog assembled from command defaults and future placeholder rows (`packages/desktop/src/renderer/shortcuts/catalog.ts:89`, `packages/desktop/src/renderer/shortcuts/catalog.ts:181`). It never reads `keyboard.shortcuts`, never shows user overrides, never shows live registry conflicts, and both reset actions are disabled placeholders (`packages/desktop/src/renderer/pages/settings/ShortcutsSettings.tsx:147`, `packages/desktop/src/renderer/pages/settings/ShortcutsSettings.tsx:155`, `packages/desktop/src/renderer/pages/settings/ShortcutsSettings.tsx:223`). This means the newly added config key is invisible to the only UI that should manage it. From a product perspective, this is not a shortcuts settings feature; it is a static inventory page.

2. **Runtime shortcut registry is untested while replacing existing mounted behavior.**

   `Layout` removes `useConversationShortcuts` and mounts `useGlobalShortcuts` instead (`packages/desktop/src/renderer/components/layout/Layout.tsx:121`, `packages/desktop/src/renderer/components/layout/Layout.tsx:442`). The new provider owns `CtrlOrCmd+T`, `Ctrl+Tab`, `Ctrl+Shift+Tab`, sidebar toggle, navigation back/forward, and workspace toggle (`packages/desktop/src/renderer/commands/builtinCommands.ts:30`). There are no matching unit, DOM, or e2e tests for `useGlobalShortcuts`, `shortcutRegistry`, `accelerator`, or `ShortcutsSettings`; `rg` finds no coverage for those symbols under `tests/`. This is too risky for keyboard navigation because regressions are silent and cross-platform.

3. **Shortcut config validation accepts unknown scope values and unknown command IDs.**

   The persisted type allows only `global | route | component` scopes (`packages/desktop/src/common/config/configKeys.ts:5`), but `isKeyboardShortcutsConfig` only checks `commandId`, `accelerator`, and `enabled` (`packages/desktop/src/renderer/shortcuts/shortcutRegistry.ts:8`). It does not validate `scope`, reject unknown command IDs, dedupe duplicate command entries, or sanitize non-string scope values before merging. Unknown command IDs do not execute today, but they still pass validation and remain in persisted config, which makes future editing/conflict UI and migration semantics brittle.

4. **Conflict detection only warns; invalid active shortcuts silently disappear.**

   `getEffectiveShortcutBindings` drops invalid accelerators (`packages/desktop/src/renderer/shortcuts/shortcutRegistry.ts:54`) and `useGlobalShortcuts` only logs errors to the console (`packages/desktop/src/renderer/hooks/ui/useGlobalShortcuts.ts:54`). There is no user-visible diagnostic, no fallback recovery, no disabled state in settings, and no prevention before saving because saving is not implemented. A malformed persisted value can make a command vanish with no explanation.

5. **Documentation is internally inconsistent and not reliable enough for handoff.**

   `workerA-ui-report.md` says the UI work "does not modify `useConversationShortcuts`" (`docs/keyboard-shortcuts/workerA-ui-report.md:5`), but `Layout` no longer imports or calls that hook. The same report says non-English locales rely on fallback merge (`docs/keyboard-shortcuts/workerA-ui-report.md:38`); the code does merge against the fallback locale, but the sidebar labels themselves are still hard-coded as English `"Shortcuts"` in ja/ko/ru/tr/uk (`packages/desktop/src/renderer/services/i18n/locales/ja-JP/settings.json:423` and peers). The docs should state the actual behavior and remaining product gaps, not describe an earlier work split.

## Non-Blocking Suggestions

- Keep `shortcutCatalog` derived from the registry selector used by runtime, not from a separate UI-only type. The current split creates two sources of truth for current shortcut, conflict, status, and scope.
- Add a small accelerator formatter for display. Showing `CtrlOrCmd` literally is implementation terminology and does not match platform conventions.
- Consider a central command registry API that returns commands, effective bindings, conflicts, and persistence actions together. Settings should not have to recompute status from a catalog while runtime computes another view.
- Avoid `console.warn` as the only operational feedback for configuration problems. Settings should expose invalid and conflicting bindings immediately.
- If `keyboard.shortcuts` is intentionally future-facing, do not mount a runtime override reader until there is a supported writer and recovery path.

## Test Gaps

- Unit coverage for `parseAccelerator`, `normalizeAccelerator`, `matchesAccelerator`, `CtrlOrCmd` on macOS vs Windows/Linux, punctuation keys, `Ctrl+Tab`, `Ctrl+Shift+Tab`, IME composition, and editable target guards.
- Unit coverage for config validation: unknown command IDs, invalid scopes, duplicate command bindings, null accelerators, disabled bindings, and invalid accelerator strings.
- DOM hook tests for `useGlobalShortcuts`: default commands execute, editable targets are ignored, `when` guards block commands, config overrides disable or remap commands, and `preventDefault` is only called for handled commands.
- Integration/e2e coverage in Electron for `CtrlOrCmd+T`, conversation cycling, settings navigation, sidebar toggle, navigation back/forward, workspace toggle, and ensuring `CtrlOrCmd+F`, `CtrlOrCmd+Shift+F`, preview save, and zoom shortcuts are not stolen.
- Settings UI tests for route availability, sidebar entry, search, empty state, locale fallback, and future persistence once editing is enabled.

## Merge Recommendation

Do not merge this as-is. I would reconsider after the runtime registry has test coverage, the settings page consumes actual effective persisted state, invalid/conflicting persisted shortcuts are surfaced to users, and the docs are corrected to describe the integrated behavior rather than the earlier worker split.
