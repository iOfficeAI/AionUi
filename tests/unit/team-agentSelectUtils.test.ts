// tests/unit/team-agentSelectUtils.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolveConversationType,
  filterTeamSupportedAgents,
  agentKey,
  agentFromKey,
  resolveTeamAgentType,
} from '@renderer/pages/team/components/agentSelectUtils';
import { isTeamCapableBackend, getTeamCapableBackends } from '@/common/types/teamTypes';
import { buildTeamMcpServer } from '@process/agent/acp/mcpSessionConfig';
import type { AvailableAgent } from '@renderer/utils/model/agentTypes';
import type { AcpInitializeResult } from '@/common/types/acpTypes';

// Helper to build a minimal cached AcpInitializeResult with mcpCapabilities.stdio = true
function makeCachedInit(backends: string[]): Record<string, AcpInitializeResult> {
  const result: Record<string, AcpInitializeResult> = {};
  for (const b of backends) {
    result[b] = {
      protocolVersion: 1,
      capabilities: {
        loadSession: false,
        promptCapabilities: { image: false, audio: false, embeddedContext: false },
        mcpCapabilities: { stdio: true, http: false, sse: false },
        sessionCapabilities: { fork: null, resume: null, list: null, close: null },
        _meta: {},
      },
      agentInfo: null,
      authMethods: [],
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// resolveConversationType
// ---------------------------------------------------------------------------
describe('resolveConversationType', () => {
  it('maps gemini to gemini', () => {
    expect(resolveConversationType('gemini')).toBe('gemini');
  });

  it('maps aionrs to aionrs', () => {
    expect(resolveConversationType('aionrs')).toBe('aionrs');
  });

  it('maps codex to acp (MCP injectable)', () => {
    expect(resolveConversationType('codex')).toBe('acp');
  });

  it('maps openclaw-gateway to openclaw-gateway', () => {
    expect(resolveConversationType('openclaw-gateway')).toBe('openclaw-gateway');
  });

  it('maps nanobot to nanobot', () => {
    expect(resolveConversationType('nanobot')).toBe('nanobot');
  });

  it('maps remote to remote', () => {
    expect(resolveConversationType('remote')).toBe('remote');
  });

  it.each(['claude', 'qwen', 'deepseek', 'grok', 'some-future-acp-backend'])(
    'maps unknown backend "%s" to acp (default, MCP injectable)',
    (backend) => {
      expect(resolveConversationType(backend)).toBe('acp');
    }
  );
});

// ---------------------------------------------------------------------------
// isTeamCapableBackend — dynamic capability check
// ---------------------------------------------------------------------------
describe('isTeamCapableBackend', () => {
  const cached = makeCachedInit(['claude', 'codex']);

  it('returns true for known team-capable backends regardless of cached data', () => {
    for (const backend of ['gemini', 'claude', 'codex', 'aionrs']) {
      expect(isTeamCapableBackend(backend, null)).toBe(true);
      expect(isTeamCapableBackend(backend, undefined)).toBe(true);
      expect(isTeamCapableBackend(backend, {})).toBe(true);
      expect(isTeamCapableBackend(backend, cached)).toBe(true);
    }
  });

  it('returns false for ACP backend without cached init result', () => {
    expect(isTeamCapableBackend('qwen', cached)).toBe(false);
    expect(isTeamCapableBackend('codebuddy', cached)).toBe(false);
  });

  it('returns false for unknown backend when cached data is null', () => {
    expect(isTeamCapableBackend('qwen', null)).toBe(false);
  });

  it('returns false for unknown backend when cached data is undefined', () => {
    expect(isTeamCapableBackend('qwen', undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getTeamCapableBackends
// ---------------------------------------------------------------------------
describe('getTeamCapableBackends', () => {
  const cached = makeCachedInit(['claude', 'codex']);

  it('returns only backends with cached init + gemini', () => {
    const result = getTeamCapableBackends(['claude', 'codex', 'gemini', 'qwen'], cached);
    expect(result).toEqual(['claude', 'codex', 'gemini']);
  });

  it('returns known team-capable backends even without cached data', () => {
    const result = getTeamCapableBackends(['claude', 'codex', 'gemini', 'qwen'], null);
    expect(result).toEqual(['claude', 'codex', 'gemini']);
  });
});

// ---------------------------------------------------------------------------
// filterTeamSupportedAgents
// ---------------------------------------------------------------------------
describe('filterTeamSupportedAgents', () => {
  const makeAgent = (backend: string, overrides?: Partial<AvailableAgent>): AvailableAgent =>
    ({
      backend,
      name: backend,
      conversationType: 'acp',
      ...overrides,
    }) as AvailableAgent;

  const cached = makeCachedInit(['claude', 'codex']);

  it('keeps agents with cached init results and gemini', () => {
    const agents = [
      makeAgent('claude'),
      makeAgent('gemini'),
      makeAgent('codex'),
      makeAgent('qwen'),
      makeAgent('codebuddy'),
    ];
    const result = filterTeamSupportedAgents(agents, cached);
    expect(result.map((a: AvailableAgent) => a.backend)).toEqual(['claude', 'gemini', 'codex']);
  });

  it('uses presetAgentType over backend when available', () => {
    const agent = makeAgent('claude', { presetAgentType: 'qwen' });
    const result = filterTeamSupportedAgents([agent], cached);
    // qwen has no cached init → filtered out
    expect(result).toHaveLength(0);
  });

  it('returns known team-capable agents even without cached data', () => {
    const agents = [makeAgent('claude'), makeAgent('gemini'), makeAgent('codex'), makeAgent('qwen')];
    const result = filterTeamSupportedAgents(agents, null);
    expect(result.map((a: AvailableAgent) => a.backend)).toEqual(['claude', 'gemini', 'codex']);
  });

  it('returns all agents when all have cached init results', () => {
    const agents = [makeAgent('claude'), makeAgent('codex')];
    expect(filterTeamSupportedAgents(agents, cached)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// agentKey / agentFromKey
// ---------------------------------------------------------------------------
describe('agentKey', () => {
  it('returns cli:: prefix for CLI agents', () => {
    expect(agentKey({ backend: 'claude' } as AvailableAgent)).toBe('cli::claude');
  });

  it('returns preset:: prefix for custom agents', () => {
    expect(agentKey({ backend: 'claude', customAgentId: 'my-agent' } as AvailableAgent)).toBe('preset::my-agent');
  });
});

describe('agentFromKey', () => {
  const agents = [
    { backend: 'claude' } as AvailableAgent,
    { backend: 'claude', customAgentId: 'my-agent' } as AvailableAgent,
  ];

  it('finds CLI agent by key', () => {
    expect(agentFromKey('cli::claude', agents)).toBe(agents[0]);
  });

  it('finds preset agent by key', () => {
    expect(agentFromKey('preset::my-agent', agents)).toBe(agents[1]);
  });

  it('returns undefined for unknown key', () => {
    expect(agentFromKey('cli::unknown', agents)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveTeamAgentType
// ---------------------------------------------------------------------------
describe('resolveTeamAgentType', () => {
  it('returns presetAgentType when available', () => {
    expect(resolveTeamAgentType({ presetAgentType: 'qwen' } as AvailableAgent, 'fallback')).toBe('qwen');
  });

  it('falls back to backend when no presetAgentType', () => {
    expect(resolveTeamAgentType({ backend: 'claude' } as AvailableAgent, 'fallback')).toBe('claude');
  });

  it('returns fallback when agent is undefined', () => {
    expect(resolveTeamAgentType(undefined, 'fallback')).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// buildTeamMcpServer — the actual injection builder used by AcpAgent
// ---------------------------------------------------------------------------
describe('buildTeamMcpServer', () => {
  const validConfig = {
    name: 'team-mcp',
    command: '/usr/bin/node',
    args: ['server.js', '--team-id=abc'],
    env: [{ name: 'TEAM_ID', value: 'abc' }],
  };

  it('returns a valid stdio server entry when config is complete', () => {
    const result = buildTeamMcpServer(validConfig);
    expect(result).toEqual({
      name: 'team-mcp',
      command: '/usr/bin/node',
      args: ['server.js', '--team-id=abc'],
      env: [{ name: 'TEAM_ID', value: 'abc' }],
    });
  });

  it('returns null when config is undefined', () => {
    expect(buildTeamMcpServer(undefined)).toBeNull();
  });

  it('returns null when config is null', () => {
    expect(buildTeamMcpServer(null)).toBeNull();
  });

  it('returns null when command is empty string', () => {
    expect(buildTeamMcpServer({ ...validConfig, command: '' })).toBeNull();
  });

  it('preserves all env entries', () => {
    const config = {
      ...validConfig,
      env: [
        { name: 'TEAM_ID', value: 'abc' },
        { name: 'SLOT_ID', value: 'slot-1' },
      ],
    };
    const result = buildTeamMcpServer(config);
    expect(result?.env).toHaveLength(2);
    expect(result?.env[1]).toEqual({ name: 'SLOT_ID', value: 'slot-1' });
  });

  it('preserves empty args array', () => {
    const result = buildTeamMcpServer({ ...validConfig, args: [] });
    expect(result?.args).toEqual([]);
  });
});
