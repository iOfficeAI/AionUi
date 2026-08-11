import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/app' },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      mcpStatus: { emit: vi.fn() },
      agentSpawned: { emit: vi.fn() },
      agentRemoved: { emit: vi.fn() },
      agentRenamed: { emit: vi.fn() },
    },
  },
}));

// Default to the simulated user language. Tests override per-case via mockImplementationOnce.
let configLanguage: string | null = 'en-US';
let configAssistants: Array<Record<string, unknown>> | null = null;

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async (key: string) => {
      if (key === 'assistants') return configAssistants;
      if (key === 'language') return configLanguage;
      return null;
    }),
  },
}));

vi.mock('@process/agent/AgentRegistry', () => ({
  agentRegistry: { getDetectedAgents: vi.fn(() => []) },
}));

import { TeamMcpServer } from '@process/team/mcp/team/TeamMcpServer';

type PrivateServer = {
  handleDescribeAssistant(args: Record<string, unknown>): Promise<string>;
};

const buildServer = (): PrivateServer =>
  new TeamMcpServer({
    teamId: 'team-test',
    getAgents: () => [],
    mailbox: { write: vi.fn(), readUnread: vi.fn() } as never,
    taskManager: {} as never,
    wakeAgent: vi.fn(),
  }) as unknown as PrivateServer;

describe('handleDescribeAssistant', () => {
  beforeEach(() => {
    configLanguage = 'en-US';
    configAssistants = null;
    vi.clearAllMocks();
  });

  it('returns description, skills, and example tasks for a builtin preset', async () => {
    configAssistants = [
      {
        id: 'builtin-word-creator',
        name: 'Word Creator',
        isPreset: true,
        enabled: true,
        presetAgentType: 'gemini',
        enabledSkills: ['officecli-docx'],
      },
    ];

    const server = buildServer();
    const result = await server.handleDescribeAssistant({ custom_agent_id: 'builtin-word-creator' });

    expect(result).toContain('# Word Creator (builtin-word-creator)');
    expect(result).toContain('Backend: gemini');
    expect(result).toContain('## Description');
    expect(result).toContain('## Skills');
    expect(result).toContain('- officecli-docx');
    expect(result).toContain('## Example tasks');
    expect(result).toContain('team_spawn_agent');
    expect(result).toContain('custom_agent_id="builtin-word-creator"');
  });

  it('throws when custom_agent_id is missing', async () => {
    const server = buildServer();
    await expect(server.handleDescribeAssistant({})).rejects.toThrow(/custom_agent_id is required/);
  });

  it('throws with a helpful list of available ids when the preset is not found', async () => {
    configAssistants = [
      { id: 'builtin-word-creator', name: 'Word Creator', isPreset: true, enabled: true },
      { id: 'builtin-cowork', name: 'Cowork', isPreset: true, enabled: true },
    ];

    const server = buildServer();
    await expect(server.handleDescribeAssistant({ custom_agent_id: 'does-not-exist' })).rejects.toThrow(
      /Available: builtin-word-creator, builtin-cowork/
    );
  });

  it('rejects disabled presets', async () => {
    configAssistants = [{ id: 'builtin-word-creator', name: 'Word Creator', isPreset: true, enabled: false }];

    const server = buildServer();
    await expect(server.handleDescribeAssistant({ custom_agent_id: 'builtin-word-creator' })).rejects.toThrow(
      /is disabled/
    );
  });

  it('respects an explicit locale override over the user language', async () => {
    configLanguage = 'en-US';
    configAssistants = [
      {
        id: 'builtin-word-creator',
        name: 'Word Creator',
        isPreset: true,
        enabled: true,
        presetAgentType: 'gemini',
      },
    ];

    const server = buildServer();
    const zh = await server.handleDescribeAssistant({
      custom_agent_id: 'builtin-word-creator',
      locale: 'zh-CN',
    });
    // The Chinese example prompt distinctly contains "季度报告".
    expect(zh).toContain('季度报告');
  });

  it('handles user-defined presets that have no matching builtin entry', async () => {
    configAssistants = [
      {
        id: 'my-custom',
        name: 'My Custom Writer',
        description: 'Writes novels',
        isPreset: true,
        enabled: true,
        presetAgentType: 'gemini',
        enabledSkills: [],
      },
    ];

    const server = buildServer();
    const result = await server.handleDescribeAssistant({ custom_agent_id: 'my-custom' });

    expect(result).toContain('# My Custom Writer (my-custom)');
    expect(result).toContain('Writes novels');
    expect(result).toContain('(none enabled)');
    expect(result).toContain('(no example prompts registered)');
  });
});
