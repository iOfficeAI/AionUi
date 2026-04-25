# Handoff — e2e-tester (T5) — Assistant User Data Migration

**Date:** 2026-04-23
**Owner:** e2e-tester (team `aionui-assistant-migration`)
**Task:** #8 (T5)
**Outcome:** Clean — 10/10 scenarios green, no Class D/F failures.
**Routing suggestion:** coordinator proceeds to T6.

## What was delivered

- `tests/e2e/features/assistants-user-data/assistant-user-data.e2e.ts`
  — 10 Playwright scenarios covering first-launch baseline, UI-driven
  CRUD, source-based edit rejection, built-in toggle persistence, and
  the three migration invariants (happy / retry / collision).
- `docs/backend-migration/e2e-reports/2026-04-23-assistant-user-data.md`
  — full report with per-scenario matrix, probe transcripts,
  classifications, and scope rationale.

## What I checked before declaring green

1. Two consecutive clean runs (20.2s → 20.4s → 16.1s total, all 10 green).
2. Final run was against backend `0a970ee` (H1 canonicalize + H2
   `include_dir` embed both applied). Had to force a rebuild
   (`touch crates/aionui-app/src/main.rs`) because `cargo build` didn't
   recompile on its own after `git pull`; flagged as a non-blocking
   follow-up.
3. Renderer freshly built via `bunx electron-vite build` before the run
   (noted Skill-Library pilot lesson about stale `out/renderer/index.html`).
4. `bunx tsc --noEmit` clean; `bun run lint` clean (0 warnings).

## Key scope decision (read before extending the suite)

The Playwright fixture in `tests/e2e/fixtures.ts` is **singleton per
worker** and boots Electron once. That rules out seeding a legacy
`aionui-config.txt` in `userData` before launch from inside the same
spec. Scenarios 8-10 therefore run against a **sibling
`aionui-backend` process** on port 25902 bound to a `mktemp` data-dir,
validating the `/api/assistants/import` contract end-to-end.

This split is intentional and covered by three layers:

| Layer                                                 | Owner           | Scope                                                  |
| ----------------------------------------------------- | --------------- | ------------------------------------------------------ |
| T4 Vitest (`tests/unit/migrateAssistants.test.ts`)    | frontend-tester | Renderer filter + rename + flag logic                  |
| T2 Rust (`crates/aionui-app/tests/assistants_e2e.rs`) | backend-tester  | Every HTTP handler                                     |
| T5 Playwright (this suite)                            | e2e-tester      | Real UI → backend glue + migration contract invariants |

If a future iteration needs an actual "cold Electron restart against
pre-seeded `userData`" test, it requires either splitting the singleton
fixture or a separate spec with its own launch path.

## Issues I hit and resolved (so the next runner doesn't re-hit)

1. **Health endpoint** — the backend's probe endpoint is
   `/api/system/info` (not `/api/system/version`). Used for the
   `waitForHealthy()` poll.
2. **`better-sqlite3` ABI mismatch** — Playwright worker uses Node 22
   (`NODE_MODULE_VERSION 141`) but the repo's `better-sqlite3` was
   built for Electron 36 (`NODE_MODULE_VERSION 136`). Swapped to
   `execFileSync('sqlite3', …)` using the system CLI.
3. **Backend-env leakage** — the singleton Electron fixture sets
   `AIONUI_EXTENSIONS_PATH`, `AIONUI_E2E_TEST`, `AIONUI_CDP_PORT`,
   etc. in `process.env`. The sibling backend inherits `process.env`
   in `spawn()`, which could drag in extension paths it shouldn't.
   Scrubbed those four keys explicitly before spawning.
4. **Cargo didn't rebuild after pull** — `cargo build --package aionui-app`
   reported 0 crates compiled after pulling H2. Force-rebuilt via
   touching a top-level `.rs` file.

## Files touched

| Path                                                                           | Action           |
| ------------------------------------------------------------------------------ | ---------------- |
| `tests/e2e/features/assistants-user-data/assistant-user-data.e2e.ts`           | New (~560 lines) |
| `docs/backend-migration/e2e-reports/2026-04-23-assistant-user-data.md`         | New              |
| `docs/backend-migration/handoffs/e2e-tester-assistant-user-data-2026-04-23.md` | New (this file)  |

No changes to existing helpers, fixtures, or production code.

## Outcome routing

Per plan §5.6:

> All green or only Class B/C/E → SendMessage coordinator `clean`, TaskUpdate completed

Class D = 0, Class F = 0, Class A = 0. Proceeding with that path.

## For the coordinator (T6)

- No re-engagement of backend-dev or frontend-dev needed.
- Both migration SHAs (`77e41b4` initial + `0a970ee` H2) are fully
  covered by the suite as of this run.
- One non-blocking follow-up: add `cargo clean -p aionui-app` (or a
  stronger rebuild trigger) to the "after pull" section of the backend
  workflow doc — saves the next runner from the `touch src/main.rs`
  workaround.
