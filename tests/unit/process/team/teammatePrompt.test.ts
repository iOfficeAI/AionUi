import { describe, expect, it } from 'vitest';
import { buildTeammatePrompt } from '@process/team/prompts/teammatePrompt';
import type { TeamAgent } from '@process/team/types';

function makeAgent(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slot_id: 'slot-1',
    conversation_id: 'conv-1',
    role: 'teammate',
    agent_type: 'gemini',
    agent_name: 'Researcher',
    conversation_type: 'gemini',
    status: 'idle',
    ...overrides,
  };
}

describe('buildTeammatePrompt', () => {
  it('keeps greeting replies friendly and focused on role introduction', () => {
    const prompt = buildTeammatePrompt({
      agent: makeAgent(),
      leader: makeAgent({ slot_id: 'slot-lead', role: 'leader', agent_name: 'Leader', agent_type: 'claude' }),
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
