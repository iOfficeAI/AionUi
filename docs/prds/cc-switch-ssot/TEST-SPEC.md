# cc-switch SSOT Managed CLI Test Spec

## Scope

Validate managed login, config reconciliation, model switching, and new-conversation behavior for:

- Claude
- Hermes
- OpenCode
- OpenClaw

## Unit Tests

1. Managed runtime mapping
   - Claude managed model resolves to safe slot only where needed.
   - Hermes/OpenCode/OpenClaw preserve raw managed model IDs for config truth.
   - Managed new conversations do not inject `extra.current_model_id`.

2. Capability matrix
   - OpenClaw requires new conversation for model changes.
   - Claude/Hermes/OpenCode remain ACP hot-switch capable.

3. Structured config verifier
   - Claude config parses JSON and rejects forbidden managed model env overrides.
   - Hermes config parses YAML plus `.env`.
   - OpenCode config parses JSON and validates `provider.*.options`.
   - OpenClaw config parses JSON and validates `models.providers.*`.

## Integration / Smoke

1. Login reconcile
   - Managed provider exists after login.
   - All four CLI config files are written.

2. Model switch
   - Change Claude model and verify reconcile is invoked.
   - Change OpenCode model and verify reconcile is invoked.
   - Change OpenClaw model and verify no in-session `setModel` occurs.

3. Conversation creation
   - New managed Claude/OpenCode conversations are created without managed runtime wrapper IDs in `extra.current_model_id`.

## Manual / End-to-End

1. Log in on a clean machine profile.
2. Open each CLI target once and send a short prompt.
3. Switch model for each CLI and repeat.
4. Confirm logs do not show:
   - `No available channel for model claude-opus-4-7`
   - managed wrapper IDs being injected into Claude session creation

## Exit Criteria

- Targeted unit tests pass.
- Managed conversation parameter regression tests pass.
- Model switching path is covered by automated assertions.
- Known residual risk is documented if full smoke cannot run in CI.
