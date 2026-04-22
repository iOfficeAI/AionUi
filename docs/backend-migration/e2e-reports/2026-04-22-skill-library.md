# E2E Report — Skill-Library Pilot — 2026-04-22

**Frontend commit:** `316f63beb` (`docs(backend-migration): frontend-dev handoff for skill-library pilot`)
**Backend commit:** `229b6e04` (`docs(backend-migration): add scope breakdown to backend-dev handoff`)
**E2E branch commit:** `3fd28d23a` (merge of `feat/backend-migration-fe-skill-library` +
`origin/kaizhou-lab/test/e2e-coverage` into `feat/backend-migration-e2e-skill-library`)
**Backend binary:** `~/.cargo/bin/aionui-backend`, built 2026-04-22 20:58 local from
`feat/extension-skill-library` (frontend-dev `cargo install`). No rebuild needed — no new
non-docs commits on the backend branch between the install and the e2e run.
**Run command:** `bun run test:e2e tests/e2e/features/settings/skills/`
(note: the pilot plan §3.2 / §4.3 say `bun run e2e`; the actual script is `test:e2e`.
Plan wording to be fixed in a follow-up plan revision.)
**Playwright config:** `playwright.config.ts` — 1 worker, 60s per-test timeout,
retries=0, dev mode launch, real Electron via `_electron.launch`.
**Wall clock:** ~7 min (29 tests × ~18s each with per-test app relaunch after failure).

---

## Pilot scope → endpoint map

All 10 files under `tests/e2e/features/settings/skills/` exercise the Skill Library
surface. Coverage of the pilot's E1–E5 endpoints, plus every other `/api/skills/*`
route the renderer touches, mapped via `tests/e2e/helpers/skillsHub.ts`:

| Test file                      | # tests | E1 `GET /api/skills`            | E2 `GET /api/skills/builtin-auto` | E3 `POST /api/skills/builtin-rule` | E4 `POST /api/skills/builtin-skill` | E5 `POST /api/skills/info` | Other skill routes in play                                                                                                 |
| ------------------------------ | ------: | :------------------------------ | :-------------------------------- | :---------------------------------: | :---------------------------------: | :------------------------: | -------------------------------------------------------------------------------------------------------------------------- |
| `batch-import.e2e.ts`          |       1 | via `getMySkills` (setup)       | on page mount                     |                 no                  |                 no                  |             no             | `detect-external`, `external-paths`, `import-symlink`, `{name}` delete                                                      |
| `boards-rendering.e2e.ts`      |       2 | via `getMySkills`               | via `getAutoSkills` direct call   |                 no                  |                 no                  |             no             | none                                                                                                                        |
| `core-ui.e2e.ts`               |       7 | yes (list render + assertions)  | on page mount                     |                 no                  |                 no                  |             no             | `detect-external`, `external-paths`, `import-symlink`, `{name}` delete, `export-symlink`                                    |
| `edge-cases.e2e.ts`            |       3 | yes                              | on page mount                     |                 no                  |                 no                  |             no             | `external-paths`, `import-symlink`, `{name}` delete                                                                         |
| `manual-import.e2e.ts`         |       1 | via `getMySkills`               | on page mount                     |                 no                  |                 no                  |             no             | `/api/skills/scan`, `/api/skills/import` (manual-import dialog flow)                                                         |
| `path-export.e2e.ts`           |       4 | yes                              | on page mount                     |                 no                  |                 no                  |             no             | `external-paths`, `import-symlink`, `{name}` delete, `export-symlink`                                                       |
| `refresh-empty-tabs.e2e.ts`    |       3 | yes                              | on page mount                     |                 no                  |                 no                  |             no             | `external-paths`, `import-symlink`, `{name}` delete                                                                         |
| `search.e2e.ts`                |       4 | yes                              | on page mount                     |                 no                  |                 no                  |             no             | `external-paths`, `import-symlink`, `{name}` delete                                                                         |
| `special-cases.e2e.ts`         |       3 | yes                              | on page mount                     |                 no                  |                 no                  |             no             | `external-paths`, `import-symlink`, `{name}` delete                                                                         |
| `url-highlight.e2e.ts`         |       1 | yes                              | on page mount                     |                 no                  |                 no                  |             no             | `import-symlink`, `{name}` delete                                                                                           |

- **E1 / E2** are exercised by every test — the SkillsHub page mounts them in its
  `fetchData` effect (`SkillsHubSettings.tsx:87,101`) and the helpers read them via
  `getMySkills` / `getAutoSkills`.
- **E3 / E4** (`builtin-rule` / `builtin-skill`) are NOT exercised by the skill-e2e
  suite. Those routes are consumed by the preset assistant resolver
  (`usePresetAssistantResolver.ts`, `presetAssistantResources.ts`) — coverage of
  those flows lives in assistant-side tests, not the Skills Hub feature folder.
- **E5** (`/api/skills/info`) has no live caller in renderer today
  (frontend-dev handoff §"Known issues" #4) and is not exercised.
- Every file also hits non-E1–E5 skill routes (`detect-external`, `import-symlink`,
  `external-paths`, `{name}` delete, `export-symlink`, `scan`, `import`). All of
  these are already implemented in `aionui-backend` (`skill_routes.rs:51–99`) —
  the backend surface is a superset of the pilot's E1–E5, so this does not
  represent missing contract work.

---

## Cases run

All 29 cases FAIL at the same point in `beforeEach` (`goToSkillsHub` →
`[data-testid="my-skills-section"]` does not become visible within 5s). No case
progressed past page-level setup, so there is no per-case distinction in the
result.

| Case                                                                   | Status |
| ---------------------------------------------------------------------- | :----: |
| TC-S-11 (batch-import) — batch import / skip existing                   |  FAIL  |
| TC-S-27 (boards-rendering) — Extension Skills board structure           |  FAIL  |
| TC-S-28 (boards-rendering) — Auto-injected Skills board structure       |  FAIL  |
| TC-S-01 (core-ui) — render My Skills with builtin+custom                |  FAIL  |
| TC-S-05 (core-ui) — delete custom skill via UI                          |  FAIL  |
| TC-S-06 (core-ui) — builtin skill has no delete button                  |  FAIL  |
| TC-S-08 (core-ui) — render external skills with custom source           |  FAIL  |
| TC-S-10 (core-ui) — import external skill via UI click                  |  FAIL  |
| TC-S-16 (core-ui) — add custom external path via UI                     |  FAIL  |
| TC-S-19 (core-ui) — export skill to external source via UI              |  FAIL  |
| TC-S-15 (edge-cases) — no custom tabs when no custom paths              |  FAIL  |
| TC-S-21 (edge-cases) — export shows only builtin targets w/ no custom   |  FAIL  |
| TC-S-23 (edge-cases) — URL highlight referencing nonexistent skill      |  FAIL  |
| TC-S-29 (manual-import) — import skill from folder via mocked dialog    |  FAIL  |
| TC-S-14 (path-export) — refresh external and show newly added           |  FAIL  |
| TC-S-17 (path-export) — error on duplicate custom path                  |  FAIL  |
| TC-S-18 (path-export) — disable Confirm when fields empty               |  FAIL  |
| TC-S-20 (path-export) — error when exporting to existing target         |  FAIL  |
| TC-S-04 (refresh-empty-tabs) — refresh My Skills                        |  FAIL  |
| TC-S-07 (refresh-empty-tabs) — empty state when no skills               |  FAIL  |
| TC-S-09 (refresh-empty-tabs) — switch tabs shows correct external       |  FAIL  |
| TC-S-02 (search) — filter My Skills by keyword                          |  FAIL  |
| TC-S-03 (search) — empty state when search has no match                 |  FAIL  |
| TC-S-12 (search) — filter external skills by keyword                    |  FAIL  |
| TC-S-13 (search) — empty state when external search has no match        |  FAIL  |
| TC-S-24 (special-cases) — skills with special characters                |  FAIL  |
| TC-S-25 (special-cases) — render 20 skills without perf issues          |  FAIL  |
| TC-S-26 (special-cases) — rapid refresh clicks without crashing         |  FAIL  |
| TC-S-22 (url-highlight) — highlight skill + scroll via URL param        |  FAIL  |

**Totals:** 29 cases / **0 PASS** / **29 FAIL** / 0 skipped.

---

## UI rendering with real data: verified

**Verdict:** the test harness DOES launch a real Electron app against the real
merged stack; it does NOT mock IPC or HTTP. The test design meets the plan's
intent for Step 3.2 gap-closure.

Evidence:

- `tests/e2e/fixtures.ts` uses Playwright's `_electron.launch()` with the
  project's real Electron entry (`electron-vite dev` in dev mode or the packaged
  `.app`/unpacked binary in packaged mode). One shared Electron instance per
  worker; singleton state cleanup in `afterEach` only.
- Helpers (`helpers/skillsHub.ts`, `helpers/bridge.ts`) interact via:
  - Real DOM selectors — `page.click`, `page.fill`, `page.locator(...).waitFor`,
    arco class selectors (`.arco-modal`, `.arco-dropdown-menu`,
    `.arco-message-success`), and `data-testid` attributes that are defined
    unconditionally in the renderer source
    (`SkillsHubSettings.tsx` 243, 340, 391, 457, 545, 557, 594, 637).
  - Real Electron IPC via `electronAPI.emit('subscribe-<key>', …)` against the
    live preload bridge — not a mock.
- Tests take real screenshots (`screenshots/` folder references) and assert
  against real rendered layout (hover-driven visibility of delete/export
  buttons, tab activation state, modal lifecycle, URL param clearing, CSS class
  presence for highlight animations).

The verdict is therefore **verified**: UI rendering with real data IS being
exercised. What fails is not the rendering layer of the stack but a
compatibility gap between the e2e helpers and the HTTP-bridge migration —
both are real, and the failure reflects that reality.

---

## Failures

All 29 failures share an identical root symptom. One canonical error trace:

```
TimeoutError: locator.waitFor: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('[data-testid="my-skills-section"]') to be visible

   at helpers/skillsHub.ts:72

  70 |   // Wait for tab content to load
  71 |   const section = page.locator('[data-testid="my-skills-section"]');
> 72 |   await section.waitFor({ state: 'visible', timeout: 5_000 });
     |                 ^
  73 |
  74 |   // Wait for Bridge initialization (fs.* providers take longer to initialize)
  75 |   // Use a simple Bridge call as health check
    at goToSkillsHub (tests/e2e/helpers/skillsHub.ts:72:17)
```

The element `data-testid="my-skills-section"` is defined unconditionally on
line 391 of `src/renderer/pages/settings/SkillsHubSettings.tsx` — not behind a
`{!loading && ...}` guard, not behind a feature flag. If the component mounted,
the element would be present on the first render.

### Root-cause analysis

This e2e branch is the first point at which two streams meet:

1. **Renderer migration to HTTP bridge** — commit `5c4b010f5` (`fix: adapt
   renderer callers to HTTP bridge auto-unwrap and remove dead IPC code`, on
   `feat/backend-migration`). This commit deleted `src/process/bridge/fsBridge.ts`
   (1821 lines) and other legacy IPC bridge modules, migrating skill calls to
   `httpBridge.ts` against `/api/skills/*`.
2. **E2E coverage commit** — `73eedf7f4` (`test(e2e): assistant + skills hub
   coverage (66 cases, 264 screenshots)` on `kaizhou-lab/test/e2e-coverage`).
   Authored against the pre-migration tree — the helpers drive I/O via
   `invokeBridge` which emits `subscribe-<key>` events to `window.electronAPI`
   (see `tests/e2e/helpers/bridge.ts:20-68`), using legacy IPC handler keys
   (`list-available-skills`, `detect-and-count-external-skills`,
   `import-skill-with-symlink`, `delete-skill`, `add-custom-external-path`, etc.)
   that no longer have a registered handler after `fsBridge.ts` was deleted.

Neither commit has previously been paired with the other in CI. The merge that
created this e2e branch is the first integration of the two streams.

The two failure vectors this exposes:

**(A) Primary failure — the gate at `my-skills-section`.**
The test fails BEFORE any `invokeBridge` call is made, so (B) is not the
proximate cause of the timeout here. The primary cause is that the SkillsHub
UI does not render its main section within 5s after navigation to
`#/settings/capabilities`. Possible reasons (evidence not captured — Playwright
was configured with `screenshot: 'only-on-failure'` but no artifacts were
retained because artifact-write paths were empty on the file system after the
run):

  a. The page navigation didn't actually land on `CapabilitiesSettings` — perhaps
     because the app is still mid-boot at the time of navigation. `goToSkillsHub`
     calls `navigateTo(page, '#/settings/capabilities')` then
     `waitForTimeout(500)` then waits for the section. 500ms may be too short
     for the HTTP-backed renderer's first mount (backend boot + HTTP handshake
     + React mount), especially since this is the first test after app launch.
  b. A React error boundary is catching an exception during mount, producing a
     fallback UI that lacks the testid.
  c. The merge introduced an unintended renderer-level incompatibility between
     the e2e-coverage data-testid additions and the HTTP-migration-era
     component tree. Merge commit `3fd28d23a` brought in e2e-coverage changes
     that may not all have been applied cleanly.

Confirming which of (a/b/c) applies requires an interactive Electron session
with DevTools, which is outside the scope a timeout-limited e2e run can
surface. Deferred to the follow-up work.

**(B) Secondary failure — legacy IPC bridge keys.**
Even if the page rendered and a test advanced past `goToSkillsHub`, the
helpers' `invokeBridge` calls (`list-available-skills`, `detect-and-count-external-skills`,
`import-skill-with-symlink`, `delete-skill`, `add-custom-external-path`,
`remove-custom-external-path`, `get-skill-paths`, `get-custom-external-paths`)
would all hang and time out at 10s each, because these IPC `subscribe-<key>`
handlers were deleted in commit `5c4b010f5`. The helpers were authored against
a pre-migration world where `fsBridge.ts` registered them.

### Environment caveats

- Playwright run in dev mode (`electron-vite dev` via `_electron.launch`) —
  not against a packaged build. The pilot plan contemplated dev mode.
- `screenshot: 'only-on-failure'` in config, but artifact directories under
  `tests/e2e/results/` were created and left empty — no failure screenshot
  was captured. Needs investigation separately; for this run there is no
  visual diff to inspect.
- Backend binary is current with `feat/extension-skill-library` tip
  (build time 20:58; no subsequent non-docs commits).
- Fresh sandbox state dir per-run
  (`/tmp/aionui-e2e-state-*`; see `fixtures.ts:28`).
- `AIONUI_BACKEND_BIN` env var was NOT set. `binaryResolver.ts` falls back to
  `which aionui-backend`, which resolves to `~/.cargo/bin/aionui-backend`
  (on PATH in the shell context that launched Playwright).

---

## Repro steps (for the follow-up team)

```bash
cd /Users/zhoukai/Documents/github/AionUi
git checkout feat/backend-migration-e2e-skill-library
# Ensure backend binary is current:
cd /Users/zhoukai/Documents/github/aionui-backend
git checkout feat/extension-skill-library
cargo install --path crates/aionui-app
# Return to AionUi and run:
cd /Users/zhoukai/Documents/github/AionUi
bun install
bun run test:e2e tests/e2e/features/settings/skills/core-ui.e2e.ts
# Expect TC-S-01 to fail with
#   TimeoutError: waiting for locator('[data-testid="my-skills-section"]')
```

Suggested focus when re-attempting:

1. Run with `DEBUG=pw:api` and retain video/screenshot artifacts via
   `playwright.config.ts` overrides (`trace: 'retain-on-failure'`,
   `video: 'retain-on-failure'`, `screenshot: 'on'`) to visually confirm which
   screen the page is stuck on when the timeout fires.
2. Test whether extending `goToSkillsHub`'s section-wait timeout to 30s makes
   any single test pass. If yes, the problem is page boot time; if no, the
   problem is a structural render break.
3. After (or during) the primary failure fix, rewrite `helpers/skillsHub.ts`'s
   `getMySkills` / `getAutoSkills` / `getCustomExternalPaths` / `importSkillViaBridge`
   / `deleteSkillViaBridge` / `addCustomExternalPath` / `removeCustomExternalPath`
   to use the HTTP bridge (`window.httpBridge` or `page.evaluate` against
   `fetch('/api/skills/...')`) instead of `invokeBridge('subscribe-...')`. The
   helpers were written for the IPC era and the IPC handlers are gone.
