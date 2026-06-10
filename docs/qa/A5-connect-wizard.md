# A5 — Connect Wizard: Walkthrough & QA Matrix

> **Bet A5** of the Chisl OpenCode UX Parity Program (Phase 1).
> Win-condition metric: **a new user can register a remote OpenCode server and
> send a first message in under 15 minutes**, with distinct, actionable error
> messages for every common failure mode.

---

## 1. What shipped

| Piece                                                                       | Location                                                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| First-run wizard (3 stages: form → connect checklist → done)                | `packages/desktop/src/renderer/components/settings/ConnectWizard/index.tsx`                                                          |
| Skip persistence (`chisl.connectWizard.dismissed`)                          | `.../ConnectWizard/connectWizardState.ts`                                                                                            |
| First-run trigger on the New Chat page (zero remote agents + not dismissed) | `packages/desktop/src/renderer/pages/guid/GuidPage.tsx`; `useGuidAgentSelection.ts` (`remoteAgentCount`)                             |
| Relaunch from settings ("Setup wizard" button)                              | `packages/desktop/src/renderer/pages/settings/AgentSettings/RemoteAgentManagement.tsx`                                               |
| Error classification, server side (`[code:<x>]` marker)                     | `AionCore/crates/aionui-ai-agent/src/services/remote.rs` (`connect_error_code_from_text`, `test_opencode_health`)                    |
| Error classification, client side (parse + i18n mapping)                    | `packages/desktop/src/renderer/utils/remote/connectError.ts`; keys `settings.connectError.*` (8 locales)                             |
| Server-tools workspace validation (fail-fast at session create)             | `AionCore/.../manager/remote/agent.rs::opencode_create_session` → `opencode_fs::fetch_path` probe → `[code:workspace_not_on_server]` |

Wizard reuses the existing save plumbing end-to-end:
`remoteAgent.testConnection` → `create` → `handshake` → `refreshModels` →
auto-default (`setDefaultRemoteAgentId`) → agent pre-selected on the New Chat
page (one message away from a live conversation).

## 2. Scripted walkthrough (first-run, happy path)

Prereq: a reachable OpenCode server (`opencode serve` on the target machine;
default port 4096). Fresh profile (no remote agents) or
`localStorage.removeItem('chisl.connectWizard.dismissed')`.

1. Launch Chisl → lands on `/guid` (New Chat). **T0 = app visible.**
2. Wizard opens automatically (zero remote agents, not dismissed).
3. Stage 1: enter `http://<host>:4096`; pick auth (none/bearer/basic/password
   - token if needed); optional name; tool host local/server. Click
     **Connect**.
4. Stage 2 checklist runs live: ① Test connection ② Save agent ③ Handshake
   ④ Fetch models. All four go green (④ is non-blocking on failure).
5. Stage 3: success summary (name, URL, model count). Click **Start
   chatting** → wizard closes, the new agent is pre-selected on New Chat.
6. Type a message, send → conversation opens, reply streams. **T1 = first
   reply token.**

**Timing cell (T1 − T0): requires an owner run against a live server** — no
live OpenCode server was reachable in the implementing session, so per the
evidence standard this cell is _not_ claimed. The flow is 1 form + 2 clicks +
1 message; the automated happy-path test (`connectWizard.dom.test.tsx` test 1)
proves the sequencing, not the wall-clock.

Failure-mode walkthroughs: enter a bad hostname (DNS), wrong token (auth), an
`https://` URL with a self-signed cert (TLS — wizard offers one-click "retry
with insecure allowed"), or a non-OpenCode endpoint (e.g. any plain web
server) — each shows its own actionable message (matrix below).

## 3. QA matrix

| Scenario                                                                        | Expected                                                                                  | Proving test                                                                                                                                        | Result                          |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Happy path: URL → test → save → handshake → models → done; onCompleted(agentId) | All 4 steps run in order, protocol pinned `opencode`                                      | `connectWizard.dom.test.tsx` › happy path                                                                                                           | ✅ automated                    |
| DNS failure classified                                                          | `[code:dns_failure]` from AionCore                                                        | `services::remote::tests::health_dns_failure_is_classified_as_dns_failure` (live `.invalid` host); text classifier `connect_error_code_dns_markers` | ✅ automated                    |
| TLS failure classified                                                          | `[code:tls_failure]`                                                                      | `connect_error_code_tls_markers` (chain-text classifier; no live TLS server in CI)                                                                  | ✅ automated (classifier-level) |
| TLS failure → one-click insecure retry                                          | retry re-invokes testConnection with `allow_insecure:true`                                | `connectWizard.dom.test.tsx` › tls retry                                                                                                            | ✅ automated                    |
| Auth failure classified (401/403)                                               | `[code:auth_failure]`                                                                     | `health_401_is_classified_as_auth_failure`, `health_403_...` (wiremock) + wizard test 2 (UI message)                                                | ✅ automated                    |
| Not-an-OpenCode endpoint                                                        | `[code:not_opencode]` on 404 or non-health JSON                                           | `health_404_is_classified_as_not_opencode`, `health_non_json_body_...` (wiremock)                                                                   | ✅ automated                    |
| Connection refused                                                              | `[code:connection_refused]`                                                               | `health_connection_refused_is_classified_as_connection_refused` (real dropped listener)                                                             | ✅ automated                    |
| Renderer mapping marker → localized message (all 9 codes)                       | `settings.connectError.<code>` exists in en-US; marker parse + heuristic fallback         | `connectError.test.ts` (29 tests incl. locale-drift guard)                                                                                          | ✅ automated                    |
| Handshake failure after create: retry does not duplicate the agent              | `create` called exactly once                                                              | `connectWizard.dom.test.tsx` › handshake retry                                                                                                      | ✅ automated                    |
| Skip is persistent; plain close is not                                          | localStorage flag semantics                                                               | `connectWizard.dom.test.tsx` › skip/close + state roundtrip                                                                                         | ✅ automated                    |
| Relaunchable from settings                                                      | "Setup wizard" button opens wizard                                                        | code: `RemoteAgentManagement.tsx` (render-tested transitively via wizard tests; button itself is analysis, not asserted)                            | ⚠️ analysis                     |
| Server-tools workspace invalid → fail fast (no 502 limp mode)                   | session create rejected with `[code:workspace_not_on_server]`, `POST /session` never sent | `server_mode_session_create_fails_fast_when_workspace_missing` (wiremock, `.expect(0)` on /session)                                                 | ✅ automated                    |
| Server-tools workspace valid → probe passes, session created                    | `GET /path?directory=` then `POST /session`                                               | `server_mode_session_create_probes_workspace_and_succeeds`                                                                                          | ✅ automated                    |
| Local mode unaffected by probe                                                  | no `GET /path` issued                                                                     | `local_mode_session_create_skips_workspace_probe`                                                                                                   | ✅ automated                    |
| <15-min first-message timing                                                    | wall-clock                                                                                | **owner run required** (no live server in session)                                                                                                  | ⏳ owner                        |

## 4. Verification (exit codes, implementing session 2026-06-09)

- AionUi: `bun run i18n:types` 0 · `node scripts/check-i18n.js` 0 ·
  `bunx tsc --noEmit` 0 · `bun run lint` 0 ·
  `bun run test` (connectWizard 6/6, connectError 29/29) 0.
- AionCore: `cargo fmt` clean · `cargo clippy --all-targets` 0 (pre-existing
  warnings only) · `cargo test -p aionui-ai-agent --lib remote::` →
  **272 passed / 0 failed** (16 new A5 tests).
