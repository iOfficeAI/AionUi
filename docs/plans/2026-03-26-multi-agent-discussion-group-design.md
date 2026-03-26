# Design: Multi-Agent Discussion Group

**Date:** 2026-03-26
**Status:** Proposed

## Background

AionUi already has strong building blocks for heterogeneous agent access:

- `src/process/agent/*` and `src/process/task/*` support multiple runtime backends.
- `src/process/agent/acp/AcpDetector.ts` discovers built-in CLIs, custom agents, preset assistants, and extension-contributed adapters.
- `src/renderer/pages/conversation/utils/createConversationParams.ts` can already create conversations for CLI agents and preset assistants.
- `src/process/bridge/conversationBridge.ts` provides one unified `conversation.sendMessage` pipeline.
- `src/common/chat/chatLib.ts` and the database layer store message content as JSON, which is flexible enough to carry extra metadata.

However, the current product model is still:

`one conversation -> one runtime task -> one agent reply stream`

That means AionUi supports "many agents to choose from", but not "many agents collaborating inside one session".

This gap shows up most clearly in discussion-style use cases:

- ask several agents for independent takes
- let them react to one another
- run two rounds of debate, then synthesize
- let the user interrupt mid-discussion and redirect

## Current Constraints

The existing codebase has several hard constraints that should shape the design.

### 1. Conversation and runtime are tightly coupled today

`conversation.sendMessage` in `src/process/bridge/conversationBridge.ts` resolves exactly one
`conversation_id`, then exactly one task from `workerTaskManager`, then calls exactly one
`task.sendMessage(...)`.

### 2. `AgentType` currently implies "conversation type"

`CreateConversationParams.type` and `TChatConversation.type` assume every conversation is backed by
an agent runtime (`gemini`, `acp`, `codex`, `openclaw-gateway`, `nanobot`).

A discussion group breaks that assumption. A group is a coordinator, not a runtime backend.

### 3. Existing "multi-agent" wording already means something else

`src/renderer/hooks/agent/useMultiAgentDetection.tsx` uses "multi-agent mode" to mean "more than one
detected ACP agent exists on this machine". That is a discovery notice, not a collaboration model.

Product naming should avoid reusing that term for the new feature.

### 4. Concurrent tool execution is risky

Many current agents can read files, call tools, and write to workspaces. Letting several agents act
on the same workspace at the same time would create approval spam, file conflicts, and low-trust
behavior.

For v1, the feature should optimize for discussion and decision support, not multi-agent file
execution.

## Goal

Add a first-class "discussion group" session model that lets a user assemble several existing
assistants into one collaborative room, with configurable interaction patterns.

The feature must:

- reuse existing assistant definitions, including prompt/rules, enabled skills, enabled hooks, and description
- preserve independent first-round reasoning
- support controlled cross-agent exchange in later rounds
- let the user interrupt at any time with highest priority
- fit into the existing conversation history and renderer shell

## Non-Goals

The first version should not try to solve all of the following:

- multiple agents editing the same workspace concurrently
- token-by-token live cross-agent streaming
- autonomous infinite agent-to-agent conversations
- turning group definitions into another flavor of `acp.customAgents`
- replacing the existing single-agent conversation flow

## Product Model

Two concepts must stay separate:

### Assistant

An assistant is a reusable identity already defined in the current system. It may be:

- a preset assistant
- a custom ACP agent
- an extension-contributed assistant

An assistant may already carry:

- name and avatar
- description
- preset context / rules
- enabled skills
- enabled hooks
- preferred backend routing

This should be the primary unit that users add into a discussion group.

### Runtime backend

A runtime backend is the lower-level execution target:

- Gemini
- ACP-routed Claude / Codex / Qwen / other CLI backends
- OpenClaw
- NanoBot

This should remain an implementation detail behind the assistant whenever possible.

### Discussion Group

A discussion group is a session-level orchestration object that references several existing
assistants and coordinates their turns.

This is new and should not be stored as another assistant definition.

If reusable presets are needed later, add **group templates**, not fake assistants.

## Assistant-First Requirement

The discussion group should be **assistant-first**, not **CLI-first**.

That means:

- the main participant picker should list current system-defined assistants first
- the group stores references to assistants, not only raw backend names
- each participant should inherit the assistant's rules, skills, hooks, avatar, and description
- adding a raw detected CLI should be an advanced fallback, not the primary interaction

This matters because a bare CLI only gives transport/runtime identity. It does not give the richer
product-level semantics that make a participant feel like a real role in a discussion.

In AionUi today, those richer semantics already live in assistant definitions and assistant-related
resources, so the group feature should build on that layer.

## Recommended Interaction Modes

The product should support three modes, but only one should be the default.

| Mode      | Behavior                                                                  | Best for                               | Risk                                       |
| --------- | ------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------ |
| Broadcast | User prompt fan-outs to all participants independently                    | Quick multi-angle collection           | No real interaction between agents         |
| Relay     | Agents speak in order; later agents see selected earlier outputs          | Brainstorming, divergence, role-play   | Later agents are strongly biased           |
| Debate    | Round 1 independent; Round 2 sees condensed peer outputs; then synthesize | Decisions, comparison, critical review | More orchestration complexity, but best UX |

### Default recommendation

The default group mode should be:

`Debate (2 rounds) + Synthesizer`

That gives the best balance:

- first round stays independent
- second round allows real collision
- final summary is easier to consume than reading every branch

## Core Decisions

| Question                    | Decision                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Product name                | Use `Discussion Group` or `Agent Group`, not `multi-agent mode`                          |
| Top-level model             | Add a new parent conversation kind for groups                                            |
| Primary participant unit    | Assistant, not raw CLI backend                                                           |
| Participant execution model | Reuse existing child conversations and existing agent runtimes                           |
| Default safety policy       | Discussion-first, no participant tool execution in v1                                    |
| User interruption           | Highest priority; interrupts all active participant turns and restarts the current stage |
| Visibility model            | Parent group timeline is primary; child conversations are hidden by default              |

## Proposed Architecture

### Summary

Use a **parent group conversation** that owns several **hidden child conversations**.

- The parent conversation is what the user opens and reads.
- Each participant gets its own child conversation using the existing runtime stack.
- A new orchestrator coordinates fan-out, stage transitions, interruption, and summary.

This design reuses current code much better than trying to make one conversation host several
worker tasks directly.

## Why parent + child conversations is the right fit

### Reuses the existing runtime boundary

Each existing agent already expects:

- one `conversation_id`
- one workspace/session state
- one persisted message stream

Child conversations preserve that model.

### Avoids rewriting `WorkerTaskManager`

`WorkerTaskManager` remains responsible only for agent-backed conversations. The new group layer
coordinates child conversations above it instead of forcing multi-runtime semantics into a
single task cache.

### Keeps per-agent continuity

A participant can preserve:

- backend-specific session IDs
- assistant-level rules/context
- enabled skills
- enabled hooks
- assistant identity in UI
- model/session mode
- runtime-specific status

without inventing a new multi-runtime protocol.

## Required Type Split

The current code conflates "agent runtime type" and "conversation type". The group feature should
split them:

```typescript
type AgentType = 'gemini' | 'acp' | 'codex' | 'openclaw-gateway' | 'nanobot';
type ConversationType = AgentType | 'group';
```

After this split:

- `WorkerTaskManager` stays keyed by `AgentType`
- group conversations are handled by the orchestrator, not by the worker task manager

This is the cleanest architectural seam for the feature.

## Data Model

### Parent group conversation

Add `'group'` to `TChatConversation['type']`.

Suggested `extra` shape:

```typescript
type GroupMode = 'broadcast' | 'relay' | 'debate';

type GroupParticipantRef = {
  id: string;
  label: string;
  source: 'assistant' | 'detected-agent';
  assistantId?: string;
  assistantKind?: 'preset' | 'custom' | 'extension';
  description?: string;
  backend?: string;
  customAgentId?: string;
  presetAgentType?: string;
  avatar?: string;
  childConversationId?: string;
  rolePrompt?: string;
  order: number;
};

type GroupConversationExtra = {
  mode: GroupMode;
  participants: GroupParticipantRef[];
  synthesizerParticipantId?: string | 'system';
  rounds: {
    independent: number;
    exchange: number;
  };
  toolPolicy: 'disabled' | 'executor-only';
  interruptPolicy: 'cancel-and-restart';
  hiddenChildConversationIds: string[];
  currentTurnId?: string;
  currentStage?: 'idle' | 'independent' | 'exchange' | 'summary' | 'interrupted';
  workspace?: string;
  debugChildThreads?: boolean;
};
```

### Child conversation metadata

All existing conversation variants should gain optional group-scoped metadata in `extra`:

```typescript
type GroupLinkMeta = {
  parentGroupId?: string;
  groupParticipantId?: string;
  hiddenFromHistory?: boolean;
};
```

This lets the app:

- hide participant threads from the regular sidebar by default
- reopen raw participant threads for debugging if needed
- trace a parent message back to the originating child session

### Message metadata

Do not create a separate message table for group transcripts in v1.

Instead, extend the base message shape with optional metadata:

```typescript
type GroupMessageMeta = {
  groupId: string;
  participantId?: string;
  participantName?: string;
  participantAvatar?: string;
  sourceConversationId?: string;
  round: number;
  phase: 'independent' | 'relay' | 'exchange' | 'summary' | 'interrupt' | 'system';
  replyToParticipantIds?: string[];
};

interface IMessage<...> {
  ...
  meta?: {
    group?: GroupMessageMeta;
  };
}
```

This fits the current storage model because message content is already JSON-serialized.

## Orchestration Flow

### Turn lifecycle

For the default debate mode:

1. User sends a message to the parent group conversation.
2. Group orchestrator creates a new `turnId` and marks stage `independent`.
3. The prompt is sent to each child conversation independently.
4. Each child completes its first-round response.
5. The orchestrator projects each response into the parent timeline as a participant message.
6. The orchestrator builds an exchange prompt for each participant using condensed peer outputs.
7. Second-round responses are collected and projected into the parent timeline.
8. A synthesizer emits the final consolidated answer.

### Cross-agent visibility rules

### Broadcast mode

- participants only see the user prompt
- they do not see peer outputs

### Relay mode

- participant `n` sees the user prompt plus selected outputs from participants `1..n-1`

### Debate mode

- round 1: no peer visibility
- round 2: each participant sees a compact digest of peer outputs, not the full raw streams

This is important. Full raw cross-feeding will create context bloat and bias the discussion too
early.

## User interruption

If the user speaks while a group turn is running:

1. mark the parent turn as interrupted
2. call `stop()` on all active child tasks
3. append a parent-level interrupt/system message
4. start a new turn from the user message

User interjection should always win over group autonomy.

## Safety Policy

### V1 policy

Participant agents should run in discussion mode only:

- no tool execution
- no file writes
- no workspace mutation

If an agent still tries to issue tool requests, the orchestrator should reject them or mark the
participant turn as unsupported under current group policy.

### Why this matters

The existing product is optimized for one active runtime with approvals. Multiplying tool requests
by three or four participants will immediately degrade UX and trust.

### Follow-up model

If execution is needed later, support:

- `executor-only` policy
- exactly one designated execution agent
- other participants remain advisory only

That can become phase 2 or phase 3.

## Renderer Design

### Entry point

The group feature should be created from the conversation creation flow, not from the agent settings
page.

Reason:

- assistants are reusable identities
- groups are session-level compositions

The user should be able to:

- create a new discussion group
- pick participants primarily from the assistant list already exposed by the current system
- optionally expand an "advanced" section to add a raw detected CLI when no assistant wrapper exists
- choose mode and round count
- optionally choose a synthesizer

### Participant picker behavior

Recommended ordering:

1. preset assistants
2. custom assistants
3. extension assistants
4. advanced: raw detected CLIs

Each selectable assistant item should show:

- avatar
- name
- description
- backend badge
- skills/hook summary when available

This is more aligned with the current product than exposing low-level backends first.

### Main UI shape

The primary UI should remain a **single chat timeline**, not a permanent split-screen of multiple
subthreads.

Recommended elements:

- group header with participant chips
- mode badge (`Broadcast`, `Relay`, `Debate`)
- stage/round indicator
- parent timeline messages annotated with participant avatar/name
- optional "View raw thread" action per participant message

This fits the current conversation shell much better than trying to place three or four parallel
chat panes into the existing layout.

### Why not use a multi-column layout by default

- current message list and workspace layout are optimized for one column
- mobile behavior would become poor immediately
- the user usually wants one readable synthesis timeline, not four active transcripts at once

Per-participant raw threads should be secondary diagnostics, not the main surface.

## Naming note

The existing `useMultiAgentDetection.tsx` should eventually be renamed to something like
`useAvailableAgentNotice` or `useMultipleDetectedAgentsNotice` so that "discussion group" can own
the collaboration concept cleanly.

## Proposed File Impact

### Files to Modify

| File                                                              | Change                                                                                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/common/config/storage.ts`                                    | Widen `TChatConversation` to include `'group'`; add group extra metadata; add optional group link metadata on child conversations |
| `src/process/task/agentTypes.ts`                                  | Split `AgentType` from a wider conversation kind/type abstraction                                                                 |
| `src/process/services/IConversationService.ts`                    | Accept group conversation creation without pretending it is an agent runtime                                                      |
| `src/process/services/ConversationServiceImpl.ts`                 | Create and persist parent group conversations; create hidden child conversations; skip worker factory for parent group            |
| `src/common/adapter/ipcBridge.ts`                                 | Add typed IPC for creating/running/interruption of discussion groups                                                              |
| `src/process/bridge/conversationBridge.ts`                        | Route `group` conversations to the orchestrator instead of `workerTaskManager.getOrBuildTask(...)`                                |
| `src/common/chat/chatLib.ts`                                      | Add optional message-level group metadata and renderer transform support                                                          |
| `src/renderer/pages/conversation/components/ChatConversation.tsx` | Render a group chat implementation when `conversation.type === 'group'`                                                           |
| `src/renderer/pages/conversation/Messages/MessageList.tsx`        | Display participant identity badges and group stage markers                                                                       |
| `src/renderer/hooks/assistant/useAssistantList.ts`                | Reuse assistant list as the primary participant source for group creation                                                         |
| `src/renderer/pages/conversation/hooks/useConversationAgents.ts`  | Keep raw detected CLIs as an advanced fallback source                                                                             |

### Files to Create

| File                                                                    | Purpose                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/process/bridge/services/discussion/DiscussionOrchestrator.ts`      | Parent coordinator for turns, stages, interruption, and child runtime dispatch |
| `src/process/bridge/services/discussion/DiscussionPromptBuilder.ts`     | Build first-round, relay, debate, and synthesizer prompts                      |
| `src/process/bridge/services/discussion/DiscussionProjector.ts`         | Project child outputs into parent timeline messages                            |
| `src/renderer/pages/conversation/group/index.tsx`                       | Group conversation entry module                                                |
| `src/renderer/pages/conversation/group/GroupChat.tsx`                   | Parent group chat UI                                                           |
| `src/renderer/pages/conversation/group/components/GroupHeader.tsx`      | Participant chips, mode badge, stage indicator                                 |
| `src/renderer/pages/conversation/group/components/CreateGroupModal.tsx` | Session-level group creation flow                                              |

### Placement Notes

- `src/renderer/pages/conversation/` currently has room for one more direct child directory, so
  `group/` fits the repository rule better than adding more files to existing overloaded
  subdirectories.
- `src/process/bridge/services/` currently has headroom and is a better fit for the discussion
  runtime coordinator than further increasing the already crowded `src/process/services/` root.

## Rejected Approaches

### 1. Broadcast-only implementation

Rejected as the primary design because it is not actually a discussion model. It is only parallel
sampling.

Useful as one supported mode, but not enough as the core feature.

### 2. One conversation directly owns multiple worker tasks

Rejected because it fights the current architecture:

- task cache is keyed to one conversation
- message flow is keyed to one `conversation_id`
- approval/status handling assumes one active runtime identity

Parent + hidden child conversations is much more compatible with the current system.

### 3. Model the group as another assistant in `acp.customAgents`

Rejected because assistant definitions describe a single runtime identity, while a discussion group
is a session-level orchestration recipe.

This distinction should remain explicit.

### 4. Make raw CLIs the main participant type

Rejected for the main product flow because it throws away the most valuable semantics already
present in AionUi assistants:

- role/prompt packaging
- skill combinations
- hooks
- richer naming and descriptions

Raw CLI participants can remain as an advanced escape hatch, but they should not define the
default UX.

## Rollout Plan

### Phase 1: MVP discussion groups

- add parent group conversation type
- create hidden child conversations
- support `broadcast`
- support `debate` with exactly two rounds
- project only final child text into the parent timeline
- disable participant tools
- allow user interruption

This phase already solves the main product problem.

### Phase 2: Better visibility and usability

- participant role prompts
- relay mode
- optional raw child thread viewer
- per-participant status chips in header
- saved group templates

### Phase 3: Controlled execution

- `executor-only` tool policy
- promote one participant into execution mode
- allow "continue with this participant" or "fork summary into single-agent chat"

## Recommendation

Build the feature as a **new conversation kind with a parent orchestrator and hidden child
conversations**.

Do not try to retrofit collaboration into the existing single-task conversation path.

Do not model the group as a fake assistant.

Default to **debate mode with two rounds and a synthesizer**, and keep v1 discussion-only. That
matches the user mental model, minimizes architectural churn, and avoids the worst safety and
workspace-collision problems on the first release.
