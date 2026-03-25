# Assistant Hooks Foundation

## Background

AionUi already supports assistant-level rules and skills, but it does not yet provide a productized runtime hook system. Today the relevant pieces are split:

- Assistant rules are stored as assistant-scoped markdown resources and injected into the session prompt.
- Skills are either injected into the prompt or materialized into the workspace for native CLI discovery.
- Extension lifecycle hooks exist, but they are not agent runtime hooks.

This document defines the first implementation stage for assistant hooks.

## Scope

Phase 1 introduces the configuration and resource foundation required for assistant hooks:

- Add assistant-level hook selection (`enabledHooks`)
- Add a shared hook manifest type
- Add a user hook storage directory
- Add IPC and fs bridge support for listing available hooks
- Add settings UI to view and select hooks per assistant
- Pass selected hooks through conversation creation so later runtime work can consume them

Phase 1.5 adds the first runtime slice:

- Support `prompt-transform` hooks on `before_user_prompt`
- Execute them in the unified main-process send pipeline
- Preserve the original user message in chat history while only transforming the agent-facing prompt

Out of scope for this phase:

- General shell/js hook execution during agent runtime
- Native hook config projection into Claude / Gemini / Copilot / OpenClaw workspaces
- Hook import/export UI
- Hook sandboxing and approval policy

## Resource Model

Each hook is represented as a directory under the user hook directory:

```text
config/hooks/<hook-name>/
├── manifest.json
├── before_user_prompt.md
└── ...
```

`manifest.json` is the only file required in Phase 1.
`before_user_prompt.md` or `prompt.md` is required for the Phase 1.5 runtime slice.

Example:

```json
{
  "name": "prompt-guard",
  "description": "Validate prompts before they are sent.",
  "version": "0.1.0",
  "executionType": "prompt-transform",
  "events": ["before_user_prompt"],
  "supportedBackends": ["claude", "gemini", "codex", "openclaw-gateway"]
}
```

Example `before_user_prompt.md`:

```md
[Safety Review]
Check whether the following request is missing constraints, edge cases, or success criteria.

[User Request]
{{userPrompt}}
```

## Data Flow

Assistant settings:

```text
Assistant settings drawer
-> ConfigStorage(acp.customAgents[].enabledHooks)
-> Guid page resolves preset assistant resources
-> conversation.create(extra.enabledHooks)
-> conversation persisted to database
-> conversation.sendMessage(raw input)
-> AssistantHookRuntime applies before_user_prompt prompt-transform hooks
-> agent receives transformed prompt
```

## Type Model

Phase 1 adds:

- `HookEventType`
- `HookExecutionType`
- `HookManifest`

Assistant config adds:

- `enabledHooks?: string[]`

Conversation extra adds:

- `enabledHooks?: string[]`

Phase 1.5 runtime convention:

- `executionType` must be `prompt-transform`
- `events` must include `before_user_prompt`
- Template file lookup order is `before_user_prompt.md` then `prompt.md`
- Supported template variables:
  - `{{userPrompt}}`
  - `{{conversationId}}`
  - `{{workspace}}`
  - `{{agentType}}`
  - `{{backend}}`
  - `{{hookName}}`
  - `{{timestamp}}`

## Bridge Additions

`ipcBridge.fs` gains:

- `listAvailableHooks`

The bridge enumerates `config/hooks/*/manifest.json` and returns validated metadata for settings UI.

## UI

The assistant edit drawer gets a hook section that:

- lists all discovered hooks
- lets the user enable or disable hooks for the current assistant
- keeps the first release simple by avoiding hook import and advanced editing

## Follow-up Phases

### Phase 2: Managed Runtime Hooks

Add a main-process `HookRuntime` with normalized events:

- `session_start`
- `before_user_prompt`
- `after_user_prompt`
- `before_tool_use`
- `after_tool_use`
- `before_response`
- `after_response`
- `session_end`

### Phase 3: Native Hook Projection

For backends with native hook systems, materialize assistant hook config into workspace-native files:

- Claude Code
- Gemini CLI
- Copilot coding agent
- Qoder
- OpenClaw

### Phase 4: Security and Distribution

- shell/js execution policy
- hook import/export
- hook compatibility matrix
- assistant-level hook diagnostics
