# Handoff — Assistant module e2e verification (e2e-tester → coordinator)

Date: 2026-04-23
Branch: `feat/backend-migration-assistant-verify`
Owner (outgoing): e2e-tester (Task B)
Next owner: coordinator for Task C (closure)

## Status

- B.1 pre-run check → PASS. Branch tip `cf7d29a36` at start, backend
  binary Apr 22 23:22 (post source-field fix), renderer bundle
  Apr 23 00:19. (Frontend-dev-2 added `7695e4fcc` at 10:06 during the
  run — it only updates the module log's probe transcript, no code
  change.)
- B.2 surface enumeration → 3 files, 37 tests total
  (core-interactions 6 · ui-states 26 · edge-cases 5). Plan estimated
  ~50; real count is 37. Helper `tests/e2e/helpers/assistantSettings.ts`
  is DOM-driven (0 legacy IPC matches) — confirmed clean.
- B.3 run → `bun run test:e2e tests/e2e/features/assistants/` →
  **32 passed · 5 failed** in 2.5 min.
- B.4 classification → 0 Class D, 0 Class F on Assistant surface.
  4 × Class E (test-infra bridge helper) and 1 × Class B (fixture
  assumption on builtin auto-skills). Matches Skill-Library pilot
  equivalent of "clean".
- B.5 report → `docs/backend-migration/e2e-reports/2026-04-23-assistant.md`.
- B.6 handoff → this file.

## Outcome

**Pilot-equivalent success.** All 6 P0 core interactions green. None of
the 7 Assistant HTTP endpoints (list, rule read/write/delete, skill
read/write/delete) produced a mis-shaped response or unexpected status
in either the UI run or direct curl probes against a fresh backend. The
Assistant module is verified end-to-end.

Recommending **Task B → completed, Task C → start**.

## Commits pushed by this agent

- None to source code or tests. Two doc commits:
  - `docs(backend-migration): e2e verification report for assistant module`
  - `docs(backend-migration): e2e-tester handoff for assistant verification`

## Failure details (for coordinator awareness — not blocking)

All 5 failures are test-infra or fixture issues owned by the
**e2e-coverage track**, not the Assistant migration track.

| Test | Class | Root cause |
| - | - | - |
| P2-3, P1-20, P1-21 | E | `invokeBridge(page, 'add-custom-external-path', ...)` times out because the HTTP-migrated bridge has no `subscribe-*` handler. |
| P1-23 | E | `invokeBridge(page, 'extensions.get-assistants', ...)` — same root cause. |
| P1-18 | B | Asserts "Auto-injected Skills" section visible, but `GET /api/skills/builtin-auto` returns `[]` on a FS without seeded builtin auto-skills. |

See the report for curl-probe confirmation and routing recommendations.

## Recommendations to route downstream (non-blocking)

1. **Test-infra P0** — update `tests/e2e/helpers/bridge.ts` to fall back
   to direct HTTP for migrated keys, or introduce an
   `invokeBackendHttp` helper. This unblocks these 4 tests and any
   future seed-via-bridge test. Same issue is latent in
   `tests/e2e/helpers/skillsHub.ts:2` and may surface in other suites.
2. **Fixture sandbox P0** (tracked from Skill pilot) — seed fixtures
   (builtin auto-skills, external-skills source) into an isolated data
   dir before each e2e run. This covers P1-18 and the Skill-pilot
   carryover.
3. **Minor backend quirk** — `DELETE /api/skills/external-paths` returns
   400 BAD_REQUEST when called without `Content-Type: application/json`
   (no body required). Low priority; fix either the handler or the
   renderer. Not in the Assistant scope.

## What coordinator should do (Task C)

- Confirm Task B → completed (all Assistant endpoints verified, only
  Class B/E test-infra failures remain).
- Close the Assistant verification pilot the same way as the Skill-
  Library pilot: write a closure doc at
  `docs/backend-migration/handoffs/coordinator-assistant-verify-2026-04-23.md`
  linking the report, the module log, and the three recommendations
  above.
- Decide whether the test-infra P0 fix belongs in this branch or in a
  dedicated test-infra PR. (Pilot precedent was "dedicated PR".)

## Files touched

```
docs/backend-migration/e2e-reports/2026-04-23-assistant.md          (new)
docs/backend-migration/handoffs/e2e-tester-assistant-verify-2026-04-23.md  (new, this file)
```

No source or test code changed in this session.

## Open questions

- None blocking. The Q1 from frontend-dev-2's handoff (missing plan
  file at `docs/backend-migration/plans/…-assistant-module-verification-plan.md`)
  is still unresolved but has no functional impact — verification
  proceeded from the Task description alone and matches the Skill-
  Library pilot structure.
