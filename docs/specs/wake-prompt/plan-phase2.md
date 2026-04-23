# Wake Prompt Phase 2: Event Framing + MCP Notifications

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add event-specific prompt framing for `all_settled` and `agent_crashed` wake events, and fix notification gaps in `team_rename_agent` and `team_task_update` (owner change) MCP handlers.

**Architecture:** Add optional `WakeReason` parameter to `wake()`, propagate through `buildRolePrompt` → `buildWakeUpdate` for event-specific templates. Add `TaskManager.getById()` to support owner-change detection. Add mailbox write + wake calls in two MCP handlers.

**Tech Stack:** TypeScript, Vitest

---

## File Structure

| Action | Path                                               | Responsibility                                                                                       |
| ------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Modify | `src/process/team/prompts/buildWakeUpdate.ts`      | Add `reason` param, event-specific templates for `all_settled` / `agent_crashed`                     |
| Modify | `src/process/team/prompts/buildRolePrompt.ts`      | Pass `reason` through to `buildWakeUpdate`                                                           |
| Modify | `src/process/team/TeammateManager.ts`              | Add `reason?: WakeReason` to `wake()`, pass from `maybeWakeLeaderWhenAllIdle` and `handleAgentCrash` |
| Modify | `src/process/team/TaskManager.ts`                  | Add `getById()` method                                                                               |
| Modify | `src/process/team/mcp/team/TeamMcpServer.ts`       | `handleRenameAgent`: add notification + wake; `handleTaskUpdate`: detect owner change, notify + wake |
| Modify | `tests/unit/process/team/buildWakeUpdate.test.ts`  | Add tests for `all_settled` and `agent_crashed` reason templates                                     |
| Create | `tests/unit/process/team/mcpNotifications.test.ts` | Tests for rename and task-update notifications                                                       |

---

### Task 1: Add `WakeReason` and event-specific templates to `buildWakeUpdate`

**Files:**

- Modify: `src/process/team/prompts/buildWakeUpdate.ts`
- Modify: `tests/unit/process/team/buildWakeUpdate.test.ts`

- [ ] **Step 1: Add tests for `all_settled` and `agent_crashed` reason templates**

Append these test suites to the existing `tests/unit/process/team/buildWakeUpdate.test.ts`:

```ts
describe('buildWakeUpdate — all_settled reason', () => {
  it('includes settlement framing and full status', () => {
    const teammates = [makeMember()];
    const tasks: TeamTask[] = [
      { id: 'task-001-xxxx', teamId: 't1', subject: 'Implement auth', status: 'completed', owner: 'Researcher' },
    ] as TeamTask[];
    const messages: MailboxMessage[] = [
      {
        id: 'm1',
        teamId: 't1',
        toAgentId: 'lead-slot',
        fromAgentId: 'member-slot',
        content: 'Turn completed',
        type: 'idle_notification',
      },
    ];

    const result = buildWakeUpdate({
      agent: makeLead(),
      mailboxMessages: messages,
      tasks,
      teammates,
      reason: 'all_settled',
    });

    expect(result).toContain('## All Teammates Settled');
    expect(result).toContain('Review their reports');
    expect(result).toContain('Researcher (gemini, status: idle)');
    expect(result).toContain('[task-001] Implement auth');
    expect(result).toContain('Turn completed');
  });

  it('does NOT use all_settled framing when no reason is given', () => {
    const result = buildWakeUpdate({
      agent: makeLead(),
      mailboxMessages: [],
      tasks: [],
      teammates: [],
    });

    expect(result).not.toContain('All Teammates Settled');
    expect(result).toContain('## Team Status Update');
  });
});

describe('buildWakeUpdate — agent_crashed reason', () => {
  it('includes crash framing and unread messages', () => {
    const teammates = [makeMember({ status: 'failed' })];
    const tasks: TeamTask[] = [
      { id: 'task-002-xxxx', teamId: 't1', subject: 'Write tests', status: 'in_progress', owner: 'Researcher' },
    ] as TeamTask[];
    const messages: MailboxMessage[] = [
      {
        id: 'm1',
        teamId: 't1',
        toAgentId: 'lead-slot',
        fromAgentId: 'member-slot',
        content: '[System] Member "Researcher" (gemini) crashed. Error: process exited unexpectedly.',
        type: 'message',
      },
    ];

    const result = buildWakeUpdate({
      agent: makeLead(),
      mailboxMessages: messages,
      tasks,
      teammates,
      reason: 'agent_crashed',
    });

    expect(result).toContain('## Teammate Crashed');
    expect(result).toContain('decide how to proceed');
    expect(result).toContain('[task-002] Write tests');
    expect(result).toContain('process exited unexpectedly');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/unit/process/team/buildWakeUpdate.test.ts`
Expected: FAIL — `reason` property does not exist on type

- [ ] **Step 3: Update `buildWakeUpdate.ts` with reason support**

Replace the entire content of `src/process/team/prompts/buildWakeUpdate.ts`:

```ts
import type { TeamAgent, MailboxMessage, TeamTask } from '../types';
import { formatTasks, formatMessages, formatTeammates } from './formatHelpers';

/** Events that warrant specialized prompt framing instead of the generic delta. */
export type WakeReason = 'all_settled' | 'agent_crashed';

type BuildWakeUpdateParams = {
  agent: TeamAgent;
  mailboxMessages: MailboxMessage[];
  tasks: TeamTask[];
  teammates: TeamAgent[];
  renamedAgents?: Map<string, string>;
  reason?: WakeReason;
};

/**
 * Build a lightweight status update for an agent that has already received
 * its full role prompt. Contains only dynamic state: teammate statuses,
 * task board, and unread messages. When a reason is provided, uses an
 * event-specific framing template.
 */
export function buildWakeUpdate(params: BuildWakeUpdateParams): string {
  const { agent, mailboxMessages, tasks, teammates, renamedAgents, reason } = params;

  if (agent.role === 'lead') {
    return buildLeadWakeUpdate(mailboxMessages, tasks, teammates, renamedAgents, reason);
  }

  const lead = teammates.find((t) => t.role === 'lead');
  const assignedTasks = tasks.filter((t) => t.owner === agent.slotId || t.owner === agent.agentName);
  const allAgents = lead ? [lead, ...teammates.filter((t) => t.role !== 'lead')] : teammates;

  return buildTeammateWakeUpdate(mailboxMessages, assignedTasks, allAgents);
}

function buildLeadWakeUpdate(
  messages: MailboxMessage[],
  tasks: TeamTask[],
  teammates: TeamAgent[],
  renamedAgents?: Map<string, string>,
  reason?: WakeReason
): string {
  if (reason === 'all_settled') {
    return `## All Teammates Settled

All teammates have completed their current turns. Review their reports,
check the task board, and decide next steps — assign new work, follow up,
or report results to the user.

### Teammates
${formatTeammates(teammates, renamedAgents)}

### Task Board
${formatTasks(tasks)}

### Unread Messages
${formatMessages(messages, teammates)}`;
  }

  if (reason === 'agent_crashed') {
    return `## Teammate Crashed

A teammate's process has crashed unexpectedly. Check the details below
and decide how to proceed — reassign their work, attempt recovery, or
adjust the plan.

### Task Board
${formatTasks(tasks)}

### Unread Messages
${formatMessages(messages, teammates)}`;
  }

  return `## Team Status Update

### Teammates
${formatTeammates(teammates, renamedAgents)}

### Task Board
${formatTasks(tasks)}

### Unread Messages
${formatMessages(messages, teammates)}`;
}

function buildTeammateWakeUpdate(
  messages: MailboxMessage[],
  assignedTasks: TeamTask[],
  allAgents: TeamAgent[]
): string {
  return `## Status Update

### Your Tasks
${formatTasks(assignedTasks, 'No assigned tasks.')}

### Unread Messages
${formatMessages(messages, allAgents)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- tests/unit/process/team/buildWakeUpdate.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/process/team/prompts/buildWakeUpdate.ts tests/unit/process/team/buildWakeUpdate.test.ts
git commit -m "feat(team): add WakeReason event-specific templates to buildWakeUpdate"
```

---

### Task 2: Propagate `reason` through `buildRolePrompt` and `TeammateManager.wake()`

**Files:**

- Modify: `src/process/team/prompts/buildRolePrompt.ts`
- Modify: `src/process/team/TeammateManager.ts`

- [ ] **Step 1: Add `reason` to `buildRolePrompt` params and pass through**

In `src/process/team/prompts/buildRolePrompt.ts`, add the import and param:

```ts
import { buildWakeUpdate } from './buildWakeUpdate';
import type { WakeReason } from './buildWakeUpdate';
```

Add to `BuildRolePromptParams`:

```ts
  /** Event that triggered this wake — used for event-specific framing in delta updates */
  reason?: WakeReason;
```

In the `if (!needsFullPrompt)` block, pass `reason` through:

```ts
if (!needsFullPrompt) {
  return buildWakeUpdate({
    agent,
    mailboxMessages,
    tasks,
    teammates,
    renamedAgents,
    reason,
  });
}
```

- [ ] **Step 2: Add `reason` param to `wake()` and pass from call sites**

In `src/process/team/TeammateManager.ts`:

First, add the import at the top of the file:

```ts
import type { WakeReason } from './prompts/buildWakeUpdate';
```

Change the `wake` method signature from:

```ts
async wake(slotId: string): Promise<void> {
```

to:

```ts
async wake(slotId: string, reason?: WakeReason): Promise<void> {
```

Pass `reason` to `buildRolePrompt` — change the existing call:

```ts
const message = buildRolePrompt({
  agent,
  mailboxMessages,
  tasks,
  teammates,
  availableAgentTypes,
  renamedAgents: this.renamedAgents,
  teamWorkspace: this.teamWorkspace,
  needsFullPrompt,
  reason,
});
```

- [ ] **Step 3: Pass reason from `maybeWakeLeaderWhenAllIdle`**

In `src/process/team/TeammateManager.ts`, change line 346 from:

```ts
void this.wake(leadSlotId);
```

to:

```ts
void this.wake(leadSlotId, 'all_settled');
```

- [ ] **Step 4: Pass reason from `handleAgentCrash`**

In `src/process/team/TeammateManager.ts`, change line 438 from:

```ts
void this.wake(leadAgent.slotId);
```

to:

```ts
void this.wake(leadAgent.slotId, 'agent_crashed');
```

- [ ] **Step 5: Run type check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Run all team tests**

Run: `bun run test -- tests/unit/process/team/ tests/integration/team-real-components.test.ts tests/integration/team-stress-concurrency.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/process/team/prompts/buildRolePrompt.ts src/process/team/TeammateManager.ts
git commit -m "feat(team): propagate WakeReason through wake() → buildRolePrompt → buildWakeUpdate"
```

---

### Task 3: Add `TaskManager.getById()` method

**Files:**

- Modify: `src/process/team/TaskManager.ts`

This is needed by Task 4 to detect owner changes in `handleTaskUpdate`.

- [ ] **Step 1: Add `getById` method to `TaskManager`**

In `src/process/team/TaskManager.ts`, add after the `update` method (after line 67):

```ts
  /**
   * Get a single task by ID. Returns null if not found.
   */
  async getById(taskId: string): Promise<TeamTask | null> {
    return this.repo.findTaskById(taskId);
  }
```

- [ ] **Step 2: Run type check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/process/team/TaskManager.ts
git commit -m "feat(team): add TaskManager.getById() for pre-update reads"
```

---

### Task 4: Add MCP handler notifications for rename and task-update

**Files:**

- Modify: `src/process/team/mcp/team/TeamMcpServer.ts`
- Create: `tests/unit/process/team/mcpNotifications.test.ts`

- [ ] **Step 1: Write tests for MCP notifications**

```ts
// tests/unit/process/team/mcpNotifications.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TeamMcpServer } from '@process/team/mcp/team/TeamMcpServer';
import type { TeamAgent, TeamTask } from '@process/team/types';

function makeLead(): TeamAgent {
  return {
    slotId: 'lead-slot',
    conversationId: 'lead-conv',
    role: 'lead',
    agentType: 'claude',
    agentName: 'Leader',
    conversationType: 'claude',
    status: 'idle',
  } as TeamAgent;
}

function makeMember(name = 'Dev', slotId = 'dev-slot'): TeamAgent {
  return {
    slotId,
    conversationId: `${slotId}-conv`,
    role: 'teammate',
    agentType: 'claude',
    agentName: name,
    conversationType: 'claude',
    status: 'idle',
  } as TeamAgent;
}

describe('TeamMcpServer — rename notification', () => {
  let agents: TeamAgent[];
  let mailboxWrites: Array<{ toAgentId: string; content: string }>;
  let wokenSlots: string[];
  let server: TeamMcpServer;

  beforeEach(() => {
    agents = [makeLead(), makeMember('OldName', 'member-slot')];
    mailboxWrites = [];
    wokenSlots = [];

    server = new TeamMcpServer({
      teamId: 'team-1',
      getAgents: () => agents,
      mailbox: {
        write: vi.fn(async (msg: { toAgentId: string; content: string }) => {
          mailboxWrites.push(msg);
        }),
        readUnread: vi.fn(async () => []),
      } as any,
      taskManager: {
        list: vi.fn(async () => []),
        getById: vi.fn(async () => null),
        update: vi.fn(async (_id: string, updates: Partial<TeamTask>) => ({
          id: 'task-1',
          subject: 'Test',
          status: 'pending',
          ...updates,
        })),
      } as any,
      renameAgent: vi.fn((slotId: string, newName: string) => {
        const agent = agents.find((a) => a.slotId === slotId);
        if (agent) agent.agentName = newName;
      }),
      wakeAgent: vi.fn(async (slotId: string) => {
        wokenSlots.push(slotId);
      }),
    });
  });

  it('notifies the renamed agent via mailbox and wakes them', async () => {
    // Access private method via TCP simulation
    const result = await (server as any).handleToolCall(
      'team_rename_agent',
      {
        agent: 'OldName',
        new_name: 'NewName',
      },
      'lead-slot'
    );

    expect(result).toContain('OldName');
    expect(result).toContain('NewName');

    // Verify mailbox write to the renamed agent
    const notification = mailboxWrites.find((m) => m.toAgentId === 'member-slot');
    expect(notification).toBeDefined();
    expect(notification!.content).toContain('OldName');
    expect(notification!.content).toContain('NewName');

    // Verify the agent was woken
    expect(wokenSlots).toContain('member-slot');
  });
});

describe('TeamMcpServer — task-update owner-change notification', () => {
  let agents: TeamAgent[];
  let mailboxWrites: Array<{ toAgentId: string; content: string }>;
  let wokenSlots: string[];
  let server: TeamMcpServer;

  beforeEach(() => {
    agents = [makeLead(), makeMember('Dev', 'dev-slot'), makeMember('QA', 'qa-slot')];
    mailboxWrites = [];
    wokenSlots = [];

    const existingTask: TeamTask = {
      id: 'task-abc12345',
      teamId: 'team-1',
      subject: 'Implement auth',
      status: 'pending',
      owner: 'Dev',
      blockedBy: [],
      blocks: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    server = new TeamMcpServer({
      teamId: 'team-1',
      getAgents: () => agents,
      mailbox: {
        write: vi.fn(async (msg: { toAgentId: string; content: string }) => {
          mailboxWrites.push(msg);
        }),
        readUnread: vi.fn(async () => []),
      } as any,
      taskManager: {
        list: vi.fn(async () => []),
        getById: vi.fn(async () => existingTask),
        update: vi.fn(async (_id: string, updates: Partial<TeamTask>) => ({
          ...existingTask,
          ...updates,
        })),
        checkUnblocks: vi.fn(async () => []),
      } as any,
      wakeAgent: vi.fn(async (slotId: string) => {
        wokenSlots.push(slotId);
      }),
    });
  });

  it('notifies new owner when task is reassigned', async () => {
    const result = await (server as any).handleToolCall(
      'team_task_update',
      {
        task_id: 'task-abc12345',
        owner: 'QA',
      },
      'lead-slot'
    );

    expect(result).toContain('updated');

    // Verify mailbox write to the new owner (QA)
    const notification = mailboxWrites.find((m) => m.toAgentId === 'qa-slot');
    expect(notification).toBeDefined();
    expect(notification!.content).toContain('Implement auth');
    expect(notification!.content).toContain('reassigned to you');

    // Verify QA was woken
    expect(wokenSlots).toContain('qa-slot');
  });

  it('does NOT notify when owner is unchanged', async () => {
    const result = await (server as any).handleToolCall(
      'team_task_update',
      {
        task_id: 'task-abc12345',
        status: 'in_progress',
      },
      'lead-slot'
    );

    expect(result).toContain('updated');
    expect(mailboxWrites).toHaveLength(0);
    expect(wokenSlots).toHaveLength(0);
  });

  it('does NOT notify when owner is set to the same value', async () => {
    await (server as any).handleToolCall(
      'team_task_update',
      {
        task_id: 'task-abc12345',
        owner: 'Dev',
      },
      'lead-slot'
    );

    expect(mailboxWrites).toHaveLength(0);
    expect(wokenSlots).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/unit/process/team/mcpNotifications.test.ts`
Expected: FAIL — constructor mismatch or missing notifications

- [ ] **Step 3: Update `handleRenameAgent` to add notification**

In `src/process/team/mcp/team/TeamMcpServer.ts`, replace `handleRenameAgent` (lines 450-469):

```ts
  private async handleRenameAgent(args: Record<string, unknown>, callerSlotId?: string): Promise<string> {
    const { teamId, mailbox, wakeAgent } = this.params;
    const agentRef = String(args.agent ?? '');
    const newName = String(args.new_name ?? '');

    if (!this.params.renameAgent) {
      throw new Error('Agent renaming is not available for this team.');
    }

    const resolvedSlotId = this.resolveSlotId(agentRef);
    if (!resolvedSlotId) {
      const agents = this.params.getAgents();
      throw new Error(`Agent "${agentRef}" not found. Available: ${agents.map((a) => a.agentName).join(', ')}`);
    }

    const agents = this.params.getAgents();
    const oldName = agents.find((a) => a.slotId === resolvedSlotId)?.agentName ?? agentRef;

    this.params.renameAgent(resolvedSlotId, newName);

    // Notify the renamed agent so they know their new identity
    const fromSlotId = callerSlotId ?? agents.find((a) => a.role === 'lead')?.slotId ?? 'system';
    await mailbox.write({
      teamId,
      toAgentId: resolvedSlotId,
      fromAgentId: fromSlotId,
      content: `You have been renamed from "${oldName}" to "${newName.trim()}". Use your new name when identifying yourself.`,
    });
    void wakeAgent(resolvedSlotId);

    return `Agent renamed: "${oldName}" → "${newName.trim()}"`;
  }
```

- [ ] **Step 4: Update `handleTaskUpdate` to detect owner change and notify**

In `src/process/team/mcp/team/TeamMcpServer.ts`, replace `handleTaskUpdate` (lines 377-397):

```ts
  private async handleTaskUpdate(args: Record<string, unknown>, callerSlotId?: string): Promise<string> {
    const { teamId, taskManager, getAgents, mailbox, wakeAgent } = this.params;
    const taskId = String(args.task_id ?? '');
    const rawStatus = args.status ? String(args.status) : undefined;
    const owner = args.owner ? String(args.owner) : undefined;

    const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'deleted']);
    const status =
      rawStatus && VALID_STATUSES.has(rawStatus)
        ? (rawStatus as 'pending' | 'in_progress' | 'completed' | 'deleted')
        : undefined;
    if (rawStatus && !status) {
      throw new Error(`Invalid task status "${rawStatus}". Must be one of: ${[...VALID_STATUSES].join(', ')}`);
    }

    // Read the task before update to detect owner changes
    const previousTask = owner ? await taskManager.getById(taskId) : null;

    await taskManager.update(taskId, { status, owner });
    if (status === 'completed') {
      await taskManager.checkUnblocks(taskId);
    }

    // Notify new owner when task is reassigned to a different agent
    if (owner && previousTask && owner !== previousTask.owner) {
      const agents = getAgents();
      const newOwnerSlot = this.resolveSlotId(owner);
      if (newOwnerSlot) {
        const fromSlotId = callerSlotId ?? agents.find((a) => a.role === 'lead')?.slotId ?? 'system';
        const taskStatus = status ?? previousTask.status;
        await mailbox.write({
          teamId,
          toAgentId: newOwnerSlot,
          fromAgentId: fromSlotId,
          content: `Task [${taskId.slice(0, 8)}] "${previousTask.subject}" has been reassigned to you. Status: ${taskStatus}.`,
        });
        void wakeAgent(newOwnerSlot);
      }
    }

    return `Task ${taskId.slice(0, 8)} updated.${status ? ` Status: ${status}.` : ''}${owner ? ` Owner: ${owner}.` : ''}`;
  }
```

- [ ] **Step 5: Update `handleToolCall` dispatch to pass `fromSlotId` for rename and task_update**

In `src/process/team/mcp/team/TeamMcpServer.ts`, change the switch cases in `handleToolCall` (lines 227-228):

From:

```ts
      case 'team_rename_agent':
        return this.handleRenameAgent(args);
```

To:

```ts
      case 'team_rename_agent':
        return this.handleRenameAgent(args, fromSlotId);
```

From:

```ts
      case 'team_task_update':
        return this.handleTaskUpdate(args);
```

To:

```ts
      case 'team_task_update':
        return this.handleTaskUpdate(args, fromSlotId);
```

- [ ] **Step 6: Run tests**

Run: `bun run test -- tests/unit/process/team/mcpNotifications.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Run all team tests for regression check**

Run: `bun run test -- tests/unit/process/team/ tests/integration/team-real-components.test.ts tests/integration/team-stress-concurrency.test.ts`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/process/team/mcp/team/TeamMcpServer.ts tests/unit/process/team/mcpNotifications.test.ts
git commit -m "feat(team): add mailbox notifications for rename and task reassignment"
```

---

### Task 5: Lint, format, type check, and final verification

**Files:**

- All files modified in Tasks 1-4

- [ ] **Step 1: Run lint fix**

Run: `bun run lint:fix`
Expected: No remaining errors

- [ ] **Step 2: Run format**

Run: `bun run format`
Expected: Files formatted

- [ ] **Step 3: Run type check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run full test suite**

Run: `bun run test`
Expected: ALL PASS

- [ ] **Step 5: Run prek CI check**

Run: `prek run --from-ref origin/kaizhou-lab/refactor/acp-capabilities --to-ref HEAD`
Expected: ALL PASS

- [ ] **Step 6: Commit any formatting fixes if needed**

```bash
git add -u
git commit -m "style(team): fix lint and formatting for phase 2 wake prompt changes"
```
