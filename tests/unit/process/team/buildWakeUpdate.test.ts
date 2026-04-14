import { describe, expect, it } from 'vitest';
import { buildWakeUpdate } from '@process/team/prompts/buildWakeUpdate';
import type { TeamAgent, MailboxMessage, TeamTask } from '@process/team/types';

function makeLead(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slotId: 'lead-slot',
    conversationId: 'lead-conv',
    role: 'lead' as const,
    agentType: 'claude',
    agentName: 'Leader',
    conversationType: 'claude',
    status: 'idle',
    ...overrides,
  } as TeamAgent;
}

function makeMember(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slotId: 'member-slot',
    conversationId: 'member-conv',
    role: 'teammate' as const,
    agentType: 'gemini',
    agentName: 'Researcher',
    conversationType: 'gemini',
    status: 'idle',
    ...overrides,
  } as TeamAgent;
}

describe('buildWakeUpdate — lead', () => {
  it('includes teammates, tasks, and unread messages', () => {
    const teammates = [makeMember()];
    const tasks: TeamTask[] = [
      { id: 'task-001-xxxx', teamId: 't1', subject: 'Implement auth', status: 'completed', owner: 'Researcher' },
    ] as TeamTask[];
    const messages: MailboxMessage[] = [
      { id: 'm1', teamId: 't1', toAgentId: 'lead-slot', fromAgentId: 'member-slot', content: 'Auth done.', type: 'message' },
    ];

    const result = buildWakeUpdate({
      agent: makeLead(),
      mailboxMessages: messages,
      tasks,
      teammates,
    });

    expect(result).toContain('## Team Status Update');
    expect(result).toContain('Researcher (gemini, status: idle)');
    expect(result).toContain('[task-001] Implement auth (completed, owner: Researcher)');
    expect(result).toContain('[From Researcher] Auth done.');
  });

  it('does NOT contain static role instructions', () => {
    const result = buildWakeUpdate({
      agent: makeLead(),
      mailboxMessages: [],
      tasks: [],
      teammates: [],
    });

    expect(result).not.toContain('# You are the Team Lead');
    expect(result).not.toContain('## Your Role');
    expect(result).not.toContain('## Workflow');
    expect(result).not.toContain('## Team Coordination Tools');
    expect(result).not.toContain('## Important Rules');
  });
});

describe('buildWakeUpdate — teammate', () => {
  it('includes assigned tasks and unread messages', () => {
    const lead = makeLead();
    const tasks: TeamTask[] = [
      { id: 'task-002-xxxx', teamId: 't1', subject: 'Add rate limiting', status: 'pending', owner: 'Researcher' },
    ] as TeamTask[];
    const messages: MailboxMessage[] = [
      {
        id: 'm1',
        teamId: 't1',
        toAgentId: 'member-slot',
        fromAgentId: 'lead-slot',
        content: 'Please add rate limiting.',
        type: 'message',
      },
    ];

    const result = buildWakeUpdate({
      agent: makeMember(),
      mailboxMessages: messages,
      tasks,
      teammates: [lead],
    });

    expect(result).toContain('## Status Update');
    expect(result).toContain('[task-002] Add rate limiting (pending');
    expect(result).toContain('[From Leader] Please add rate limiting.');
  });

  it('does NOT contain static role instructions', () => {
    const result = buildWakeUpdate({
      agent: makeMember(),
      mailboxMessages: [],
      tasks: [],
      teammates: [makeLead()],
    });

    expect(result).not.toContain('# You are a Team Member');
    expect(result).not.toContain('## Your Identity');
    expect(result).not.toContain('## How to Work');
    expect(result).not.toContain('## Team Coordination Tools');
    expect(result).not.toContain('## Important Rules');
  });
});
