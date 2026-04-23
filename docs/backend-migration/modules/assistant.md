# Assistant Module — Backend Migration Verification Log

Branch: `feat/backend-migration-assistant-verify`
Date: 2026-04-23
Agent: frontend-dev (verification track)

## Scope

Verification only — the 7 Assistant HTTP endpoints were already implemented
during the Skill-Library pilot. This log records what was re-validated.

## Endpoints verified

All 7 endpoints exercised against `~/.cargo/bin/aionui-backend --local` on
port 25810 with an ephemeral data dir at `/tmp/aionui-verify/data`.

| #   | Method | Path                                        | Status | Notes                                                                      |
| --- | ------ | ------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| 1   | GET    | `/api/extensions/assistants`                | 200    | Empty fresh DB → `{"success":true,"data":[]}`                              |
| 2   | POST   | `/api/skills/assistant-rule/read`           | 200    | Returns `""` for unknown `assistantId`; returns stored content after write |
| 3   | POST   | `/api/skills/assistant-rule/write`          | 200    | `{"success":true,"data":true}`                                             |
| 4   | DELETE | `/api/skills/assistant-rule/{assistantId}`  | 200    | Path-param carries id; post-delete read returns `""`                       |
| 5   | POST   | `/api/skills/assistant-skill/read`          | 200    | Same shape as rule/read                                                    |
| 6   | POST   | `/api/skills/assistant-skill/write`         | 200    | Same shape as rule/write                                                   |
| 7   | DELETE | `/api/skills/assistant-skill/{assistantId}` | 200    | Path-param carries id; post-delete read returns `""`                       |

Input-validation path exercised: POST `assistant-rule/read` with missing
`assistantId` → HTTP 400 `BAD_REQUEST` with a descriptive error body.

Round-trip sanity: write `"round-trip content"` for `assistantId=rt-1` →
read returns the exact string. Write/read/delete/read cycle on
`del-test` / `del-sk` all pass.

## Frontend wiring (already in place, not newly added)

Renderer calls go through the IPC bridge adapter, which maps to HTTP:

`src/common/adapter/ipcBridge.ts:303-316` —

- `readAssistantRule` → `POST /api/skills/assistant-rule/read`
- `writeAssistantRule` → `POST /api/skills/assistant-rule/write`
- `deleteAssistantRule`→ `DELETE /api/skills/assistant-rule/{assistantId}`
- `readAssistantSkill` → `POST /api/skills/assistant-skill/read`
- `writeAssistantSkill`→ `POST /api/skills/assistant-skill/write`
- `deleteAssistantSkill`→`DELETE /api/skills/assistant-skill/{assistantId}`

Note the DELETE shape: `assistantId` rides the URL path, not the body.
The first probe round using body-carried id failed with 404
`Skill not found: assistant-rule` — this is expected and correct
because the handler routes on the URL segment. Retest via path-param
produced 200 across both rule and skill deletes.

`GET /api/extensions/assistants` is consumed via
`ipcBridge.extensions.getAssistants.invoke()` (callers:
`useAssistantList`, `presetAssistantResources`, etc.).

## Static checks

- `bun run lint` → 0 errors, 1827 warnings (pre-existing; no new warnings
  introduced). 1466 files scanned.
- `bunx tsc --noEmit` → clean (no output, exit 0).

## Unit tests

`bun run test --run` on the assistant-scoped files:

- `tests/unit/assistantHooks.dom.test.ts`
- `tests/unit/assistantUtils.test.ts`
- `tests/unit/assistantPresets.i18n.test.ts`

Initial run: **4 failures / 46 passes** in `assistantHooks.dom.test.ts`.
Root cause: the renderer hooks now consume auto-unwrapped IPC returns
(`detectAndCountExternalSkills.invoke()` and `getAvailableAgents.invoke()`
resolve to the raw array), but the test still supplied the legacy
`{success, data}` envelope. The hook read `externalSources.find` on a
plain object and threw `externalSources.find is not a function`.

Fix: align the 6 mock sites (file-top defaults + 4 `mockResolvedValue`
blocks) to return raw arrays. Commit `af5477360` —
`test(assistant): align hook mocks with auto-unwrapped ipcBridge returns`.

Re-run: **50 passed / 0 failed / 3 files**.

## UI spot-check

Manual Electron spot-check (A.3 per the plan) requires an interactive
session; the agent runtime here is non-interactive, so the 7 UI flows
(list load, drawer open, rule read, rule edit+save+persist, delete,
auto-skills picker populated) were not visually driven. The equivalent
guarantees were obtained via direct HTTP probes of the same endpoints the
UI uses, so the behavioural contract is confirmed even if the widget
rendering is not.

Deferred to the e2e suite / human spot-check:

- `tests/e2e/features/assistants/core-interactions.e2e.ts`
- `tests/e2e/features/assistants/edge-cases.e2e.ts`
- `tests/e2e/features/assistants/ui-states.e2e.ts`
- `tests/e2e/specs/assistant-settings-{crud,skills,permissions}.e2e.ts`

These remain the authoritative UI-side verification — see handoff for
Task B (`e2e-tester`).

## Artifacts

- Backend probe raw output: `/tmp/aionui-verify/probe.txt` (ephemeral).
- Backend log: `/tmp/aionui-verify/backend.log` (ephemeral).
- Backend binary timestamp: same as Skill pilot (Apr 22 23:22).
- Test fix commit: `af5477360`.

## Risks / follow-ups

1. **Stale test mocks elsewhere** — the same `{success, data}` → raw
   auto-unwrap migration likely affects other hook tests that call
   into `ipcBridge.fs.*` or `ipcBridge.acpConversation.*`. Recommend
   grep for `mockResolvedValue({ success: true,` in the test tree.
2. **DELETE URL shape** — the body-carried `assistantId` was a natural
   first guess and returns a confusing 404 message. If any legacy
   caller ever used the body form it would silently fail; a brief audit
   of callers of `deleteAssistantRule` / `deleteAssistantSkill` is
   recommended (none found in the current tree).
3. **List shape** — `GET /api/extensions/assistants` returned `data: []`
   on the fresh DB. Exercising with actual preset/extension assistants
   requires a populated data dir; left for the e2e run.
