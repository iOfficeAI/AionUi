# Assistant Snake-Case Realignment — Design Spec (AionUi frontend side)

**Date:** 2026-04-24
**Companion spec (backend + full context):**
[`aionui-backend/docs/backend-migration/specs/2026-04-24-assistant-snake-case-realignment-design.md`](../../../../aionui-backend/docs/backend-migration/specs/2026-04-24-assistant-snake-case-realignment-design.md)

This file is the frontend-facing mirror. All authoritative content —
root cause, goals, non-goals, backend changes, frontend changes,
rollout, risks, DoD — lives in the backend-side spec. This file exists
so an AionUi-only reviewer has a discoverable entry point.

## Scope summary

Three branches, one team sequence:

1. **`feat/assistant-snake-case`** (AionUi) — bulk rename `Assistant`
   type + ~209 access sites across 43 files to snake_case. Paired with
   `aionui-backend` branch of same name that removes 7 `rename_all =
   "camelCase"` from `api-types/assistant.rs`, removes 1 from
   `aionui-assistant/src/builtin.rs`, and rewrites 20 entries in
   `assets/builtin-assistants/assistants.json`.

2. **`fix/acp-camelcase-hotfix`** (AionUi only) — fix two broken
   endpoints: `ipcBridge.ts` `setModel` sends `{modelId}` but backend
   expects `{model_id}`; same for `setConfigOption`. These are genuine
   runtime-broken contracts logged as follow-up in the skill
   realignment pilot's handoff.

3. **`fix/fs-temp-camelcase-hotfix`** (AionUi only) — fix same class of
   issue for `createTempFile` / `createUploadFile` body keys.

## Team

- coordinator (me) — plan, dispatch, merge, smoke, handoff
- backend-dev — backend T1
- frontend-dev — T2a (heavy) + T2b + T2c serial
- e2e-tester — T3 Playwright + regression reruns

## Frontend deliverables

- §5.1 — `src/common/types/assistantTypes.ts` field flip + 209 access-site rename + destructuring pattern preservation + `migrateAssistants.ts` legacy-camel → new-snake mapper
- §5.2 — 2 body-key flips in `ipcBridge.ts` ACP block + 2 Vitest regression tests
- §5.3 — 2 body-key + type-signature flips in `ipcBridge.ts` FS block + all call-site updates (tsc-enforced) + 2 Vitest regression tests

See the backend-side spec's §5 for full details.

## PRs

None raised, per user convention. All branches push to origin only.
