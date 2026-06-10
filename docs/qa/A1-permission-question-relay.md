# A1 — Permission + Question Relay: Round-Trip Trace & QA Matrix

> **Bet A1** of the Chisl OpenCode UX Parity Program (Phase 1).
> Win-condition metric: **100% of permission/question prompts must reach the
> remote OpenCode server (server acknowledgment), not merely change UI state.**
>
> Scope: the **OpenCode-over-HTTP/SSE** relay (Chisl ⇄ AionCore ⇄ remote
> OpenCode). The legacy OpenClaw WebSocket path described in
> `docs/prds/conversations/remote/remote-agent.md` is **not** the live path for
> OpenCode and is corrected there (see "Defect investigation" below).

---

## 1. Verified round-trip trace (file / function / line per hop)

Repos: `AionUi` (Electron/TS) and `AionCore` (Rust gateway). All AionCore paths
are under `crates/aionui-ai-agent/src/manager/remote/` unless noted.

### 1a. Inbound: OpenCode `permission.asked` → Chisl card

| #   | Hop                                                                                                                                                                                                                              | Location                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | OpenCode emits `permission.asked` over SSE (`/global/event`).                                                                                                                                                                    | remote OpenCode server                                                                    |
| 2   | SSE bytes consumed by the supervised reader; byte-level frame split (`sse_frame_boundary`), strict UTF-8 decode, `unwrap_event`.                                                                                                 | `agent.rs::run_event_reader` (717); `unwrap_event` (265)                                  |
| 3   | Dispatch + expiry sweep on every tick.                                                                                                                                                                                           | `agent.rs::handle_opencode_sse_event` (1865); `sweep_expired_prompts` call (1909)         |
| 4   | `permission.asked` arm: extract `id`→`request_id`, `permission`, `metadata`, `patterns`, `toolCallID`; auto-accept check; build `Confirmation`; stamp `prompt_expiries` (budget `DEFAULT_PROMPT_TIMEOUT_MS = 60_000`, line 553). | `agent.rs` match arm (2441); `Confirmation` struct `aionui-common/src/types.rs:52`        |
| 5   | Emit `AgentStreamEvent::AcpPermission(Confirmation)`. Tagged outer `{type,data}`; **untagged** inner serializes the bare `Confirmation`.                                                                                         | emit (2638); enum `protocol/events/mod.rs:42`; untagged `protocol/events/permission.rs:9` |
| 6   | Wire frame to Chisl: `{ "type":"acp_permission", "data": { call_id, description, options:[{label,value,params?}], ... } }`.                                                                                                      | WS → renderer                                                                             |
| 7   | Renderer ingests via `responseStream.on`. Approvals tab listens for `acp_permission`/`permission`; inline cards render too.                                                                                                      | `useWorkspaceApprovals.ts:82`; `MessagePermission.tsx`; `PendingApprovalsBanner.tsx`      |

### 1b. Outbound: user click → OpenCode acknowledgment

| #   | Hop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Location                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | User clicks Allow/Always/Reject → `confirmation.confirm.invoke({ conversation_id, call_id, msg_id, data:{value,...}, always_allow })`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `MessagePermission.tsx:106`; `PendingApprovalsBanner.tsx:205/264`; `useWorkspaceApprovals.ts:119`                                                        |
| 9   | `confirm` is an **`httpPost`** (not an Electron IPC to a TS handler) → `POST /api/conversations/{id}/confirmations/{call_id}/confirm` body `{ msg_id, data, always_allow }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `common/adapter/ipcBridge.ts:566`                                                                                                                        |
| 10  | AionCore HTTP route → service (ownership check) → agent dispatch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `aionui-conversation/src/routes.rs:66,257`; `service.rs:993`; `agent_task.rs:285`                                                                        |
| 11  | `RemoteAgentManager::confirm`: normalize reply (`once`/`always`/`reject`/`allow_dir`/`allow_session`); dedup via `recently_replied_permissions` (60s TTL); drain blessed siblings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `agent.rs::confirm` (5343); dedup (5592)                                                                                                                 |
| 12  | **Outbound acknowledgment** — fire-and-forget `POST {base}/permission/{call_id}/reply` body `{ "reply": <decision> }`; on 2xx logs `"OpenCode permission reply sent"` (with the endpoint in the log line) and clears the dedup stamp. **Directory scoping requirement (live-pass failure 2026-06-09):** in server-tools mode the URL **must** carry `?directory=<workspace>` — permissions live in the registry of OpenCode's _per-directory app instance_, so an unscoped reply hits the default instance and 404s with `PermissionNotFoundError` while the tool call stays parked. On non-2xx the gateway retries once via the deprecated session-scoped `POST /session/{sid}/permissions/{pid}` body `{"response":…}` (same scoping); if both fail, the confirmation card is **re-queued** (once) so the user can retry instead of facing a silent hang. | `confirm` spawn → `post_permission_reply_with_fallback`; builder `build_permission_reply_request`; scoping `opencode_context::append_v1_directory_value` |
| 13  | OpenCode echoes `permission.replied` → AionCore drops the confirmation, stamps dedup, broadcasts `confirmation.remove` → UI removes the card.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | reconcile arm (2787); `useWorkspaceApprovals.ts:108`                                                                                                     |

### 1c. Questions ("ask user") — parity path

| #   | Hop                                                                                                                                                                        | Location                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Q1  | `question.asked` arm → `parse_question_request` → **one `Confirmation` per question** (`call_id = "question-{reqid}-{index}"`), options = labels.                          | `agent.rs` (2679); `opencode_question.rs::build_question_confirmations` (≈217) |
| Q2  | Emitted on the **same** `AcpPermission(Confirmation)` channel → same Approvals UI.                                                                                         | emit (2735)                                                                    |
| Q3  | Confirm routes by `call_id` prefix; the chosen **label** is recorded into a `PendingQuestion` buffer.                                                                      | `is_question_call_id` (5440)                                                   |
| Q4  | When all questions in the request are answered → `POST {base}/question/{reqid}/reply` body `{ "answers": [[label, ...], ...] }`. Reject → `POST /question/{reqid}/reject`. | `spawn_question_reply` (2984); builder `opencode_question.rs:307`              |

### 1d. Timeout / auto-reject

- Budget: **60s** (`DEFAULT_PROMPT_TIMEOUT_MS = 60_000`, `agent.rs:553`). The
  legacy PRD prose said "70 seconds" in one acceptance row — that was never the
  implementation; the doc is corrected and a guard test pins the constant.
- `sweep_expired_prompts` (5776) runs each SSE tick: warns at 80% (`4/5`), and at
  100% calls `synthesize_timeout_reject` (5821) which POSTs `{"reply":"reject"}`
  (permissions) or `/question/.../reject` (questions).

---

## 2. Defect investigation — the "no-op resolve"

**Claim under audit** (from the master prompt and `remote-agent.md` F-RAGENT-11):
entries in a `pendingPermissions` map hold a no-op `resolve` (`(_response) => {}`)
so the user's choice is never transmitted; "no `exec.approval.respond`-style
call was found."

**Finding: the defect does not exist in the live OpenCode relay.**

- `pendingPermissions`, `exec.approval.request`, `handleApprovalRequest`, and any
  `(_response) => {}` resolve **appear only in the documentation file** — a
  full-repo search finds **zero** occurrences in AionUi or AionCore source. They
  describe a removed/older **OpenClaw WebSocket** design.
- The live OpenCode acknowledgment is a real HTTP call:
  `RemoteAgentManager::confirm` → `POST /permission/{id}/reply`
  (`agent.rs:5681`, builder `agent.rs:1086`), and `POST /question/{id}/reply`
  (`agent.rs:2984`). Proven by the server-acknowledgment tests below.

**Action taken:** corrected `remote-agent.md` F-RAGENT-11 (and Appendix C/D) to
describe the real SSE→HTTP relay and the 60s timeout, replacing the unverified
"已修复/确认" prose with a reference to this trace and the proving tests.

---

## 3. QA matrix (server-acknowledgment evidence)

Every cell asserts the **actual outbound reply POST to the OpenCode server**, not
just a UI state change. Automated cells use a `wiremock` OpenCode server that
records the reply request body — functionally identical to OpenCode's receive
endpoint, and the exact contract OpenCode acknowledges with 2xx (after which the
gateway logs `"OpenCode permission reply sent"`).

Run: `cargo test -p aionui-ai-agent --lib remote::agent` (Rust) and
`bun run test tests/unit/renderer/conversation/useWorkspaceApprovals.dom.test.ts` (UI).

| Scenario                                                   | UI trigger                                                            | Expected server acknowledgment                                                                                        | Proving test                                                                                          | Status                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Permission **allow once**                                  | "Allow once"                                                          | `POST /permission/{id}/reply` `{"reply":"once"}`                                                                      | `permission_allow_once_posts_acknowledgment_to_opencode`                                              | ✅ ack asserted                                                        |
| Permission **allow always**                                | "Always allow"                                                        | `POST …/reply` `{"reply":"always"}`                                                                                   | `permission_allow_always_posts_always_acknowledgment`                                                 | ✅ ack asserted                                                        |
| Permission **reject**                                      | "Reject"                                                              | `POST …/reply` `{"reply":"reject"}`                                                                                   | `permission_reject_posts_reject_acknowledgment`                                                       | ✅ ack asserted                                                        |
| **Trust tree** (`allow_dir`)                               | "Approve all + trust tree"                                            | `POST …/reply` `{"reply":"once"}` (blessing recorded locally; wire degrades to canonical `once`)                      | `allow_dir_blessing_acks_as_once_on_the_wire`                                                         | ✅ ack asserted                                                        |
| **Concurrent prompts**                                     | two cards, one approve + one reject                                   | two independent `POST …/reply` (`once` + `reject`)                                                                    | `concurrent_permissions_each_post_independent_acknowledgment`                                         | ✅ ack asserted                                                        |
| **Question reply**                                         | pick an option                                                        | `POST /question/{id}/reply` `{"answers":[["Postgres"]]}`                                                              | `question_reply_posts_answers_acknowledgment`                                                         | ✅ ack asserted                                                        |
| **Timeout auto-reject (60s)**                              | no response                                                           | `POST /permission/{id}/reply` `{"reply":"reject"}`                                                                    | `timeout_sweep_posts_reject_acknowledgment`                                                           | ✅ ack asserted                                                        |
| Timeout budget is 60s (not 70s)                            | —                                                                     | constant pinned                                                                                                       | `default_prompt_timeout_is_sixty_seconds_not_seventy`                                                 | ✅                                                                     |
| **Turn-boundary clear**                                    | `finish`/`error` event                                                | pending cards cleared in UI (backend already auto-rejected server-side)                                               | `useWorkspaceApprovals` finish/error tests                                                            | ✅                                                                     |
| **MCP elicitation stays inline**                           | elicitation prompt                                                    | NOT surfaced in Approvals tab                                                                                         | `useWorkspaceApprovals` exclusion test                                                                | ✅ no regression                                                       |
| **Prompt during disconnect→reconnect**                     | reconnect with pending prompt                                         | pending confirmations re-emitted on `server.connected`; reply still POSTs after answer                                | `replay_pending_confirmations_re_emits_acp_events` (re-emit) + **manual QA** for full live-server ack | ⚠️ partial-auto + manual                                               |
| **Server-tools mode reply** (live-pass failure 2026-06-09) | "Allow once" on an `external_directory` prompt, `tool_host: "server"` | `POST /permission/{id}/reply?directory=<workspace>` `{"reply":"once"}` — **scoped to the per-directory app instance** | `server_mode_permission_reply_is_directory_scoped` (strict `?directory=` matcher)                     | ❌ live FAIL → ✅ fixed, mock-proven; **pending live re-verification** |
| **Server-tools mode question reply**                       | pick an option, `tool_host: "server"`                                 | `POST /question/{id}/reply?directory=<workspace>`                                                                     | `server_mode_question_reply_is_directory_scoped`                                                      | ✅ mock-proven (fixed with the above)                                  |
| **Server-tools mode timeout reject**                       | no response, `tool_host: "server"`                                    | `POST /permission/{id}/reply?directory=<workspace>` `{"reply":"reject"}`                                              | `server_mode_timeout_sweep_reject_is_directory_scoped`                                                | ✅ mock-proven                                                         |
| **Canonical-404 fallback**                                 | any decision; canonical endpoint 404s                                 | one retry: `POST /session/{sid}/permissions/{pid}` `{"response":<decision>}`                                          | `permission_reply_404_falls_back_to_session_scoped_endpoint`                                          | ✅ mock-proven                                                         |
| **Double-404 → loud failure**                              | both endpoints 404                                                    | confirmation card re-queued (once) + dedup stamp cleared for retry; error logged — **no silent hang**                 | `permission_reply_double_404_requeues_confirmation`                                                   | ✅ mock-proven                                                         |

### Mock-proven vs live-proven

All ✅ rows above are **mock-proven** (wiremock asserts the wire contract
AionCore emits). The 2026-06-09 live pass demonstrated the limit of
mock-proof: the original 8 ack tests used `tool_host: "local"` and matched
whatever path AionCore called — they pinned AionCore's belief, **not** the
server's contract. In server-tools mode the real server stores permissions in
a per-directory app instance, so the unscoped reply 404'd
(`PermissionNotFoundError`) and the conversation hung. The new server-mode
tests use a strict `?directory=` query matcher so an unscoped reply can no
longer pass. **Live-proven** so far: local tool-host mode only (earlier live
pass). Server-tools mode is fixed and mock-proven but **awaits a live re-run**
(see Phase-1 report).

### Known coverage gaps (carried into the report)

1. **Live-server end-to-end ack** — automated cells assert against a mock
   OpenCode server. A single manual run against a real remote OpenCode server is
   still recommended to confirm OpenCode's own 2xx semantics for each verb.
   **Server-tools mode specifically requires a live re-verification after the
   2026-06-09 directory-scoping hotfix.**
2. **`allow_dir` sibling-drain ack** — the `once`-degradation is asserted; the
   multi-prompt _drain_ (auto-POST of descendant prompts) is exercised in
   `confirm` but not yet asserted at the wire level for N>1 descendants.
3. **Reconnect ack** — re-emit on reconnect is tested; the reply landing after a
   reconnect needs the manual live-server pass.

---

## 4. How to reproduce the acknowledgment proof locally

```bash
# AionCore — server-acknowledgment + timeout + question relay
cd /Users/matt/chisl-full/AionCore
cargo test -p aionui-ai-agent --lib remote::agent

# AionUi — turn-boundary clear + MCP-elicitation exclusion
cd /Users/matt/chisl-full/AionUi
bun run test tests/unit/renderer/conversation/useWorkspaceApprovals.dom.test.ts
```
