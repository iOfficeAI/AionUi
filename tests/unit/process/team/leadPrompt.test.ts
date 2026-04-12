import { describe, expect, it } from 'vitest';
import { buildLeadPrompt } from '@process/team/prompts/leadPrompt';

describe('buildLeadPrompt', () => {
  it('asks the lead to propose teammates and recommended agent types before spawning', () => {
    const prompt = buildLeadPrompt({
      teammates: [],
      tasks: [],
      unreadMessages: [],
      availableAgentTypes: [
        { type: 'claude', name: 'Claude Code' },
        { type: 'gemini', name: 'Gemini CLI' },
      ],
    });

    expect(prompt).toContain('first reply in text with a staffing proposal');
    expect(prompt).toContain('one short sentence explaining why more teammates would help');
    expect(prompt).toContain('Present the proposed lineup as a table');
    expect(prompt).toContain('recommended agent type/backend');
    expect(prompt).toContain('Ask whether the user wants to create those teammates as proposed');
    expect(prompt).toContain(
      'they can also come back later during the project and ask you to replace or adjust any teammate'
    );
    expect(prompt).toContain('Do NOT call team_spawn_agent in that same turn');
    expect(prompt).toContain('Wait for explicit confirmation before using team_spawn_agent');
  });

  it('prevents immediate spawning when the teammate lineup is not finalized yet', () => {
    const prompt = buildLeadPrompt({
      teammates: [],
      tasks: [],
      unreadMessages: [],
    });

    expect(prompt).not.toContain('call team_spawn_agent immediately, do NOT just reply in text');
    expect(prompt).toContain('respond with the proposal first instead of spawning immediately');
    expect(prompt).toContain('If the user asks to change a proposed teammate');
    expect(prompt).toContain("End your turn after the proposal and wait for the user's reply");
    expect(prompt).toContain('If the user later says they are unhappy with an existing teammate');
  });

  it('keeps greeting replies friendly and avoids staffing details before a real task appears', () => {
    const prompt = buildLeadPrompt({
      teammates: [],
      tasks: [],
      unreadMessages: [],
    });

    expect(prompt).toContain('If the user greets you, starts a new chat, or asks what you can do');
    expect(prompt).toContain('briefly introduce yourself as the team lead');
    expect(prompt).toContain('invite the user to share their goal');
    expect(prompt).toContain('Do NOT mention teammate proposals, recommended agent types, or confirmation workflow');
  });
});
