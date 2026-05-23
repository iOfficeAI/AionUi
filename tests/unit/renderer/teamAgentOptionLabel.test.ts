import { describe, expect, it } from 'vitest';
import { getTeamAgentOptionLabel } from '@renderer/pages/team/components/agentSelectUtils';

describe('getTeamAgentOptionLabel', () => {
  it('keeps preset assistant names unchanged', () => {
    expect(
      getTeamAgentOptionLabel({
        id: 'ozon-assistants',
        name: 'Ozon Assistants',
        kind: 'preset',
        backend: 'aionrs',
      })
    ).toBe('Ozon Assistants');
  });

  it('brands cli agents as POUNDING CLI', () => {
    expect(
      getTeamAgentOptionLabel({
        id: 'aionrs',
        name: 'Aion CLI',
        kind: 'cli',
        backend: 'aionrs',
      })
    ).toBe('POUNDING CLI');
  });
});
