# Cron Backend Migration — Final Plan

> For implementation work, use this document as the source of truth. The execution order below was strict during migration because the frontend initially still contained a live ACP cron fallback and the backend cron middleware was not yet wired into the real runtime path.

## Status Snapshot

Completed:

- Phase 1: API alignment
- Phase 2: frontend ACP fallback switched to backend HTTP
- Phase 3: local scheduler and legacy bridge removed
- Phase 4: backend runtime middleware parity landed
- Phase 5: frontend ACP cron fallback removed
- Phase 6: backend skill file and skill suggest ownership landed
- Phase 7: backend behavioral parity cleanup
- Phase 8: move `CronBusyGuard`

## Goal

Move all cron business logic out of the Electron main process and into `aionui-backend`.

Final ownership split:

- Backend owns cron command execution, scheduling, retries, run-now behavior, resume handling, orphan cleanup, skill persistence, prompt construction, skill suggestion detection, and websocket event emission.
- Frontend keeps only:
  - CRUD entry points and pages
  - conversation display sanitization if needed
  - websocket subscriptions and lightweight UI refresh behavior
  - optional desktop notifications driven by backend events

## Current State

### What is already backend-owned

- Standard cron CRUD already routes through `ipcBridge.cron` HTTP helpers to `/api/cron/*`.
- Backend cron service and scheduler already exist.
- Backend emits `cron.job-*` events for list/detail page refresh.

### What is still frontend-owned

- cron CRUD entry points in `ipcBridge.cron`
- websocket subscriptions and UI refresh behavior
- stream text replacement support for backend terminal cleanup
- conversation rendering for `skill_suggest`

### What is still missing on the backend

- no known blockers in the cron migration scope

## Locked Decisions

### 1. Migration order

Do not delete the frontend ACP cron fallback first.

Reason:

- The backend middleware exists as library logic, but it is not yet wired into the real `send_message -> StreamRelay` runtime path.
- If frontend ACP cron handling is removed before that wiring lands, chat-triggered cron creation regresses immediately.

### 2. `run_now` semantics

Keep the current frontend UX:

- return `conversation_id` quickly
- navigate immediately
- execute asynchronously in the background

### 3. Skill storage mechanism

Use Plan Z:

- store per-job skill content on disk at `{data_dir}/cron/skills/cron-{job_id}/SKILL.md`
- extend `aionui-extension` skill lookup with `cron_skills_dir`
- inject the saved skill into cron execution through the extension resolution path
- leave `cron_jobs.skill_content` in the schema for compatibility during migration, but stop relying on it as the source of truth

### 4. `SKILL_SUGGEST` delivery path

Reuse `AgentStreamEvent::SkillSuggest`.

The detector should live in backend runtime code that already knows:

- `conversation_id`
- `workspace`
- `cron_job_id`
- turn completion state

It should not remain frontend-owned.

### 5. Missed-job behavior on system resume

Preserve the current frontend behavior:

- mark the job as missed
- insert a visible tips message into the conversation
- do not automatically re-execute the missed run

### 6. `CronBusyGuard.ts`

Do not delete it as part of cron removal.

Current code shows it is still used outside pure cron logic, including:

- `src/process/task/WorkerTaskManager.ts`
- `src/process/task/ConversationTurnCompletionService.ts`
- multiple AgentManager implementations

So the final action is:

- move and rename it as a conversation-level busy guard
- do not treat it as disposable cron-only code

## High-Level Migration Order

1. API alignment
2. Switch frontend ACP fallback from local cron service to backend HTTP
3. Delete local scheduler and legacy cron bridge
4. Wire backend runtime middleware and close behavior gaps
5. Delete frontend ACP cron fallback
6. Move `SKILL_SUGGEST` watching to backend
7. Finish backend parity work
8. Move `CronBusyGuard` out of the cron module

This order is mandatory.

## File Inventory

### Backend: new files

- `crates/aionui-cron/src/skill_file.rs`
- `crates/aionui-cron/src/prompt.rs`
- `crates/aionui-cron/src/skill_suggest.rs`
- `crates/aionui-cron/tests/skill_file_test.rs`
- `crates/aionui-cron/tests/prompt_test.rs`
- `crates/aionui-cron/tests/skill_suggest_test.rs`
- `crates/aionui-extension/tests/cron_skill_resolve_test.rs`

### Backend: modified files

- `crates/aionui-extension/src/constants.rs`
- `crates/aionui-extension/src/skill_service.rs`
- `crates/aionui-cron/src/lib.rs`
- `crates/aionui-cron/src/routes.rs`
- `crates/aionui-cron/src/service.rs`
- `crates/aionui-cron/src/executor.rs`
- `crates/aionui-cron/src/state.rs`
- `crates/aionui-app/src/state_builders.rs`
- `crates/aionui-ai-agent/src/middleware.rs`
- `crates/aionui-conversation/src/service.rs`
- `crates/aionui-conversation/src/stream_relay.rs`
- `crates/aionui-api-types/src/cron.rs`

### Frontend: modified files

- `src/common/adapter/ipcBridge.ts`
- `src/common/chat/chatLib.ts`
- `src/process/utils/initBridge.ts`
- `src/process/bridge/index.ts`
- `src/process/task/AcpAgentManager.ts`
- `src/process/task/OpenClawAgentManager.ts`
- `src/process/task/AionrsManager.ts`
- `src/process/task/NanoBotAgentManager.ts`
- `src/process/task/RemoteAgentManager.ts`
- `src/renderer/pages/conversation/Messages/hooks.ts`

### Frontend: files deleted during migration

Deleted in Phase 3:

- `src/process/bridge/cronBridge.ts`
- `src/process/services/cron/CronService.ts`
- `src/process/services/cron/CronStore.ts`
- `src/process/services/cron/SqliteCronRepository.ts`
- `src/process/services/cron/IpcCronEventEmitter.ts`
- `src/process/services/cron/ICronRepository.ts`
- `src/process/services/cron/ICronEventEmitter.ts`
- `src/process/services/cron/ICronJobExecutor.ts`
- `src/process/services/cron/WorkerTaskManagerJobExecutor.ts`
- `src/process/services/cron/cronServiceSingleton.ts`

Deleted in Phase 5:

- `src/process/task/CronCommandDetector.ts`
- `src/process/task/MessageMiddleware.ts`

Deleted in Phase 6:

- `src/process/services/cron/SkillSuggestWatcher.ts`
- `src/process/services/cron/cronSkillFile.ts`

Delete in Phase 8:

- `src/process/services/cron/CronBusyGuard.ts`

## Phase 1 — API Alignment

Status: completed

### Objective

Ensure every frontend cron skill-management operation already has a backend API target before deeper migration starts.

### Backend work

File: `crates/aionui-cron/src/routes.rs`

- Add `DELETE /api/cron/jobs/{id}/skill`.
- Reuse existing `CronService::delete_skill`.

File: `crates/aionui-cron/src/service.rs`

- Keep existing delete logic if behavior is correct.
- Verify missing-job behavior remains consistent.

Tests:

- Add route-level coverage for:
  - delete existing skill
  - delete missing job skill
  - auth requirement if applicable

### Frontend work

File: `src/common/adapter/ipcBridge.ts`

- Add `ipcBridge.cron.deleteSkill`.
- Keep the cron namespace fully HTTP/WS based.

### Acceptance criteria

- `saveSkill`, `hasSkill`, and `deleteSkill` can all complete through backend APIs alone.

## Phase 2 — Switch ACP Local Fallback to Backend HTTP

Status: completed

### Objective

Keep frontend cron detection temporarily, but remove its dependency on the local cron implementation.

This is the bridge phase.

Detection remains in frontend for now.
Execution ownership moves to backend now.

### Frontend work

File: `src/process/task/MessageMiddleware.ts`

- Replace local `cronService` calls with `ipcBridge.cron.*.invoke(...)`.
- Use backend CRUD routes for:
  - create
  - list by conversation
  - get job
  - update job
  - remove job if delete command is supported
- Remove manual local `ipcBridge.cron.onJobCreated.emit(...)`.
- Remove manual local `ipcBridge.cron.onJobUpdated.emit(...)`.

Reason:

- backend event emission should be the single source of truth
- local manual emit risks duplicate refresh behavior

File: `src/process/task/AcpAgentManager.ts`

- Keep the finish-hook cron fallback in place for now.
- Do not remove `processCronInMessage(...)` yet.

File: `src/process/task/CronCommandDetector.ts`

- No change yet.

### Acceptance criteria

- Chat-triggered cron creation updates backend state only.
- Chat-triggered cron update updates backend state only.
- Frontend cron fallback no longer depends on the local scheduler or local cron repository.

## Phase 3 — Remove Local Scheduler and Legacy Bridge

Status: completed

### Objective

Delete the old in-process scheduler stack after Phase 2 proves that backend already owns persistence and task execution.

### Frontend deletions

Delete:

- `src/process/bridge/cronBridge.ts`
- `src/process/services/cron/CronService.ts`
- `src/process/services/cron/CronStore.ts`
- `src/process/services/cron/SqliteCronRepository.ts`
- `src/process/services/cron/IpcCronEventEmitter.ts`
- `src/process/services/cron/ICronRepository.ts`
- `src/process/services/cron/ICronEventEmitter.ts`
- `src/process/services/cron/ICronJobExecutor.ts`
- `src/process/services/cron/WorkerTaskManagerJobExecutor.ts`
- `src/process/services/cron/cronServiceSingleton.ts`

### Frontend edits

File: `src/process/bridge/index.ts`

- Remove `initCronBridge` import
- remove `initCronBridge()` call
- remove export

File: `src/process/utils/initBridge.ts`

- Remove `cronService` import
- remove `void cronService.init()`

### Files that had to remain after Phase 3

Keep:

- `src/process/task/MessageMiddleware.ts`
- `src/process/task/CronCommandDetector.ts`
- `src/process/services/cron/SkillSuggestWatcher.ts`
- `src/process/services/cron/cronSkillFile.ts`
- `src/process/services/cron/CronBusyGuard.ts`

### Acceptance criteria

- App startup no longer initializes a local cron scheduler.
- No provider-based cron bridge remains.
- Chat cron creation still works because frontend fallback is still active.

## Phase 4 — Backend Runtime Middleware Parity

Status: completed

### Objective

Make backend runtime capable of replacing the frontend ACP cron fallback without behavior loss.

This phase has three critical gaps to close before frontend fallback can be deleted.

### Gap A — Backend middleware is not in the real runtime

Current state:

- `aionui_ai_agent::MessageMiddleware` exists
- but it is not yet wired into the real `send_message -> StreamRelay` runtime path

Required work:

File: `crates/aionui-conversation/src/service.rs`

- inject the middleware dependency into the real conversation runtime path

File: `crates/aionui-conversation/src/stream_relay.rs`

- apply middleware to the terminal accumulated assistant text before final persistence
- emit any generated follow-up messages/events

### Gap B — Backend middleware is missing command parity

Current state:

- backend middleware supports create/list/delete
- frontend fallback also supports update

Required work:

File: `crates/aionui-ai-agent/src/middleware.rs`

- add `CRON_UPDATE` parsing
- extend command model
- extend trait surface

File: `crates/aionui-cron/src/service.rs`

- implement update behavior for middleware use

### Gap C — List semantics do not match current frontend behavior

Current state:

- backend middleware list behavior is user-scoped
- frontend fallback behavior is conversation-scoped

Required work:

- align backend list behavior with conversation-scoped semantics for chat-triggered cron listing

### Display sanitization

Implemented via backend terminal replacement plus frontend replace-aware stream handling.

Frontend support change:

File: `src/common/chat/chatLib.ts`

- preserve `replace: true` stream semantics

File: `src/renderer/pages/conversation/Messages/hooks.ts`

- replace terminal text for the same `msg_id` instead of always appending

### Tests

Backend tests must cover:

- create/list/update/delete middleware behavior
- conversation-scoped list semantics
- final persisted text cleanup
- emitted follow-up message behavior

### Acceptance criteria

- Backend runtime can execute cron commands without frontend ACP help.
- Persisted assistant text no longer contains raw cron tags.
- Chat UI does not leak raw cron tags during streaming.

## Phase 5 — Remove Frontend ACP Cron Fallback

Status: completed

### Objective

Delete frontend cron command runtime logic only after Phase 4 is complete.

### Frontend edits

File: `src/process/task/AcpAgentManager.ts`

- remove `hasCronCommands`
- remove `processCronInMessage`
- remove cron-related finish-hook logic

File: `src/process/task/MessageMiddleware.ts`

- delete the file if nothing else still depends on it
- if think-tag logic is still needed elsewhere, split that logic into a dedicated non-cron helper before deletion

File: `src/process/task/CronCommandDetector.ts`

- delete

### Repo-wide cleanup

Search for and remove remaining references to:

- `processCronInMessage`
- `hasCronCommands`
- `CronCommandDetector`
- cron-specific `MessageMiddleware`

### Acceptance criteria

- There is no frontend runtime cron command execution left.
- Backend is the only owner of chat-triggered cron command handling.

## Phase 6 — Backend Skill File and Skill Suggest Ownership

Status: completed

### Objective

Move cron skill persistence and `SKILL_SUGGEST.md` watching fully to backend.

This phase keeps the good parts of the previous implementation plan, but puts them in the correct migration order.

### Part A — Plan Z skill storage

#### Extension path support

File: `crates/aionui-extension/src/constants.rs`

- add `CRON_SKILLS_DIR_NAME = "cron/skills"`

File: `crates/aionui-extension/src/skill_service.rs`

- add `cron_skills_dir: PathBuf` to `SkillPaths`
- populate it from data dir
- extend `resolve_skill_source_path` with cron skill lookup

Tests:

- `crates/aionui-extension/tests/cron_skill_resolve_test.rs`

#### Cron skill file module

Create: `crates/aionui-cron/src/skill_file.rs`

Responsibilities:

- compute per-job skill dir
- validate skill content
- write atomic `SKILL.md`
- read `SKILL.md`
- delete job skill dir
- hash normalized content for dedupe

Tests:

- `crates/aionui-cron/tests/skill_file_test.rs`

#### Service integration

File: `crates/aionui-cron/src/service.rs`

- switch `save_skill`
- switch `has_skill`
- switch `delete_skill`
- treat on-disk skill as the source of truth

File: `crates/aionui-api-types/src/cron.rs`

- leave existing field shape stable if needed for compatibility
- clearly mark DB `skill_content` path as deprecated in comments if exposed in code

### Part B — Prompt builders

Create: `crates/aionui-cron/src/prompt.rs`

Port the four prompt builders from the frontend executor.

These strings are load-bearing and should not be simplified during migration.

Tests:

- `crates/aionui-cron/tests/prompt_test.rs`

### Part C — Executor integration

File: `crates/aionui-cron/src/executor.rs`

- detect saved skill through `skill_file`
- build prompts through `prompt.rs`
- inject saved skill through the extension resolution path

### Part D — Backend skill-suggest detector

Create: `crates/aionui-cron/src/skill_suggest.rs`

Responsibilities:

- watch `SKILL_SUGGEST.md` after turn finish
- retry briefly for delayed writes
- validate content
- dedupe by content hash
- suppress if saved skill already exists
- emit `AgentStreamEvent::SkillSuggest`

This detector must be invoked from real runtime code that knows conversation/workspace context.

### Frontend deletions after backend ownership is proven

Delete:

- `src/process/services/cron/SkillSuggestWatcher.ts`
- `src/process/services/cron/cronSkillFile.ts`

### Acceptance criteria

- Backend owns save/has/delete and on-disk skill persistence.
- `skill_suggest` cards still appear.
- Frontend no longer watches or writes cron skill files.

## Phase 7 — Backend Behavioral Parity Cleanup

Status: completed

### Objective

Close the remaining backend behavior gaps after ownership transfer.

### Required work

File: `crates/aionui-cron/src/service.rs`

- improve orphan cleanup beyond the current weak heuristic
- backfill `cron_job_id` relationships where needed
- preserve async `run_now` semantics

File: `crates/aionui-cron/src/scheduler.rs` or service resume path

- on system resume:
  - mark missed jobs
  - insert a visible tips message into the conversation
  - emit a status update for UI visibility
  - do not auto-execute missed runs

### Optional frontend polish

File: `src/renderer/pages/cron/ScheduledTasksPage/TaskDetailPage.tsx`

- optional future button for delete/unbind skill
- not required for migration completion

## Phase 8 — Move `CronBusyGuard`

Status: completed

### Objective

Rename and relocate the busy guard so the codebase no longer implies it is cron-only.

### Frontend work

Move:

- `src/process/services/cron/CronBusyGuard.ts`

To a conversation/task-level location such as:

- `src/process/task/ConversationBusyGuard.ts`

Then update all imports.

### Acceptance criteria

- No cron-specific busy guard remains under cron services.
- Idle cleanup and turn-completion behavior remain unchanged.

## Validation Plan

### Frontend checks

After each frontend phase:

- `bun run lint:fix`
- `bun run format`
- `bunx tsc --noEmit`
- `bun run test`

If user-facing text changes:

- `bun run i18n:types`
- `node scripts/check-i18n.js`

### Backend checks

After each backend phase:

- `cargo test -p aionui-extension`
- `cargo test -p aionui-cron`
- `cargo test -p aionui-ai-agent`
- `cargo test -p aionui-conversation`
- `cargo test -p aionui-app cron_e2e -- --nocapture`

## End-to-End Acceptance Scenarios

### 1. Create via dialog

- create task
- view in list
- open detail
- edit
- delete

### 2. Create via chat

- agent emits cron create command
- backend persists job
- scheduled page refreshes through backend events

### 3. Update via chat

- agent emits cron update command
- existing task updates correctly

### 4. List via chat

- agent emits cron list command
- only conversation-scoped jobs are returned

### 5. Skill save lifecycle

- save skill
- reload UI
- verify `hasSkill`
- delete skill
- verify `hasSkill` becomes false

### 6. Run now

- trigger run-now
- receive `conversation_id` quickly
- navigate immediately
- observe async execution completion

### 7. Restart

- restart app after local scheduler removal
- cron tasks remain correct
- backend still drives behavior

### 8. Resume

- simulate missed trigger
- verify missed state and visible tips message
- verify no automatic re-execution

### 9. Skill suggest

- generate `SKILL_SUGGEST.md`
- receive `skill_suggest`
- save skill
- suppress duplicates

## Stop Conditions

Do not proceed to Phase 3 unless:

- frontend ACP fallback already uses backend HTTP for cron operations

Do not proceed to Phase 5 unless:

- backend middleware supports create/update/list/delete
- backend middleware is wired into real runtime
- conversation-scoped list semantics match frontend behavior
- raw cron tags are not leaking in visible chat UI

Do not proceed to Phase 6 unless:

- backend can emit `SkillSuggest` from real runtime

Do not proceed to Phase 8 unless:

- cron ownership migration is otherwise complete

## Summary

This final plan intentionally combines:

- the stronger implementation modules from the earlier detailed backend plan
- the safer migration order discovered during later review

The two most important corrections are:

- keep the frontend ACP cron fallback until backend runtime wiring is truly done
- move `CronBusyGuard` instead of deleting it

Any implementation plan that violates either rule should be treated as stale.
