# Wake Prompt Optimization — Design Spec

**Goal:** Reduce token waste in team agent wake cycles by eliminating redundant static prompts, adding event-specific framing for high-value internal events, and fixing MCP handler notification gaps.

## Background

Every time `TeammateManager.wake()` is called, it builds a full role prompt (static instructions + dynamic state) and sends it as a user message into the agent's conversation. Over multiple wake cycles, the conversation accumulates duplicate copies of the same static rules (~83% of lead prompt, ~67% of teammate prompt), wasting tokens and compressing the context window.

Additionally, some MCP tool operations (rename, task reassignment) do not notify the affected agents, leaving them unaware of changes to their own state.

## Architecture

Three-layer optimization:

1. **Full / Delta prompt split** — first wake sends full role prompt with static rules; subsequent wakes send only dynamic state (already implemented)
2. **Event-specific framing for internal events** — `all_settled` and `agent_crashed` get targeted framing instead of generic delta
3. **MCP handler notifications** — `team_rename_agent` and `team_task_update` (owner change) write mailbox notifications + wake affected agents

## Detailed Design

### 1. Full / Delta Prompt Split (DONE)

Already implemented in the current branch:

- `buildRolePrompt` with `needsFullPrompt` flag dispatches to full prompt or `buildWakeUpdate`
- `needsFullPrompt = agent.status === 'pending' || agent.status === 'failed'`
- `availableAgentTypes` computation moved into lead-only + full-prompt-only path
- Shared `formatHelpers.ts` extracted from duplicated helpers in leadPrompt/teammatePrompt

### 2. Event-Specific Wake Framing

**Problem:** Two internal events produce low-information mailbox messages that don't guide the leader effectively:

- `all_settled`: leader receives N × "Turn completed" idle notifications — no synthesis, no action guidance
- `agent_crashed`: leader receives a testament message — but no framing to shift into incident-handling mode

**Solution:** Add a `WakeReason` parameter to `wake()` for these two events only.

```typescript
type WakeReason = 'all_settled' | 'agent_crashed';

async wake(slotId: string, reason?: WakeReason): Promise<void>
```

Only two call sites pass a reason:

- `maybeWakeLeaderWhenAllIdle()` → `this.wake(leadSlotId, 'all_settled')`
- `handleAgentCrash()` → `this.wake(leadAgent.slotId, 'agent_crashed')`

All other call sites (MCP tools, TeamSession user messages) omit the reason and get the default delta.

**Prompt templates by reason:**

`all_settled` (lead only):

```
## All Teammates Settled

All teammates have completed their current turns. Review their reports,
check the task board, and decide next steps — assign new work, follow up,
or report results to the user.

### Teammates
{formatTeammates}

### Task Board
{formatTasks}

### Unread Messages
{formatMessages}
```

`agent_crashed` (lead only):

```
## Teammate Crashed

A teammate's process has crashed unexpectedly. Check the details below
and decide how to proceed — reassign their work, attempt recovery, or
adjust the plan.

### Task Board
{formatTasks}

### Unread Messages
{formatMessages}
```

Default (no reason) — unchanged from current `buildWakeUpdate`:

```
## Team Status Update  /  ## Status Update

### Teammates (lead only)
### Task Board  /  ### Your Tasks
### Unread Messages
```

**Changes to `buildWakeUpdate`:** Add optional `reason` parameter. When reason is provided, use the event-specific template instead of the generic one. Only affects lead prompts — teammate prompts always use the default template.

### 3. MCP Handler Notifications

Two MCP handlers need notification fixes:

#### 3a. `team_rename_agent`

**Current:** `handleRenameAgent` renames the agent and returns result to caller. The renamed agent is not notified.

**Fix:** After rename, write a mailbox message to the renamed agent and wake them.

```
Mailbox message: "You have been renamed from "{oldName}" to "{newName}".
Use your new name when identifying yourself."
```

**Code change:** `handleRenameAgent` becomes async, gains `callerSlotId` parameter, adds mailbox write + wakeAgent call.

#### 3b. `team_task_update` (owner change)

**Current:** `handleTaskUpdate` updates the task and returns result to caller. If the owner field changes, the new owner is not notified.

**Fix:** When the `owner` field is set and differs from the previous owner, write a mailbox message to the new owner and wake them.

```
Mailbox message: "Task [{taskId}] "{subject}" has been reassigned to you.
Status: {status}."
```

**Code change:** `handleTaskUpdate` reads the task before update to detect owner change, then conditionally writes mailbox + wakeAgent.

#### NOT adding notification: `team_task_create`

`team_task_create` with an owner does NOT auto-notify. Rationale:

- Leader almost always follows up with `team_send_message` containing detailed instructions
- The leader's message is more useful context than a generic "you've been assigned task X"
- The task appears in the agent's `Your Assigned Tasks` section on next wake regardless
- Adding notification would create noise (duplicate messages) in the common case

### Files Changed

| Action | Path                                              | What                                                       |
| ------ | ------------------------------------------------- | ---------------------------------------------------------- |
| Done   | `src/process/team/prompts/formatHelpers.ts`       | Shared formatting helpers                                  |
| Done   | `src/process/team/prompts/buildWakeUpdate.ts`     | Delta wake update builder                                  |
| Done   | `src/process/team/prompts/buildRolePrompt.ts`     | Full/delta dispatch with needsFullPrompt                   |
| Done   | `src/process/team/TeammateManager.ts`             | needsFullPrompt logic, conditional availableAgentTypes     |
| Modify | `src/process/team/TeammateManager.ts`             | Add `reason?: WakeReason` to wake(), pass from call sites  |
| Modify | `src/process/team/prompts/buildWakeUpdate.ts`     | Add reason-specific templates (all_settled, agent_crashed) |
| Modify | `src/process/team/mcp/team/TeamMcpServer.ts`      | handleRenameAgent: add notification + wake                 |
| Modify | `src/process/team/mcp/team/TeamMcpServer.ts`      | handleTaskUpdate: detect owner change, notify + wake       |
| Create | `tests/unit/process/team/buildWakeUpdate.test.ts` | Tests for event-specific templates                         |
| Modify | `tests/unit/process/team/buildWakeUpdate.test.ts` | Add tests for all_settled and agent_crashed prompts        |

### Testing

- Unit tests for `buildWakeUpdate` with each reason variant
- Unit tests verifying `handleRenameAgent` writes mailbox + calls wakeAgent
- Unit tests verifying `handleTaskUpdate` with owner change writes mailbox + calls wakeAgent
- Unit tests verifying `handleTaskUpdate` without owner change does NOT write mailbox
- Existing tests must continue passing (prompt tests, concurrency tests, crash handling tests)
