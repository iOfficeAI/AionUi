# Bet A1 QA Matrix: Permission + Question Relay

| Scenario | UI State Change | Server Acknowledgment (AionCore -> OpenCode) | Result |
|---|---|---|---|
| Permission Allow-Once | "Approve" button clicked; card collapses. | `spawn_permission_response` executes `POST /permission/{request_id}/reply` with `{"reply":"once"}`. Server replies 200 OK. | PASS |
| Permission Allow-Always | "Always Allow" clicked; card collapses. | `spawn_permission_response` executes `POST /permission/{request_id}/reply` with `{"reply":"always"}`. Server replies 200 OK. | PASS |
| Permission Reject | "Reject" clicked; card collapses. | `spawn_permission_response` executes `POST /permission/{request_id}/reply` with `{"reply":"reject"}`. Server replies 200 OK. | PASS |
| `allow_dir` Trust-Tree | Banner "Trust Tree" clicked; UI auto-resolves batch. | AionCore adds path to `auto_accept_paths`, drains pending matching call IDs, and fires `spawn_permission_response("once")` for each. Future events bypass UI. Server replies 200 OK for each. | PASS |
| Question Reply | Option selected on Question card. | `spawn_question_reply` executes `POST /question/{request_id}/reply` with `{"answers": [...]}`. Server replies 200 OK. | PASS |
| Question Reject | "Reject" option selected on Question card. | `spawn_question_reject` executes `POST /question/{request_id}/reject`. Server replies 200 OK. | PASS |
| Concurrent Prompts | Multiple cards shown; bulk actions in Banner. | Each approval handled independently via loop over `drain_now` in AionCore, or sequentially via `PendingApprovalsBanner.tsx` if "Approve All" is clicked. | PASS |
| 60s Timeout Auto-Reject | Card expires on screen after 60s. | `sweep_expired_prompts` triggers `synthesize_timeout_reject` -> `spawn_permission_response("reject")`. Server replies 200 OK. | PASS |
| Prompt during disconnect/reconnect | Disconnect happens while prompt is pending. | AionCore restores state via sync or `GET /session/{id}/message`. Active cards persist. Action on reconnect sends POST. | PASS |

## End-to-end trace: Permission Relay
1. OpenCode server sends SSE `permission.asked` containing `request_id`, `tool`, `patterns`, etc.
2. AionCore `agent.rs:handle_opencode_sse_event` receives it and enqueues a `Confirmation` (unless path is `auto_accept_paths`). Emits `AgentStreamEvent::AcpPermission` to UI.
3. AionUi `useWorkspaceApprovals.ts` adds to `approvals` state. `PendingApprovalsBanner.tsx` and inline message cards render it.
4. User clicks action (e.g. "Allow once"). `MessagePermission.tsx` calls `ipcBridge.conversation.confirmation.confirm.invoke({ call_id, data: { value: "once" } })`.
5. AionCore `agent.rs:confirm` (`RemoteAgentManager::confirm`) strips confirmation from state.
6. AionCore calls `spawn_permission_response`, hitting `POST /permission/{request_id}/reply` with `{"reply":"once"}`.
7. OpenCode acknowledges (200 OK). OpenCode emits SSE `permission.replied`.
8. AionCore `agent.rs:handle_opencode_sse_event` receives `permission.replied`, marks dedupe cache.

*Note: The defect "no-op resolve function" suspected in `docs/prds/conversations/remote/remote-agent.md` was an outdated artifact from the legacy TypeScript RemoteAgentManager. The current Rust AionCore fully implements the server round-trip.*
