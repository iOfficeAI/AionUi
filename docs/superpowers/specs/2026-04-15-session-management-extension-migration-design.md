# Session Management Extension Migration Design

## Context

The current session management feature was implemented as a built-in settings page in core application code. That approach introduces direct conflicts with upstream in two places that are expensive to maintain in downstream branches:

- built-in settings navigation and routing
- core renderer i18n files, especially `src/renderer/services/i18n/locales/*/settings.json`

The repository already has a bundled extension system that can contribute settings tabs with independent i18n namespaces. This migration moves the session management UI into a bundled extension so downstream changes stay isolated from upstream core settings pages and core locale files.

## Goals

- Move the session management settings entry from core built-in settings into a bundled extension tab.
- Remove core renderer i18n additions introduced only for this feature.
- Keep session management behavior unchanged from the current user-facing implementation:
  - category filter
  - workspace keyword filter
  - conversation title keyword filter
  - pagination
  - current-page select all
  - single delete
  - batch delete
  - click row to open conversation
- Keep the implementation low-risk by reusing existing extension settings tab infrastructure.

## Non-Goals

- Do not generalize the entire extension host API system in this change.
- Do not move database search or conversation deletion authority out of the core process layer.
- Do not redesign the session management UX beyond what is needed to fit the extension settings surface.
- Do not add new session management capabilities beyond the already implemented feature.

## Constraints

- Extension settings tabs are currently delivered as `html/js/css` and embedded through the existing extension settings host.
- Renderer built-in settings routes and built-in settings i18n should not retain feature-specific session management entries after migration.
- Process boundaries must remain intact:
  - data access stays in main process
  - renderer plugin UI uses existing extension host bridge
- Directory size and naming rules from project architecture guidance still apply.

## Current State

The in-progress implementation currently adds:

- a built-in settings route and sider item for `session-management`
- a React page under `src/renderer/pages/settings/SessionManagementSettings/`
- core renderer i18n keys and locale entries under the main `settings.json` files
- a new database IPC method `database.searchManagedConversations`
- repository and SQLite support for filtered session search

This means the feature is functionally close to complete, but the UI and i18n placement create avoidable downstream merge conflicts.

## Options Considered

### Option 1: Bundled extension UI, core capability backend

Move only the settings UI and its translations into a bundled extension. Keep the search and deletion capability in core IPC/database code.

Pros:

- removes the main upstream conflict sources
- minimal change to existing backend implementation
- low-risk because it uses existing extension settings tab infrastructure

Cons:

- core still owns a small amount of extension-specific host API wiring

### Option 2: Bundled extension UI plus generalized host API registry

Move the UI into an extension and also refactor the host API dispatch to support pluggable handlers.

Pros:

- cleaner long-term host API model
- easier reuse for later bundled extensions

Cons:

- expands scope into framework refactoring
- increases regression risk for unrelated extension settings tabs

### Option 3: Fully pluginized feature boundary

Move UI, host API, and feature capability behind a new generic plugin capability layer.

Pros:

- cleanest architecture on paper

Cons:

- far larger than the current need
- delays delivery for little practical benefit in this branch

## Decision

Use **Option 1**.

This directly addresses the stated problem: reduce downstream conflicts by moving the session management UI and translations out of core settings files while keeping the already-correct backend search capability in place.

## Target Design

### 1. Bundled extension package

Add a bundled extension under `extensions/session-management/` with:

- `aion-extension.json`
- `contributes/settings-tabs.json`
- `settings/session-management.html`
- `settings/session-management.js`
- `settings/session-management.css`
- `i18n/en-US/extension.json`
- `i18n/en-US/settings.json`
- `i18n/zh-CN/extension.json`
- `i18n/zh-CN/settings.json`

The extension contributes one settings tab anchored near existing settings content. The tab title is resolved through extension i18n instead of core i18n.

### 2. Core settings cleanup

Remove the built-in implementation from core settings:

- remove `session-management` from built-in settings navigation
- remove the lazy-loaded built-in route
- remove `src/renderer/pages/settings/SessionManagementSettings/`
- remove the session-management additions from core renderer i18n key generation output and locale files

This is the main conflict-reduction goal of the migration.

### 3. Core backend capability retained

Keep the new backend search capability in core code:

- `src/common/types/database.ts`
- `src/common/adapter/ipcBridge.ts`
- `src/process/bridge/databaseBridge.ts`
- `src/process/services/database/IConversationRepository.ts`
- `src/process/services/database/SqliteConversationRepository.ts`
- `src/process/services/database/index.ts`

Reason:

- session search is database-backed application capability
- delete and open conversation actions already belong to core authority boundaries
- the extension UI should consume host capabilities, not bypass them

### 4. Extension host API surface

Extend `ExtensionSettingsTabContent` host handling with session-management-specific actions for this bundled extension:

- `conversation.searchManaged`
- `conversation.removeMany`
- `conversation.open`

Behavior:

- `conversation.searchManaged` delegates to `ipcBridge.database.searchManagedConversations`
- `conversation.removeMany` delegates to `ipcBridge.conversation.remove` per ID and returns success counts
- `conversation.open` performs the same workspace/tab-opening behavior currently implemented in the React page, then navigates to `/conversation/:id`

This keeps the extension page thin and prevents it from re-implementing application routing or data access locally.

### 5. Plugin UI implementation

Rebuild the current React settings page as a bundled extension settings page using plain `html/js/css` and the existing `postMessage` host bridge pattern.

The page preserves current UX semantics:

- top-level description block
- filters for category, workspace keyword, and title keyword
- search and reset actions
- list of conversation rows
- current-page select all / clear selection
- single delete and batch delete
- pagination
- click row to open conversation

### 6. Internationalization model

Feature i18n moves from core renderer locales into extension namespaces:

- tab label in `extension.json`
- page strings in extension `settings.json`

Initial migration will include at least:

- `en-US`
- `zh-CN`

Rationale:

- these are enough to keep the bundled extension usable
- the migration objective is conflict reduction, not maintaining eight new downstream translations in core files

If additional locales are required later, they can be added inside the extension without touching core locale files.

### 7. Styling direction

The extension page should remain visually consistent with existing bundled settings tabs:

- use dedicated local CSS in the extension
- avoid touching global renderer styles
- keep layout responsive enough for desktop and WebUI embedding

No attempt will be made to reproduce Arco component rendering exactly; the priority is functional equivalence and contained maintenance cost.

## File-Level Change Plan

### Add

- `extensions/session-management/**`

### Remove

- `src/renderer/pages/settings/SessionManagementSettings/`

### Update

- `src/renderer/pages/settings/components/SettingsSider/settingsNavigation.tsx`
- `src/renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent/hostApiHandlers.ts`
- `tests/unit/SettingsPageWrapper.test.ts`
- `tests/unit/databaseBridge.test.ts`
- `tests/unit/SqliteConversationRepository.test.ts`
- relevant extension host tests
- relevant extension settings UI tests

### Revert from current in-progress branch state

- core locale additions under `src/renderer/services/i18n/locales/*/settings.json`
- generated key additions in `src/renderer/services/i18n/i18n-keys.d.ts`

## Risks

### Risk 1: Behavior drift when converting React page to extension page

Mitigation:

- keep the feature scope 1:1 with the current implementation
- mirror current action names and result handling
- test delete and open flows explicitly

### Risk 2: Extension host action hardcoding grows over time

Mitigation:

- scope this change narrowly to session management
- keep the host action additions isolated and easy to replace later with a registry if needed

### Risk 3: Locale coverage regresses versus the in-progress core implementation

Mitigation:

- intentionally limit migration locale scope to extension-owned files
- document that this tradeoff is accepted because the goal is reducing downstream merge cost

## Testing Strategy

- keep unit coverage for database search and bridge behavior
- replace the removed React page test with extension-host-level tests where appropriate
- add or update tests for:
  - session-management extension host action dispatch
  - search result rendering behavior in the extension page, if test coverage is practical
  - delete success and partial success handling
  - open conversation host action behavior

Before completion run:

- `bun run format`
- `bun run lint:fix`
- `bunx tsc --noEmit`
- targeted Vitest tests for changed units
- broader `bunx vitest run` if runtime allows

## Rollback Plan

If the extension UI proves unstable, the backend search capability can remain in place and the built-in route can be restored with minimal data-layer rework. The migration deliberately keeps backend capability independent from the extension UI so rollback stays cheap.

## Success Criteria

- Session management no longer appears as a built-in core settings page.
- Session management appears as a bundled extension settings tab.
- Core renderer locale files no longer contain the feature-specific session management strings added in this branch.
- Search, delete, batch delete, and open-session flows still work.
- Existing backend tests for search capability still pass after migration.
