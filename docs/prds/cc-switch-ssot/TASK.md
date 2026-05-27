# cc-switch SSOT Managed CLI Task Breakdown

## Workstreams

1. Frontend runtime cleanup
   - Stop injecting managed runtime wrapper model IDs into new conversations.
   - Keep managed model selection in UI state only.
   - Route persistence through `cliModelPrefs` plus `reconcileModel`.

2. Backend config reconciliation
   - Keep `.cc-switch` as Claude SSOT input for backend runtime.
   - Preserve native config writers for Hermes, OpenCode, and OpenClaw.
   - Make cleanup target-scoped and non-destructive.

3. Verification
   - Upgrade config verification to structured parsing.
   - Add regression tests for model switching and non-injection.
   - Keep OpenClaw “new conversation required” behavior explicit.

## Deliverables

- Updated managed runtime helpers
- Updated conversation creation flow
- Updated model selector flow
- Safer `.cc-switch` cleanup
- PRD / TEST-SPEC / TASK docs
- Targeted automated coverage for model switching

## Remaining Follow-ups

- Add higher-fidelity smoke coverage once the managed DOM/e2e harness is stabilized.
- Revisit Hermes config schema alignment if the product standard moves from YAML to JSON in a later migration.
