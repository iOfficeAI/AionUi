# frontend-dev Handoff — E2E Helper Fix — 2026-04-22

**Branch:** `feat/backend-migration-e2e-skill-library`
**Tip SHA:** `aa8042fa3` (`docs(e2e): note aionui-backend must be on PATH for tests`)
**Predecessor report:** `docs/backend-migration/e2e-reports/2026-04-22-skill-library.md`
(0 PASS / 29 FAIL at `goToSkillsHub` timeout)

## Summary

The Skill-Library e2e suite was 29/29 FAIL with every test blocked in its
`beforeEach` at `[data-testid="my-skills-section"]` visibility. Two layered
causes were in play — a **stale renderer bundle** and **legacy-IPC helpers** —
plus a latent **PATH** issue that was masking backend connectivity. All three
are now resolved and a representative test (`TC-S-01`) passes in ~13.6s on
this branch.

## Commits (atomic)

| SHA | Scope |
| --- | --- |
| `cfdec9655` | `chore(e2e): gate trace retention behind E2E_TRACE env var` — opt-in trace capture for future diagnostics without noising CI. |
| `000676801` | `test(e2e/helpers): migrate skills helpers from legacy IPC to HTTP bridge` — new `tests/e2e/helpers/httpBridge.ts`, full rewrite of `skillsHub.ts`, fix to `edge-cases.e2e.ts` stale IPC key. |
| `aa8042fa3` | `docs(e2e): note aionui-backend must be on PATH for tests` — operational requirement surfaced by the diagnostic run. |

All commits pushed to origin.

## Root causes (evidence-based, per Playwright trace + screenshot)

### 1. Stale renderer bundle in `out/renderer/`

Trace stack (`.../out/renderer/assets/index-DQXhCJEQ.js`) revealed Electron
was loading `out/renderer/index.html` from **2026-04-21 16:52** — before the
HTTP-bridge migration landed. `bun run test:e2e` does **not** build; it loads
whatever bundle is on disk (per `tests/e2e/README.md` §1). The stale bundle
still used legacy IPC, never set `window.__backendPort`, and rendered
SkillsHub in an older layout where the `my-skills-section` element either
didn't exist or mounted differently.

**Fix:** `bunx electron-vite build` before running e2e. Documented in the
README update at `aa8042fa3`.

### 2. Legacy IPC in `tests/e2e/helpers/skillsHub.ts`

Commit `5c4b010f5` deleted `src/process/bridge/fsBridge.ts` and its
`subscribe-<key>` handlers. The helpers still emitted:
`list-available-skills`, `list-builtin-auto-skills`, `get-skill-paths`,
`detect-and-count-external-skills`, `import-skill-with-symlink`,
`delete-skill`, `add-custom-external-path`, `remove-custom-external-path`,
`get-custom-external-paths`. Each emit hit the 10s IPC timeout with no
receiver.

`goToSkillsHub`'s health check probed `get-skill-paths` up to 5 × 3s = 15s of
wasted time per test, compounding the proximate timeout.

**Fix (commit `000676801`):**

- Added `tests/e2e/helpers/httpBridge.ts` — a thin `page.evaluate`-based
  client that hits `http://127.0.0.1:<window.__backendPort>/api/skills/*` and
  unwraps the backend's `{ success, data, ... }` envelope, mirroring
  `src/common/adapter/httpBridge.ts:76`.
- Rewrote every skills helper against the HTTP routes defined in
  `src/common/adapter/ipcBridge.ts:268-363`:

  | Legacy key | HTTP route |
  | --- | --- |
  | `list-available-skills` | `GET /api/skills` |
  | `list-builtin-auto-skills` | `GET /api/skills/builtin-auto` |
  | `get-skill-paths` | `GET /api/skills/paths` |
  | `detect-and-count-external-skills` | `GET /api/skills/detect-external` |
  | `import-skill-with-symlink` | `POST /api/skills/import-symlink` |
  | `delete-skill` | `DELETE /api/skills/{skillName}` |
  | `add-custom-external-path` | `POST /api/skills/external-paths` |
  | `remove-custom-external-path` | `DELETE /api/skills/external-paths?path=...` |
  | `get-custom-external-paths` | `GET /api/skills/external-paths` |

- Preserved the `{ success: boolean; msg?: string }` return shape on
  mutation helpers so existing `expect(importResult.success).toBe(true)`
  assertions in test bodies keep working.
- Bumped `my-skills-section` visibility timeout from 5s → 15s to
  accommodate dev-mode cold boot (Vite dev + Arco Tabs + initial list
  render takes 6-10s after navigation).
- Fixed a bug in `tests/e2e/features/settings/skills/edge-cases.e2e.ts`:
  the `afterEach` invoked a non-existent IPC key `add-external-skill-source`
  (typo — it was never a real handler). Replaced with the canonical
  `addCustomExternalPath` helper.
- Re-exported `invokeBridge` from `skillsHub.ts` for backwards-compat so
  `tests/e2e/helpers/index.ts:50` continues to resolve.

### 3. `aionui-backend` binary not on PATH during tests

Step A's first rerun against the rebuilt bundle still hit `Failed to fetch
(127.0.0.1:13400)`. Diagnosis: `window.__backendPort` was `0`. The Electron
main process calls `backendManager.start()` at
`src/index.ts:467`, which calls `resolveBinaryPath()` at
`src/process/backend/binaryResolver.ts:23` — that tries `which
aionui-backend`. My shell did not have `~/.cargo/bin` on `PATH`, so the
resolver returned nothing, backend never started, port stayed at 0, and
every HTTP call fell through to the hardcoded fallback `13400` — which
nothing was listening on.

**Fix:** documented in `tests/e2e/README.md` §2. Operationally:
`export PATH="$HOME/.cargo/bin:$PATH"` before `bun run test:e2e`. This is
what the predecessor e2e-tester was implicitly doing (their shell had it).

## Step A trace evidence

Captured via `E2E_TRACE=1 bun run test:e2e tests/e2e/features/settings/skills/core-ui.e2e.ts --grep TC-S-01`.

- Trace zip: `tests/e2e/results/features-settings-skills-c-4f679-h-builtin-and-custom-skills/trace.zip`
  (not committed — transient).
- The failure screenshot showed `my-skills-section` DID render eventually
  ("我的技能 25" header visible at screenshot time `t=20.5s`), confirming
  the element was structurally fine in the rebuilt bundle.

## Step D verification

```bash
PATH="$HOME/.cargo/bin:$PATH" E2E_DEV=1 bun run test:e2e \
  tests/e2e/features/settings/skills/core-ui.e2e.ts --grep "TC-S-01" \
  --reporter=list
# ✓ 1 TC-S-01: should render My Skills section with builtin and custom skills (13.6s)
# 1 passed
```

A second single-test spot check (`TC-S-06`) revealed a **test-data issue
unrelated to the helpers**: the test asserts at least one builtin skill
exists in the fresh sandbox, which is environment-dependent. Routing that
to e2e-tester-2 per task scope — this handoff does NOT attempt to fix
test-body assertions.

## Known issues left for e2e-tester-2

1. **Full 29-test suite not run here.** Task scope explicitly reserves
   that for e2e-tester-2 ("do NOT invoke e2e suite yourself; e2e-tester-2
   retests"). Any downstream failures beyond `goToSkillsHub` are in the
   test bodies and predate this task.

2. **Pre-existing lint `no-await-in-loop` errors** in
   `cleanupTestSkills` (lines 483, 495). Not touched — pre-existed before
   my migration. Can be fixed with `Promise.allSettled` pass when someone
   is doing lint-cleanup work.

3. **`invokeBridge` still imported from `bridge.ts`** by non-skills
   helpers (`extensions.ts`, `chatGemini.ts`, `chatAionrs.ts`) — all
   out of scope for this task. Those will need the same migration in
   future waves.

4. **`out/renderer/` staleness is a recurring footgun.** Consider adding
   a mtime check at fixture startup (`fixtures.ts`) that warns if
   `out/renderer/index.html` is older than the most recent commit on
   `src/renderer/`. Defer.

## Quality checks on exit

- `bunx tsc --noEmit`: **clean** (no new errors).
- `bun run format` over touched files: **clean** (oxfmt applied).
- `bun run lint` over touched files: 9 warnings, 1 error — all
  pre-existing in `cleanupTestSkills` (confirmed via `git stash`).
- Single-test verification on this branch: **PASS** (TC-S-01, 13.6s).

## Pointer

Branch tip: `aa8042fa3`.
Next action is e2e-tester-2 re-running the full 29-test suite.

## Coordination notes

- e2e-tester-2 message sent at handoff with sha + one-line trace summary.
- Coordinator updated throughout (trace plan, trace findings, backend
  port discovery, final pass).
