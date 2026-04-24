---
module: provider-config
first_migrated: 2026-04-24
pilot: aionui-model-sync
---

# Module — Provider Config

Tracks the backend/frontend migration of model provider configuration
off the legacy local `model.config` key and onto `/api/providers/*`.

## Pilot log

### 2026-04-24 — Initial migration

- Backend spec: `specs/2026-04-24-model-config-backend-migration-design.md`
- Frontend spec: `specs/2026-04-24-model-config-frontend-migration-design.md`
- Plan: `plans/2026-04-24-model-config-migration-plan.md`
- Handoff: `handoffs/coordinator-model-config-2026-04-24.md`
- E2E report: `e2e-reports/2026-04-24-model-config-migration.md`

**Team**: coordinator + backend-dev + frontend-dev + frontend-tester.

**Work shipped**:

- Backend (`aionui-backend feat/model-sync-be → feat/builtin-skills`
  @ `d08255e`):
  - T1: CreateProviderRequest accepts optional id + per-model
    fields, plaintext api_key response.
  - T1b: Anonymous `POST /api/providers/fetch-models` endpoint.
  - T4: One-shot startup migration lifts legacy
    `client_preferences.model.config` JSON into the providers
    table (631 lines + 16 tests, idempotent, non-fatal failure).
- Frontend (`AionUi feat/model-sync-fe → feat/backend-migration-coordinator`
  @ `dc8b11754`): IProvider `model → models` + `lastCheck →
  last_check`; ipcBridge.mode rewritten to single-provider CRUD;
  `model.config` removed from ConfigKeyMap + legacy migration; ~30
  consumer sites rewired; 29 new Vitest tests.

**Outcome verification**:

- `GET /api/settings/client` no longer leaks IProvider array.
- Provider CRUD round-trips through the real schema.
- Zero Vitest regressions vs pre-pilot baseline (421/4377 → 425/4406).
- Coordinator live probe passes: POST → round-trip → restart persistence.

## Lessons added to playbook

### 2026-04-24 — Mid-stream arbitration flips must explicitly void the prior answer

**Symptom**: Coordinator initially ruled "strict UUID validation" for
provider id, then within 3 minutes flipped to "lenient (1..=128 chars
+ charset)" based on backend-dev's finding that frontend `uuid()`
returns 8-char hex by default. Spec fix `2a63132` pushed. Coordinator
sent a new arbitration message.

Backend-dev then spent ~4 rounds re-confirming whether the lenient
impl should stay or revert to strict. His inbox held BOTH arbitration
messages. Without an explicit "IGNORE PREVIOUS" marker he couldn't
tell which was authoritative just from chronological order.

**Fix (playbook rule)**: When flipping a decision mid-stream, always:

1. Prefix the new message with `**SUPERSEDES earlier "X" arbitration.
   That directive is void.**` — explicit, not just implied by
   timestamp order.
2. If the earlier message is still in the teammate's inbox, follow up
   with a tiny "disregard stale message" nudge.
3. In the diff or spec commit, note "flips prior ruling".

Applies to both teammate and user-flip scenarios.

### 2026-04-24 — Zombie can die with clean intermediate state; replacement inherits cleanly

**Symptom**: frontend-tester went silent at 16:38 after writing 4
test files (~949 lines) — messages unread, no commits, no replies for
11+ minutes.

**Diagnosis**: standard zombie criteria met (playbook top), executed
autonomous replacement.

**Outcome**: replacement agent ran each of the 4 files — ALL GREEN.
Zombie had actually completed the writing work but died between
"files saved" and "commit + report". Replacement picked up the dirty
worktree and proceeded cleanly, finishing T2.5 in one extra session.

**Playbook addition**: the replacement prompt should explicitly
instruct "prior agent's dirty worktree files may be complete, may be
half-done, or may be wrong — your first action is to MEASURE before
deciding to delete or continue". Prevents the instinct to
`git stash drop` and restart, which in this case would have wasted
the zombie's ~30 min of work.

### 2026-04-24 — "Pre-launch, no migration" is ambiguous — verify user's own dev state

**Symptom**: Initial pilot closed cleanly on all gates. User booted
backend against their real dev DB, reported `/api/providers` empty.
Root cause: 4 legacy providers still sitting in `client_preferences.
model.config`, untouched. My scope decision at pilot start: "user
said no migration → skip it entirely". Wrong interpretation.

**Why I got it wrong**: "pre-launch" ambiguous between
(a) "no production rollout concerns, no need to handle v1-to-v2
    drift across N user installs",
(b) "my own dev state is disposable, greenfield is fine".
User meant (a). I assumed (b). The gap costs a full re-pilot day
(T4 added after closure, plus re-merge, plus re-handoff update).

**Fix (playbook rule)**: When scoping any "pre-launch, no migration"
task, ALWAYS verify:
1. `sqlite3 <user-data-dir>/aionui.db "SELECT COUNT(*) FROM
   <relevant_table>;"` — is the relevant table actually empty in
   user's dev env?
2. If non-empty: ask explicitly "do you want your existing dev data
   migrated, or are you OK losing it?". Don't infer.
3. Record the answer in the spec, so it's reviewable later.

This turns "no migration needed" into a verifiable claim instead of
a coordinator inference.

### 2026-04-24 — Sandbox smoke must match frontend's data-dir layout

**Symptom**: First attempt to end-to-end verify T4 on a copy of
user's real DB showed migration didn't fire. I had `cp` to
`<sandbox>/aionui/aionui.db` (matching user disk layout) and
launched backend with `--data-dir <sandbox>` — backend then
opened `<sandbox>/aionui.db` (a different DB, empty) and correctly
found no migration to do.

Frontend actually passes `<userData>/aionui` as `--data-dir` via
`getDataPath()` in `src/process/utils/utils.ts`. Backend opens
`<data-dir>/aionui.db`. So user data lives at
`<userData>/aionui/aionui.db` and the correct sandbox is
`<sandbox>/aionui.db` directly under `--data-dir`.

**Fix**: When building a sandbox for real-DB smoke testing, match
the call site's `--data-dir` construction, not the physical disk
layout. Source the exact argument line from the consumer
(here: `lifecycleManager.ts:21`, `['--port', ..., '--data-dir',
config.dbPath]` with `dbPath = getDataPath()` = `<userData>/aionui`).

### 2026-04-24 — Coordinator smoke suite selection must match migration surface

**Symptom**: coordinator suggested running `tests/e2e/features/settings/skills/core-ui.e2e.ts`
as a "light settings smoke" after model-selection scenario. User
flagged: that suite is Skills Hub Settings, has zero overlap with
Model Settings. Pure coverage-irrelevant burn.

**Fix (playbook rule)**: when recommending smoke suites at closure,
grep for the migration's touch points FIRST:
- `grep -l <migrated-module-name>` across tests/e2e/
- Only suites whose source references the migrated symbol(s) are
  valid coverage.
- If no direct suite exists, document that as a gap — do NOT
  substitute an unrelated suite.
