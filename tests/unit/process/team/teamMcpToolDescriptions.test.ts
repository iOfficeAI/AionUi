import { describe, expect, it } from 'vitest';
import { TEAM_SPAWN_AGENT_DESCRIPTION } from '@process/resources/teamMcp/toolDescriptions';

describe('TEAM_SPAWN_AGENT_DESCRIPTION', () => {
  it('requires explicit user approval before normal teammate creation', () => {
    expect(TEAM_SPAWN_AGENT_DESCRIPTION).toContain('explicitly approved the proposed teammate lineup');
    expect(TEAM_SPAWN_AGENT_DESCRIPTION).toContain('one short sentence explaining why additional teammates would help');
    expect(TEAM_SPAWN_AGENT_DESCRIPTION).toContain('Present the proposal as a table');
    expect(TEAM_SPAWN_AGENT_DESCRIPTION).toContain('recommended agent type/backend');
    expect(TEAM_SPAWN_AGENT_DESCRIPTION).toContain('change any names, responsibilities, or agent types');
    expect(TEAM_SPAWN_AGENT_DESCRIPTION).toContain(
      'they can later ask you to replace or adjust any teammate if the lineup is not working well'
    );
    expect(TEAM_SPAWN_AGENT_DESCRIPTION).toContain('Do NOT call this tool in that same turn');
  });

  it('only allows immediate creation when the user clearly asks for it', () => {
    expect(TEAM_SPAWN_AGENT_DESCRIPTION).toContain(
      'explicitly instructed you to create a specific teammate immediately'
    );
  });
});
