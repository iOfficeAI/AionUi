import { describe, expect, it } from 'vitest';
import { buildTeammatePrompt } from '@process/team/prompts/teammatePrompt';
import type { TeamAgent } from '@process/team/types';

function makeAgent(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slotId: 'slot-1',
    conversationId: 'conv-1',
    role: 'teammate',
    agentType: 'gemini',
    agentName: 'Researcher',
    conversationType: 'gemini',
    status: 'idle',
    ...overrides,
  };
}

describe('buildTeammatePrompt', () => {
  it('keeps greeting replies friendly and focused on role introduction', () => {
    const prompt = buildTeammatePrompt({
      agent: makeAgent(),
      lead: makeAgent({ slotId: 'slot-lead', role: 'lead', agentName: 'Leader', agentType: 'claude' }),
      teammates: [],
      assignedTasks: [],
      unreadMessages: [],
    });

    expect(prompt).toContain('If the user greets you, starts a new chat, or asks what you can do');
    expect(prompt).toContain('Briefly introduce yourself and your role on the team');
    expect(prompt).toContain('invite the user to share what they need');
    expect(prompt).toContain('Do NOT open with task board details, idle/waiting status, or coordination mechanics');
  });
});
