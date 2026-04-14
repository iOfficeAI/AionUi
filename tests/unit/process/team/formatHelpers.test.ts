import { describe, expect, it } from 'vitest';
import { formatTasks, formatMessages, formatTeammates } from '@process/team/prompts/formatHelpers';
import type { TeamAgent, MailboxMessage, TeamTask } from '@process/team/types';

describe('formatTasks', () => {
  it('returns placeholder when empty', () => {
    expect(formatTasks([], 'No tasks yet.')).toBe('No tasks yet.');
  });

  it('formats tasks with id, subject, status, and optional owner', () => {
    const tasks: TeamTask[] = [
      { id: 'abcd1234-0000', teamId: 't1', subject: 'Fix bug', status: 'in_progress', owner: 'dev' },
      { id: 'efgh5678-0000', teamId: 't1', subject: 'Write tests', status: 'pending' },
    ] as TeamTask[];
    const result = formatTasks(tasks);
    expect(result).toContain('[abcd1234] Fix bug (in_progress, owner: dev)');
    expect(result).toContain('[efgh5678] Write tests (pending)');
  });
});

describe('formatMessages', () => {
  it('returns placeholder when empty', () => {
    expect(formatMessages([], [])).toBe('No unread messages.');
  });

  it('labels user messages correctly', () => {
    const msgs: MailboxMessage[] = [
      { id: 'm1', teamId: 't1', toAgentId: 'slot-1', fromAgentId: 'user', content: 'Hello', type: 'message' },
    ];
    expect(formatMessages(msgs, [])).toContain('[From User] Hello');
  });

  it('resolves sender name from agents list', () => {
    const agents: TeamAgent[] = [{ slotId: 'slot-2', agentName: 'Researcher' } as TeamAgent];
    const msgs: MailboxMessage[] = [
      { id: 'm1', teamId: 't1', toAgentId: 'slot-1', fromAgentId: 'slot-2', content: 'Done', type: 'message' },
    ];
    expect(formatMessages(msgs, agents)).toContain('[From Researcher] Done');
  });
});

describe('formatTeammates', () => {
  it('returns placeholder when empty', () => {
    expect(formatTeammates([])).toBe('(none)');
  });

  it('formats teammates with name, type, and status', () => {
    const agents: TeamAgent[] = [
      { slotId: 's1', agentName: 'Dev', agentType: 'claude', status: 'idle' } as TeamAgent,
      { slotId: 's2', agentName: 'QA', agentType: 'gemini', status: 'active' } as TeamAgent,
    ];
    const result = formatTeammates(agents);
    expect(result).toContain('Dev (claude, status: idle)');
    expect(result).toContain('QA (gemini, status: active)');
  });

  it('includes formerly-known-as note for renamed agents', () => {
    const agents: TeamAgent[] = [
      { slotId: 's1', agentName: 'NewName', agentType: 'claude', status: 'idle' } as TeamAgent,
    ];
    const renamed = new Map([['s1', 'OldName']]);
    const result = formatTeammates(agents, renamed);
    expect(result).toContain('[formerly: OldName]');
  });
});
