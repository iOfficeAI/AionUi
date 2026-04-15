import { describe, expect, it } from 'vitest';
import { formatMessages } from '@process/team/prompts/formatHelpers';
import type { TeamAgent, MailboxMessage } from '@process/team/types';

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
