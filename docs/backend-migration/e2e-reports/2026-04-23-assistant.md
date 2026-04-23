# E2E Report — Assistant Module Verification — 2026-04-23

**Branch:** `feat/backend-migration-assistant-verify`
**Branch tip at run start:** `cf7d29a36` (frontend-dev-2 handoff commit).
Frontend-dev-2 added `7695e4fcc` (probe transcript) at 10:06 while this
run was mid-flight; behavior of tested code not affected.
**Backend binary:** `~/.cargo/bin/aionui-backend` (install mtime:
Apr 22 23:22 2026 — post Skill-pilot source-field fix).
**Renderer bundle:** `out/renderer/index.html` (Apr 23 00:19 2026).
**Runner:** `bun run test:e2e tests/e2e/features/assistants/`
**Wall time:** 2.5 min (1 worker, 37 tests).
**Run log:** `/tmp/assistant-e2e-run.log` (ephemeral).

## Scope

| Test file | Test count | Endpoints exercised (via UI) |
| --- | --- | --- |
| `core-interactions.e2e.ts` | 6 (P0-1…P0-6) | `GET /api/extensions/assistants`, `DELETE` rule/skill, skills modal |
| `ui-states.e2e.ts` | 26 (P1-1…P1-27 mixed) | list, drawer, rule read/write, auto-injected skills, summary count tags |
| `edge-cases.e2e.ts` | 5 (P2-1…P2-5) | highlight animation, search+filter combo, custom path dialog |

**Total:** 37 tests. Plan estimated ~50; actual surface is 37.

## Result summary

```
32 passed · 5 failed · 0 skipped
```

All 6 P0 core interactions passed. All failures are in non-P0 tests and
none involve an Assistant HTTP endpoint misbehaving. See classification
below.

## UI rendering with real data: **verified**

- `GET /api/extensions/assistants` returns a populated list in e2e (the
  Electron app uses the user's real `~/.aionui` dir — see caveats). All
  tests that depend on `assistant-card-builtin-*` or
  `assistant-card-*` locators succeeded, which means the list renders
  and IDs match the DOM contract.
- Drawer open/close, search toggle, filter tabs (All/System/Custom),
  highlight-via-query-param, delete modal preview card, skills modal
  search+empty state, extension-assistant skills section, rules section
  expand/collapse + edit/preview tabs, custom assistants source tag,
  duplicate-on-hover, section count headers, custom/pending skill
  badges, builtin-skill checkbox uncheck, summary count tag, drawer
  width responsiveness, and mobile stacked layout are all **rendering
  and interactive** against live backend data.
- Write/delete persistence is covered by the backend probe transcript in
  `docs/backend-migration/modules/assistant.md` (Probes 3/4/5/6*). The
  e2e UI layer did not explicitly round-trip a rule edit, but the
  drawer's edit/preview tabs rendered against real rule content in P1-10
  and P1-11.

## Failures (5)

All five share a root cause that is **not** in the Assistant
transport/contract: the Playwright helper `invokeBridge`
(`tests/e2e/helpers/bridge.ts:19`) still uses the legacy
`subscribe-{key}` emit/callback protocol. After the Skill-pilot
migration, provider methods built via `httpGet` / `httpPost`
(`src/common/adapter/httpBridge.ts:93-117`) route directly over `fetch`
and expose `provider: () => {}` as a no-op — no WebSocket `subscribe-*`
handler is installed. Any test that calls `invokeBridge(page, <key>)`
to seed state for a migrated endpoint therefore hits a 10 s timeout.

| # | Test | Symptom | Class | Notes |
| - | - | - | - | - |
| 1 | `edge-cases.e2e.ts::P2-3 skill delete button visible on hover` | `Bridge invoke timeout: add-custom-external-path` | **E** (test-infra) | Setup helper seeds a temp external skill source |
| 2 | `ui-states.e2e.ts::P1-18 auto-injected section shows when configured` | `.arco-collapse-item` with "Auto-injected Skills" text not visible | **B** (fixture assumption) | Section only renders when `builtinAutoSkills.length > 0`; e2e hits the user's real `~/.aionui/skills/builtin-auto` dir (empty) — see §Caveats |
| 3 | `ui-states.e2e.ts::P1-23 session storage intent opens assistant editor` | `Bridge invoke timeout: extensions.get-assistants` | **E** (test-infra) | Test uses `invokeBridge` **only to pre-fetch a valid assistantId**; the UI flow itself works — P0-4 `highlight assistant card via query param` tests the same guid intent pattern via URL and passes |
| 4 | `ui-states.e2e.ts::P1-20 skills modal source pills render and switch` | `Bridge invoke timeout: add-custom-external-path` | **E** (test-infra) | Same setup bridge call as P2-3 |
| 5 | `ui-states.e2e.ts::P1-21 skills modal shows added skills as disabled` | `Bridge invoke timeout: add-custom-external-path` | **E** (test-infra) | Same setup bridge call as P2-3 |

### Curl-probe confirmation (Skill-pilot rubric)

A fresh backend was launched on :25812 and :25813 to isolate test-infra
from contract:

```
GET  /api/extensions/assistants            → 200 {"success":true,"data":[]}    ✅
POST /api/skills/external-paths            → 200 {"success":true}              ✅
GET  /api/skills/builtin-auto              → 200 {"success":true,"data":[]}    ✅ (empty on fresh FS — see Caveats)
GET  /api/skills                           → 200 (data populated from user ~/.aionui)
DELETE /api/skills/external-paths?path=... → 400 BAD_REQUEST "Expected Content-Type: application/json"   ⚠ see below
```

None of the Assistant contract endpoints (rule/skill read/write/delete,
list assistants) misbehave. The `DELETE external-paths` 400 is a minor
backend quirk (requires a JSON Content-Type header on a request that
carries no body), unrelated to the Assistant module — flagged as a
follow-up, not a blocker.

## Classification summary

- **Class D (transport/migration):** **0** — no Assistant HTTP call
  returned a mis-shaped response. Contract matches TS expectation on all
  7 endpoints.
- **Class F (backend contract gap on the Assistant surface):** **0**.
  The `DELETE external-paths` 400 above is a Skill-module surface, not
  Assistant — it is not in the 7 Assistant endpoints.
- **Class A (stateful/scale):** partially, in the form of host-FS
  pollution — e2e runs against the user's real `~/.aionui` dir, which
  affects P1-18 because it assumes builtin auto-injected skills are
  seeded.
- **Class B (fixture assumption):** 1 (P1-18). Assumes
  `builtinAutoSkills.length > 0` for first builtin assistant.
- **Class E (test-infra):** 4 (P2-3, P1-20, P1-21, P1-23). `invokeBridge`
  helper does not work with HTTP-migrated providers.

All failures are **B/C/E**, matching the Skill-Library pilot definition
of pilot-equivalent success. **No Class D or F on the Assistant
surface.**

## Routing recommendation

No backend-dev or Assistant frontend-dev follow-up is needed from this
run.

Follow-ups for **the e2e-coverage track** (not the Assistant migration):

1. Update `tests/e2e/helpers/bridge.ts` to fall back to direct HTTP for
   HTTP-migrated keys (or add an HTTP-based helper
   `tests/e2e/helpers/http.ts` and retire `invokeBridge` for migrated
   surfaces). This unblocks ~4 tests in this run and will unblock any
   future test that needs to seed fixture data.
2. For P1-18, either (a) seed a builtin auto-skill in a sandboxed data
   dir before the test, or (b) relax the assertion to only check
   `builtinAutoSkills.length > 0 → section visible` (soft-skip
   otherwise). Preferred approach: option (a) as part of the test-infra
   sandbox P0 from the Skill pilot.
3. Minor backend quirk — `DELETE /api/skills/external-paths` rejects
   requests without `Content-Type: application/json`. Either accept
   DELETE without a body (preferred, since the id is in the query
   string) or update the helper to always send the header. Flagged but
   low priority.

## Known caveats / post-pilot follow-ups

- **State pollution from Skill pilot and dev use.** E2e launches the
  real Electron app, which reads from `~/.aionui`. The user's machine
  has Mermaid and officecli skills already installed (visible in
  `GET /api/skills`) — so the "no skills" branches in P1-18 and P1-19
  behave differently than on a clean CI machine. This is the same
  **test-infra sandbox P0** logged in the Skill-Library pilot closure.
- **`invokeBridge` legacy path.** The post-migration adapter layer no
  longer emits `subscribe-*` WebSocket events for HTTP providers — any
  Playwright helper that relies on emit/callback bridging will timeout.
  Only 4 tests in this run use it; other migrated tests
  (`skillsHub.ts:2` also imports `invokeBridge`) may be affected in
  other suites.
- **Class D / F on the Assistant surface:** **0 occurrences.** The
  backend contract is fully compatible with the renderer's expectations.
- **Probe transcript:** `docs/backend-migration/modules/assistant.md`
  §A.3 (per commit `7695e4fcc`). Combined with this e2e report, the
  Assistant module is green end-to-end.

## Artifacts

- Run log: `/tmp/assistant-e2e-run.log` (ephemeral).
- Curl probe transcripts: backend log at
  `/tmp/aionui-assistant-e2e-verify/backend.log` and
  `/tmp/aionui-probe-3/backend.log` (both ephemeral).
- 32 passing tests captured screenshots under
  `tests/e2e/.artifacts/screenshots/assistants/*` (per-test dir, not
  committed; regenerated each run).
