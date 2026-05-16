# Runtime Console Noise and Chat Stability PR Notes

## Goal

Prepare a focused PR to reduce runtime console noise and improve chat view stability when using ACP-based agents.

## User-visible symptoms

- DevTools is flooded by repeated `react-virtuoso: Zero-sized element, this should not happen` errors.
- `transformMessage` repeatedly warns about unsupported `slash_commands_updated` messages.
- Notification click handler registration logs appear multiple times.
- SendBox and storage initialization logs appear in normal app usage.
- ACP request traces show long waits followed by `429 Rate limit exceeded` or `Prompt timed out`.
- Persisted model selection may be cleared with `Persisted model ... is not in available models, clearing`.

## Current evidence

| Symptom                              | Likely source                                                | Notes                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `react-virtuoso: Zero-sized element` | `src/renderer/pages/conversation/Messages/MessageList.tsx`   | `Virtuoso` renders `processedList`; some message types can render no visible content.                    |
| Unsupported `slash_commands_updated` | `src/common/chat/chatLib.ts`                                 | `transformMessage` only ignores `available_commands`, `acp_model_info`, `request_trace`, etc.            |
| Notification registration logs       | `src/renderer/hooks/system/useNotificationClick.ts`          | The hook logs each effect registration. React StrictMode or layout remounts can repeat this.             |
| `[sendbox] Object`                   | `src/renderer/components/chat/sendbox.tsx`                   | Submit and blocked-while-loading paths use `console.info`.                                               |
| `build.buildStorage ...`             | `src/common/config/storage.ts` through `@office-ai/platform` | App constructs storage namespaces at startup; log likely comes from the platform storage implementation. |
| Persisted model clearing             | `src/process/task/AcpAgentManager.ts`                        | Current behavior clears a saved model when it is absent from available models.                           |
| Synthetic finish and request timeout | `src/process/task/AcpAgentManager.ts`                        | Fallback finish protects the UI, but API errors should still be surfaced clearly.                        |

## Problem classification

### 1. High priority: Virtuoso zero-sized items

This is the most disruptive issue because it repeats heavily and can hide real errors.

Suspected causes:

- `MessageItem` returns `null` for `codex_permission`, while `processedList` still includes the item.
- Other transient or non-display message types may enter `processedList` and render to an empty wrapper.
- The `Virtuoso` container depends on `flex-1 h-full`; if an ancestor temporarily has zero height during layout changes, measurement warnings can multiply.

Proposed fix:

1. Filter non-rendered message types before passing data to `Virtuoso`, not inside `MessageItem`.
2. Add a typed `isDisplayableMessage` helper next to `processedList` logic.
3. Treat `codex_permission`, `available_commands`, and command-update events as transient/non-list items unless a visible renderer exists.
4. Ensure the message list flex chain has `min-h-0` and stable height where `MessageList` is embedded.
5. Add a regression test for `processedList` or a small extracted helper so non-display messages cannot become zero-height rows.

Acceptance criteria:

- Sending messages with hidden, permission, and slash-command update events does not trigger Virtuoso zero-size warnings.
- Normal text, tool calls, plans, thinking, cron triggers, and skill suggestions still render.
- Auto-scroll and jump-to-message behavior still work.

### 2. High priority: ACP slash-command update normalization

`slash_commands_updated` is a protocol/control event, not a chat message. It should not reach generic chat rendering as an unsupported message.

Proposed fix:

1. Normalize `slash_commands_updated` in the ACP manager/adapter layer to the existing `available_commands` flow, or explicitly consume it there.
2. If renderer compatibility is needed, add it to the ignored transient cases in `transformMessage` with a comment explaining why.
3. Add a test that verifies `slash_commands_updated` does not log a warning and does not persist as a visible chat item.

Acceptance criteria:

- No `[transformMessage] Unsupported message type 'slash_commands_updated'` warning.
- Slash command data still reaches any command UI that needs it.
- Chat history does not contain command-update noise.

### 3. Medium priority: remove production console noise

Several logs are useful during development but noisy for users and PR validation.

Proposed fix:

1. Replace `console.log/info` in `useNotificationClick` and SendBox submit paths with a gated debug logger, or remove them.
2. Keep meaningful warnings only when user action is required.
3. Check whether `@office-ai/platform` storage logging can be gated by environment. If it is external and cannot be changed here, document it as an upstream dependency issue.
4. Avoid logging full payload objects in routine flows.

Acceptance criteria:

- Startup and normal send flow do not print `build.buildStorage`, `[sendbox]`, or notification registration logs in production builds.
- Actual errors and actionable warnings are preserved.

### 4. Medium priority: persisted model fallback UX

Current clearing behavior is reasonable when a saved model disappears, but it can repeat and confuse users.

Proposed fix:

1. Clear unavailable persisted models only after the current model list is known to be complete.
2. Surface a concise user-facing notice once, not repeated console warnings.
3. Persist the fallback decision so the same missing model is not cleared/logged every session.
4. Consider keeping the previous model as a disabled option in settings for visibility.

Acceptance criteria:

- Missing saved model falls back to default once.
- User can understand why the model changed.
- Console is not repeatedly noisy across sessions.

### 5. Medium priority: API rate limit and timeout clarity

The `429 Rate limit exceeded` and `Prompt timed out` events are backend/service failures, not necessarily UI bugs. The UI should recover predictably and show actionable feedback.

Proposed fix:

1. Map ACP request errors into a user-visible error message with provider, model, and retry guidance.
2. Ensure loading state ends after rate-limit or timeout failure.
3. Preserve `RequestTrace` logs behind a debug channel, not noisy normal console output.
4. Consider detecting `429` specifically and showing a retry-after/backoff hint if available.

Acceptance criteria:

- Rate limit and timeout failures end the active turn cleanly.
- User sees a clear message instead of only DevTools output.
- The conversation remains usable after the failure.

## Suggested implementation order

1. Fix `MessageList` display filtering and layout stability for Virtuoso.
2. Normalize or ignore `slash_commands_updated` before generic message transformation.
3. Remove or gate routine debug logs in renderer code.
4. Improve persisted model fallback messaging.
5. Improve ACP request error surfacing and debug trace gating.

## Test plan

- Unit test `transformMessage` with transient events: `slash_commands_updated`, `available_commands`, `request_trace`.
- DOM test `MessageList` with non-display messages to ensure no empty Virtuoso rows are produced.
- DOM test notification hook registration cleanup if a helper is extracted.
- Manual test with ACP Claude backend:
  - Open an existing conversation.
  - Send a prompt that triggers slash command updates.
  - Trigger a rate limit or use a mocked failing provider.
  - Verify the chat remains responsive and DevTools is not flooded.

## PR description draft

This PR reduces noisy runtime console output and prevents non-display ACP/control messages from destabilizing the chat virtualized list. It filters transient messages before `Virtuoso`, normalizes slash-command update events, and gates routine debug logs so real errors remain visible.

## Open questions

- Does any UI currently depend on raw `slash_commands_updated`, or should all command updates use the existing `available_commands` path?
- Is `build.buildStorage` emitted by `@office-ai/platform`, and can the dependency be updated or configured to silence startup debug logs?
- Should unavailable persisted models be shown in settings as disabled selections, or silently replaced by default after one notice?
