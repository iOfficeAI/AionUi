# User Feedback DB Diagnostics

Status: Draft
Date: 2026-07-07

## Goal

User feedback in Sentry already includes `type=user-feedback`, selected module, description, logs, and screenshots. Real feedback samples show that this is often insufficient for conversation/model/team issues: logs can say a turn failed, but not always show the final persisted conversation state, message status, selected provider/model, ACP session config, or team backlog.

The diagnostic attachment should add a small, privacy-safe database snapshot to feedback reports. It must not upload the SQLite DB file, arbitrary SQL results, prompts, message content, provider API keys, or raw error messages.

## Ownership

AionUi owns only feedback orchestration:

- capture `route_at_open` and `route_at_submit`
- send the user-selected module
- send explicit safe IDs from the feedback entry point, such as `conversation_id`, `provider_id`, `team_id`, `agent_id`, or `mcp_server_id`
- call aionCore `GET /api/system/diagnostics/feedback-report`
- attach the returned JSON as `db-diagnostics.json.gz` when gzip is available, otherwise `db-diagnostics.json`

aionCore owns all diagnostic logic:

- route/module/profile resolution
- unioning route-derived profiles, module-derived profiles, and explicit profiles
- SQL selection
- user isolation
- redaction and field allowlisting
- response schema

AionUi main process must not read SQLite or expose `feedback:collect-db-diagnostics`.

## Profile Resolution

Route context is more trustworthy than the selected module because the user can choose the wrong module. The selected module is still useful user intent. aionCore must use the union of:

- route at submit
- route at open
- selected module
- explicit profile hints
- `global-summary`

Example: if the feedback is opened on `#/conversations/conv-1` and the user selects `system-settings`, the attachment should include at least `conversation-session`, `model-auth`, `mcp-tools`, and `global-summary`.

## Current aionCore Profiles

### `conversation-session`

Detailed key: `conversation_id`

Useful for cases seen in Sentry:

- provider auth failures where logs show `UserLlmProviderAuthFailed`
- OpenCode mode/model confirmation timeouts
- turns that finish with empty or hidden output
- image/file input complaints where message metadata and attachment counts matter

Allowed output:

- current conversation id/title/type/status/source/model provider id/model id/timestamps/name length
- recent conversations in the same user scope near the reported conversation, currently a 24 hour window capped at 20 rows, with titles, ids, status, model/provider ids, message counts, and latest error code
- message counts by type/status/hidden
- recent message metadata: id, msg id, type, status, position, content byte length, text length, attachment/image/tool-call counts
- recent error metadata: error code, ownership, retryable, resolution kind/target, feedback recommended
- ACP session metadata: agent id/source/status, session id presence, runtime current mode/model, non-secret config selection values such as mode/model/effort
- agent metadata counts: available mode/model/command/config option counts, last check status/error code
- assistant snapshot metadata and array counts

Never output raw `messages.content`, prompts, raw `session_config`, `rules_content`, provider API keys, or raw error messages.

### `model-auth`

Detailed key: `provider_id`, or derived from `conversation_id`

Allowed output:

- provider id/platform/name/enabled
- `api_key_configured` boolean
- base URL host only
- model count, disabled model count, unhealthy model count
- capability count and timestamps

Never output `api_key_encrypted`, full URLs, URL query strings, bearer tokens, or Bedrock config.

### `agent-team`

Detailed key: `team_id`, or derived from `conversation_id`

Allowed output:

- team id, name length, workspace mode, session mode, agent count, lead agent id, agents version, timestamps
- task counts by status
- mailbox counts by type/read state

Never output workspace absolute paths, task subject/description, mailbox content, or mailbox summary.

### `mcp-tools`

Detailed key: `mcp_server_id`

Allowed output:

- server id/name/enabled/builtin/transport type
- tool count
- last test status and last connected timestamp
- transport config byte length and original JSON byte length

Never output raw transport config, original JSON, headers, env values, or tokens.

### `global-summary`

Always included as low-cost context.

Allowed output:

- conversation count for current user
- message count for current user's conversations
- provider count
- agent count
- active MCP server count

## Privacy Requirements

The response should preserve diagnostic value while excluding the few categories that create real privacy or credential risk:

- no raw DB file
- no arbitrary frontend SQL
- no `providers.api_key_encrypted`
- no `users.password_hash`, `users.jwt_secret`, or `users.email`
- no OAuth or remote-agent tokens
- no raw prompt/message content
- no raw error messages
- no full URL with userinfo/query string

Conversation titles are allowed because they are needed to correlate the database snapshot with the screenshot and Sentry feedback. They are not separately redacted for generic `sk-...`, `token`, or `bearer` string shapes.

The aionCore response includes a `privacy` block:

```json
{
  "raw_content_included": false,
  "api_keys_included": false
}
```

Tests must assert that representative provider API keys, encrypted provider keys, raw prompt text, and raw error messages do not appear in the serialized diagnostics response.
