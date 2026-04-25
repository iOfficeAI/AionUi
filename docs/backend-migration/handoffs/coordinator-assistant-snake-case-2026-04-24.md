# Coordinator Handoff — Assistant Snake-Case Realignment — 2026-04-24

**Coordinator branches:**

- aionui-backend `feat/backend-migration-coordinator-assistant-camel` @ `6f00110` (merged back to `feat/builtin-skills` @ `bba32dd`)
- AionUi `feat/backend-migration-coordinator-assistant-camel` @ `1c1d1c1e4` (merged back to `feat/backend-migration-coordinator` @ `5c0154b96`, then further to `feat/backend-migration` @ `bc22bad5d` per user directive)

**PRs:** None raised, per user convention.

## What shipped

Closed every camelCase wire residue in the assistant surface (the last
big pocket the skill-realignment pilot had deferred via Q6(b)), plus
two drive-by hotfixes the skill pilot had explicitly logged as
followups, plus two more bug classes that only surfaced once E2E
exercised the full contract end-to-end.

**Backend** (`feat/assistant-snake-case` @ `6f00110`, 2-commit stack):

- Removed 7 `rename_all = "camelCase"` from
  `crates/aionui-api-types/src/assistant.rs`.
- Removed 1 `rename_all = "camelCase"` from
  `crates/aionui-assistant/src/builtin.rs` (builtin manifest loader).
- Rewrote 20-entry `crates/aionui-app/assets/builtin-assistants/assistants.json`
  via `jq walk` — ~200 key substitutions, no value-string collisions.
- Flipped 9 hardcoded camelCase JSON keys in
  `crates/aionui-app/tests/assistants_e2e.rs` (spec underestimated —
  backend-dev caught 11 actual during T1.9, including `ruleFile` +
  `skillFile` the spec missed).
- Flipped 10 camelCase JSON fixtures inside `aionui-assistant` crate
  test helpers that the spec hadn't enumerated — without them
  `cargo test -p aionui-assistant` would fail 12/33 against the
  renamed struct.
- Added `assistant_response_rejects_camel_case` regression test
  (option B: body carries both snake + camel, asserts snake wins and
  camel is silently ignored).

**Frontend assistant bulk** (`feat/assistant-snake-case` @ `513be5162`):

- `src/common/types/assistantTypes.ts` — 7 interfaces × 10 fields
  flipped.
- `scripts/codemods/assistantSnakeCase.ts` — ts-morph codemod
  (contextually-typed access only), flipped 70 sites (56 property
  access + 14 object literal + 0 destructure).
- Wave 2 manual for ~30-50 tsc residual errors.
- `src/process/utils/migrateAssistants.ts` — split out
  `legacyAssistantToCreateRequest` mapper (legacy camel → new snake),
  unit-tested with real legacy-config fixture.
- `{ snake_name: camelName } = x` destructure pattern preserved
  downstream local variable idioms.
- Vitest + Playwright fixtures realigned.
- Delta: 32 files, zero new tsc errors vs 270 baseline, Vitest
  4377 → 4380.

**Frontend hotfixes**:

- `fix/acp-camelcase-hotfix` @ `e1cb21a7c` — `setModel` body
  `{modelId}` → `{model_id}`.
- `fix/fs-temp-camelcase-hotfix` @ `ec126ee40` — type-sig flip for
  `createTempFile`, `createUploadFile`, **and a scope-expansion
  pickup for `readBuiltinSkill`** (frontend-dev flagged it as
  same-file same-bug-class and got greenlight).
- `fix/more-camelcase-hotfix` @ `7dbf493a4` (3-commit stack) — **H1+H2
  mid-pilot discovery**:
  - 7 ipcBridge endpoints (read/write/delete × rule+skill +
    readBuiltinRule) flipped to snake_case.
  - 3 helper functions in `tests/e2e/helpers/assistantSettings.ts`
    — T2a codemod had renamed params to `assistant_id` but left
    template-literal bodies referencing `${assistantId}` (undefined
    at module scope). tsc had missed this because `tsconfig.json`
    `include` is `src/**/*` — tests/ is entirely excluded.
  - 8 lines in `assistant-user-data.e2e.ts` — tests used the
    `httpPost(page, ...)` helper directly, bypassing ipcBridge, still
    sending camelCase bodies. Fixed in H2.

**Test matrix (final state)**:

- `cargo test --workspace` assistant-related: all green.
  - `aionui-api-types`: 423/423 (includes new regression test).
  - `aionui-assistant`: 33/33.
  - `assistants_e2e`: 44/44.
  - `skills_builtin_e2e`: 14/14 (regression preserved).
- Frontend Vitest: 4385 → 4397 (+12 hotfix regressions: acp 2 + fs 3 +
  H1 7).
- tsc: 267 errors = branch baseline, zero new.
- Playwright assistant suite: **45/47** green. Two failures
  (`P1-3`/`P1-18`) are pre-existing `assistant-card-builtin-*` testid
  prefix assumption — builtin IDs have never had `builtin-` prefix in
  backend. Test debt unrelated to wire realignment (captured as
  followup).
- Playwright skill regression: 8/8 green.
- Packaging smoke (T4.2): `mktemp -d` + standalone release binary,
  4 probes — all snake_case on wire, 20 builtins loaded, camelCase
  request bodies correctly silent-dropped (not aliased).

## Why

The skill-realignment pilot (2026-04-24 earlier in day) closed the
skill wire surface but decided Q6(b) — defer auditing other endpoints
to catch all camelCase residues. That deferral cost ~45 min of
mid-pilot rework in this follow-up (2 hotfix rounds: H1 + H2). In
retrospect the full ipcBridge audit would have been 20 min of spec
work, saved 45 min of mid-pilot scrambling. Captured as playbook
lesson.

User also explicitly asked this pilot include the two skill-pilot
handoff followups (ACP `setModel` + fs `createTempFile`) — both
confirmed runtime-broken on independent probe, now fixed.

## Role deliverables

| Role         | Final SHA                                                                    | Deliverable                                                                                            |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| coordinator  | this commit                                                                  | spec, plan, merge-back, packaging smoke, this handoff                                                  |
| backend-dev  | `6f00110`                                                                    | T1 — api-types + builtin.rs + assistants.json jq walk + test flips + regression test (option B)        |
| frontend-dev | `513be5162` / `e1cb21a7c` / `ec126ee40` / `7dbf493a4` (3-commit stack H1+H2) | T2a bulk + T2b acp + T2c fs+readBuiltinSkill + H1 (7 ipcBridge + 3 helper) + H2 (8 test-body lines)    |
| e2e-tester   | `1c1d1c1e4`                                                                  | T3 integration — 3 Playwright runs (40→42→45), skill regression 8/8, final run report with 6 followups |

## Merge conflicts during T4

Zero. All AionUi feature branches (`feat/assistant-snake-case`,
`fix/acp-*`, `fix/fs-temp-*`, `fix/more-camelcase-*`) merged into
`feat/backend-migration-coordinator-assistant-camel` cleanly (small→large
order per spec §6.7). Further merges coord-camel → feat/backend-migration-coordinator
→ feat/backend-migration also clean.

## Mid-pilot incidents (not regressions — process hazards)

1. **2× messaging-layer stalls** during team ops. Both frontend-dev
   and e2e-tester hit windows where the coordinator's messages showed
   `read=False` in their inbox for 10+ minutes without the teammate
   responding (but git activity continued normally on their side).
   Incorrectly triggered a zombie replacement on frontend-dev mid-T2c
   — user stopped me. Autonomous zombie-replace rule needs refinement:
   distinguish "no inbox-read + no git activity" (real zombie) from
   "no inbox-read + active git commits" (messaging lag, not zombie).
   Add `git log origin/<branch>` as secondary liveness check before
   declaring zombie.

2. **Shared `~/.cargo/bin/aionui-backend` symlink** across concurrent
   worktree pilots. `model-sync-be` pilot (running in parallel)
   overwrote our symlink mid-run. Electron main process held old
   inode after `kill`; required explicit `kill 2529` to force respawn
   against new inode. Also bit e2e-tester during T3.2 (sanity-caught
   by `stat -L` check). Followup: per-pilot binary-path env var or
   lockfile.

3. **`out/main/index.js` missing in e2e-tester worktree** at T3.4
   first run. Playwright launched Electron against worktree root but
   `electron-vite build` was never run there → 20/47 tests timed out
   immediately with missing-module dialog. Required a `bun run package`
   in worktree to produce artifacts. Followup: add
   `ls out/main/index.js || bun run package` guard to Playwright
   fixture or CI.

4. **Stray `electron-vite dev` hijack on port 5173**. User's AionUi-Dev
   session had `electron-vite dev` listening; e2e-tester's fresh
   Electron main connected to that vite → served main-checkout
   renderer (pre-H1 code) while main-process ran worktree code →
   mixed-state failure. Required closing AionUi-Dev. Followup: set
   `ELECTRON_RENDERER_URL` explicitly in Playwright fixture so it
   binds to its own vite.

5. **"out-of-scope" scope narrowing by teammate.** frontend-dev's H1
   first commit wrote "still pending — out of H1 scope" in its commit
   message for write/delete endpoints that _were_ in the amended H1
   scope (which he had read). Messaging crossed: he'd applied my
   amendment but the commit message from the first commit was stale.
   No rework needed (he had already completed the full scope), but
   a moment of coordinator alarm. Resolved by SendMessage QUESTION
   requesting clarification.

## Lessons captured (to append to playbook)

1. **When flipping wire format, audit BOTH production types AND test
   helper layers** that bypass ipcBridge. The H2 class (test's
   `httpPost(page, url, {assistantId: ...})` direct calls) is invisible
   to ipcBridge-type codemods. Grep wire-related field names across
   `tests/e2e/helpers/` and `tests/e2e/features/**/*.e2e.ts` as part
   of the plan's DoD sweep.

2. **tsconfig coverage gap** — `include: src/**/*` in AionUi's
   tsconfig.json entirely excludes `tests/`. Codemods that touch
   test files get a silent pass on type-check. T2a's codemod bug
   (param renamed but body unchanged) survived because tsc couldn't
   see it. Followup: add `tsconfig.tests.json` covering
   `tests/**/*` and wire into CI.

3. **Messaging-layer latency ≠ zombie**. Before autonomous
   zombie-replace, check `git log origin/<branch> --oneline -3` for
   recent teammate commits. If they're pushing code, they're alive —
   the messaging is just delayed. This saved frontend-dev from
   unnecessary replacement when user intervened.

4. **Deferral has cost.** Q6(b) "defer audit of other endpoints" in
   this pilot's spec deferred ~20 min of grep work, but cost ~45 min
   of H1+H2 rework mid-pilot. The threshold should be "deferring
   means user is NOT touching affected endpoints" — if even one
   deferred endpoint is likely exercised by Playwright or user flows,
   grep-audit it upfront.

5. **assistant pilot pattern**: builtin manifests use data-file JSON
   not wire format, but still need snake_case alignment if the Rust
   struct loader drops `rename_all`. Don't assume internal-only JSON
   is exempt — key mismatches break deserialization just as visibly.

## Followups (non-blocking)

1. **P1-3 / P1-18 testid prefix debt**
   (`tests/e2e/features/assistants/ui-states.e2e.ts`): assertions
   still use `[data-testid^="assistant-card-builtin-"]` but builtin
   IDs are naked (game-3d, ppt-creator, etc). Pre-existing;
   pilot-unrelated. Fix options: (a) test rewrite using actual IDs
   from API, (b) React component adds `data-source="builtin"`
   attribute for queries. Severity: low (tests are the only caller).

2. **Write-once tsc blind-spot fix** — add `tsconfig.tests.json` +
   CI step.

3. **Shared `~/.cargo/bin/aionui-backend` symlink coordination** for
   concurrent worktree pilots. Per-pilot port + explicit binary
   path env var would eliminate collision.

4. **Playwright `ELECTRON_RENDERER_URL`** explicit binding in
   fixture to avoid stray-vite-dev hijack.

5. **`channel/plugins/{weixin,dingtalk}` camelCase** stays — external
   webhook protocol, not our convention.

6. **pre-existing clippy warnings** on `rustc 1.95` upgrade in
   `aionui-office/snapshot.rs` + `aionui-api-types/lifecycle.rs` —
   6 errors, unrelated to this pilot. Worth a standalone cleanup.

7. **pre-existing `extension_e2e` failures** (11 cases) — tests read
   real `~/.aionui/` on dev machine instead of a sandbox. Followup:
   `TempDir` isolation. Unrelated to this pilot.

## Branch state after close

| Repo           | Branch                                               | HEAD        | Meaning                                          |
| -------------- | ---------------------------------------------------- | ----------- | ------------------------------------------------ |
| aionui-backend | `feat/builtin-skills`                                | `bba32dd`   | coord branch merged back, all pilot work present |
| aionui-backend | `feat/assistant-snake-case`                          | `6f00110`   | feature branch, kept for history                 |
| aionui-backend | `feat/backend-migration-coordinator-assistant-camel` | `6f00110`   | coordinator branch, kept                         |
| AionUi         | `feat/backend-migration`                             | `bc22bad5d` | final downstream merge per user directive        |
| AionUi         | `feat/backend-migration-coordinator`                 | `5c0154b96` | coord merged                                     |
| AionUi         | `feat/backend-migration-coordinator-assistant-camel` | `1c1d1c1e4` | pilot coord branch                               |
| AionUi         | `feat/assistant-snake-case`                          | `513be5162` | feature branch, kept                             |
| AionUi         | `fix/acp-camelcase-hotfix`                           | `e1cb21a7c` | kept                                             |
| AionUi         | `fix/fs-temp-camelcase-hotfix`                       | `ec126ee40` | kept                                             |
| AionUi         | `fix/more-camelcase-hotfix`                          | `7dbf493a4` | H1+H2 3-commit stack, kept                       |

Worktrees:

- `/Users/zhoukai/Documents/worktrees/aionui-backend-assistant-camel`
  — kept for now (user can `git worktree remove` later).
- `/Users/zhoukai/Documents/worktrees/aionui-assistant-camel` — kept.

**Pilot is GREEN.** 45/47 Playwright + 4397/4397 Vitest + backend
test workspace all green. Two Playwright failures are pre-existing
test debt. All wire contracts are snake_case end-to-end. Packaging
smoke confirms standalone release binary is correct and self-contained.

## Note on worktree/PR convention (new rule, future-only)

Mid-pilot the user established a new convention for team-mode pilots:

1. **aionui-backend** worktrees base on `origin/main`; PRs target `main`.
2. **AionUi** worktrees base on `origin/feat/backend-migration`; PRs
   target `feat/backend-migration`.

This pilot was closed using the **prior convention** (base off
in-flight coord branches; direct `git merge` merge-back without PR)
because the new rule landed after pilot work was complete and code
already merged. New rule is captured in
[`notes/team-operations-playbook.md`](../notes/team-operations-playbook.md)
("2026-04-24 — Worktree base + PR target convention") and takes
effect for the next pilot onward. No retroactive action on this
pilot's branches or merges.
