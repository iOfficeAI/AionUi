import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/app' },
}));

const MOCK_CACHED_INIT = {
  claude: {
    protocolVersion: 1,
    capabilities: {
      mcpCapabilities: { stdio: true, http: false, sse: false },
    },
  },
};

const MOCK_CACHED_MODELS: Record<string, { availableModels: Array<{ id: string }> }> = {
  claude: {
    availableModels: [{ id: 'claude-sonnet-4-20250514' }, { id: 'claude-opus-4-20250514' }],
  },
};

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async (key: string) => {
      if (key === 'acp.cachedModels') return MOCK_CACHED_MODELS;
      if (key === 'acp.cachedInitializeResult') return MOCK_CACHED_INIT;
      return null;
    }),
  },
}));

vi.mock('@process/bridge/modelBridge', () => ({
  getMergedModelProviders: vi.fn(async () => []),
}));

vi.mock('../../src/process/team/googleAuthCheck', () => ({
  hasGeminiOauthCreds: vi.fn(async () => false),
}));

vi.mock('@process/agent/AgentRegistry', () => ({
  agentRegistry: {
    getDetectedAgents: vi.fn(() => [{ backend: 'claude', name: 'Claude' }]),
  },
}));

import { handleListModels } from '@process/team/mcp/modelListHandler';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('handleListModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns models for a specific agent_type', async () => {
    const result = await handleListModels({ agent_type: 'claude' });
    expect(result).toContain('## Models for claude');
    expect(result).toContain('- claude-sonnet-4-20250514');
    expect(result).toContain('- claude-opus-4-20250514');
  });

  it('returns "no models" for an unknown agent_type', async () => {
    const result = await handleListModels({ agent_type: 'unknown-backend' });
    expect(result).toBe('No models available for agent type "unknown-backend".');
  });

  it('lists all team-capable backends when no agent_type is given', async () => {
    const result = await handleListModels({});
    expect(result).toContain('## Available Models by Agent Type');
    expect(result).toContain('### Claude (`claude`)');
    expect(result).toContain('claude-sonnet-4-20250514');
  });

  it('returns "no team-capable agents" when none detected', async () => {
    const { agentRegistry } = await import('@process/agent/AgentRegistry');
    vi.mocked(agentRegistry.getDetectedAgents).mockReturnValueOnce([]);

    const result = await handleListModels({});
    expect(result).toBe('No team-capable agent types detected.');
  });
});
