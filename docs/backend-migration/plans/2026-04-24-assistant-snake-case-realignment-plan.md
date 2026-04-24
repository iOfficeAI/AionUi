# Assistant Snake-Case Realignment — Implementation Plan (AionUi companion)

**Authoritative plan:**
[`aionui-backend/docs/backend-migration/plans/2026-04-24-assistant-snake-case-realignment-plan.md`](../../../../aionui-backend/docs/backend-migration/plans/2026-04-24-assistant-snake-case-realignment-plan.md)

This file is a pointer-only copy so AionUi-only reviewers can discover
the plan alongside the frontend-side spec.

## Frontend task summary

Three branches off `feat/backend-migration-coordinator-assistant-camel`:

1. **`feat/assistant-snake-case`** — T2a, frontend-dev (heavy):
   `assistantTypes.ts` field flip + ts-morph codemod across 43 files,
   209 access sites; `migrateAssistants.ts` split out
   `legacyAssistantToCreateRequest` mapper; Vitest + Playwright
   fixtures realigned.

2. **`fix/acp-camelcase-hotfix`** — T2b, frontend-dev (light):
   `ipcBridge.ts` setModel body uses `model_id`, verify
   setConfigOption body clean. 2 regression tests.

3. **`fix/fs-temp-camelcase-hotfix`** — T2c, frontend-dev (light):
   `ipcBridge.ts` createTempFile/createUploadFile type signatures
   flipped; all call sites updated (tsc-enforced). 2 regression tests.

T3 e2e-tester integrates all three branches, runs Playwright +
regression. T4 coordinator merges into the coordinator branch,
packaging smoke, handoff.

See the authoritative plan for exact steps and commands.
