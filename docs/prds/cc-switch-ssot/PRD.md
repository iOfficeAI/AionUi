# cc-switch SSOT Managed CLI PRD

## Goal

After the user logs into the desktop client, POUNDING should automatically configure `Claude`, `Hermes`, `OpenCode`, and `OpenClaw` to use the POUNDING gateway without manual file edits.

`Codex` is explicitly out of scope.

## Product Rules

- `cc-switch` is the managed configuration source of truth.
- Frontend model selection updates `newApi.desktop.cliModelPrefs` and triggers backend reconcile.
- Frontend must not treat managed model IDs as runtime routing IDs for new conversations.
- Claude, Hermes, OpenCode, and OpenClaw each keep their native config schema.
- Model switching must be testable and persist across app relaunch.

## Functional Requirements

1. Login flow
   - Login creates or updates the managed provider.
   - Login writes managed CLI preferences when missing.
   - Login reconciles native config for all four CLIs.

2. Model selection
   - Each CLI can store an independent managed model preference.
   - Changing a model triggers `reconcileModel`.
   - Claude, Hermes, and OpenCode support in-session switch.
   - OpenClaw requires a new conversation after model change.

3. Conversation creation
   - Managed CLI new conversations do not inject synthetic runtime model IDs.
   - Runtime behavior comes from reconciled native config and backend state.
   - Claude keeps backend-side safe slot normalization only where required.

4. Config sync
   - Claude writes `.cc-switch` provider state plus `~/.claude/settings.json`.
   - Hermes writes `config.yaml` plus `.env`.
   - OpenCode writes managed `opencode.json`.
   - OpenClaw writes managed `openclaw.json`.

## Non-Goals

- No Codex integration in this SSOT flow.
- No protocol redesign for ACP or OpenClaw runtime transport.
- No dependency on an externally installed `cc-switch` desktop app.

## Success Criteria

- No new conversation path passes managed wrapper IDs like `custom:*` or `pounding-*/model`.
- No log line indicates `claude-opus-4-7` channel resolution failure after managed login.
- Switching a CLI model updates the corresponding native config.
- OpenClaw replies no longer duplicate due to prior managed model/session confusion, with existing backend duplicate mitigation preserved.
