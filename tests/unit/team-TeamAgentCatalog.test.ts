// tests/unit/team-TeamAgentCatalog.test.ts
//
// Covers the catalog's merge + capability filter behaviour. The goal of this
// module is that every team-related consumer (spawnAgent, handleSpawnAgent,
// modelListHandler, TeammateManager, TeamCreateModal) can rely on a single
// entry shape regardless of whether the underlying agent came from a builtin
// CLI, an extension adapter, a custom user-defined CLI, or a preset assistant.
//
// Rather than exercising each consumer, we mock the three upstream data sources
// (agentRegistry, ProcessConfig 'assistants', ProcessConfig
// 'acp.cachedInitializeResult') and assert the catalog produces the right
// entries — that's the contract the consumers depend on.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AcpDetectedAgent } from '@/common/types/detectedAgent';
import type { AcpBackendConfig, AcpInitializeResult } from '@/common/types/acpTypes';

// Stub the module dependencies that talk to disk / registry / IPC so tests are
// pure. Each mock returns fixture data; tests mutate the exposed state.

const registryState: { agents: AcpDetectedAgent[] } = { agents: [] };
const storageState: {
  assistants?: AcpBackendConfig[];
  init?: Record<string, AcpInitializeResult>;
} = {};

vi.mock('@process/agent/AgentRegistry', () => ({
  agentRegistry: {
    getDetectedAgents: () => registryState.agents,
  },
}));

vi.mock('@process/services/mcpServices/McpService', () => ({
  mcpService: {
    getSupportedTransportsForAgent: () => ['stdio'],
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: (key: string) => {
      if (key === 'assistants') return Promise.resolve(storageState.assistants);
      if (key === 'acp.cachedInitializeResult') return Promise.resolve(storageState.init);
      return Promise.resolve(undefined);
    },
  },
}));

import { TeamAgentCatalog } from '@process/team/TeamAgentCatalog';

function makeValidInitResult(): AcpInitializeResult {
  return {
    protocolVersion: 1,
    capabilities: {
      loadSession: false,
      promptCapabilities: { image: false, audio: false, embeddedContext: false },
      mcpCapabilities: { stdio: true, http: false, sse: false },
      sessionCapabilities: { fork: null, resume: null, list: null, close: null },
      _meta: {},
    },
    agentInfo: { name: 'test', version: '1.0.0' },
    authMethods: [],
  };
}

function builtin(backend: string, overrides: Partial<AcpDetectedAgent> = {}): AcpDetectedAgent {
  return {
    id: backend,
    name: backend,
    kind: 'acp',
    available: true,
    backend,
    cliPath: backend,
    ...overrides,
  };
}

function extension(backend: string, extName: string, overrides: Partial<AcpDetectedAgent> = {}): AcpDetectedAgent {
  return {
    id: backend,
    name: backend,
    kind: 'acp',
    available: true,
    backend,
    cliPath: backend,
    isExtension: true,
    extensionName: extName,
    customAgentId: `ext:${extName}:${backend}`,
    ...overrides,
  };
}

describe('TeamAgentCatalog', () => {
  let catalog: TeamAgentCatalog;

  beforeEach(() => {
    registryState.agents = [];
    storageState.assistants = undefined;
    storageState.init = undefined;
    catalog = new TeamAgentCatalog();
  });

  // The most load-bearing test: extension adapter backend name alone is
  // enough to get back cliPath + customAgentId. This is exactly the spawn
  // hole that crashed dbbc6630.
  it('resolveByBackend on extension backend returns full spawn metadata', async () => {
    registryState.agents = [extension('kaiwu', 'kaiwu-acp')];
    storageState.init = { custom: makeValidInitResult() };

    const entry = await catalog.resolveByBackend('kaiwu');
    expect(entry).toBeDefined();
    expect(entry!.source).toBe('extension');
    expect(entry!.cliPath).toBe('kaiwu');
    expect(entry!.customAgentId).toBe('ext:kaiwu-acp:kaiwu');
    expect(entry!.isTeamCapable).toBe(true);
  });

  it('resolveByBackend on builtin backend maps ACP_BACKENDS_ALL cliCommand', async () => {
    registryState.agents = [builtin('codex')];
    const entry = await catalog.resolveByBackend('codex');
    expect(entry?.source).toBe('builtin');
    expect(entry?.cliPath).toBe('codex');
    // codex is in KNOWN_TEAM_CAPABLE_BACKENDS so no cache required
    expect(entry?.isTeamCapable).toBe(true);
  });

  it('resolveByCustomAgentId finds preset assistant', async () => {
    storageState.assistants = [
      {
        id: 'pre-123',
        name: 'My Preset',
        isPreset: true,
        presetAgentType: 'claude',
        enabled: true,
      } as AcpBackendConfig,
    ];
    const entry = await catalog.resolveByCustomAgentId('pre-123');
    expect(entry?.source).toBe('preset');
    expect(entry?.backend).toBe('claude');
    expect(entry?.customAgentId).toBe('pre-123');
  });

  it('listTeamCapable filters out uncached non-known backends', async () => {
    registryState.agents = [builtin('codex'), builtin('qwen')];
    storageState.init = {}; // qwen has no cached capability
    const capable = await catalog.listTeamCapable();
    const backends = capable.map((e) => e.backend);
    expect(backends).toContain('codex');
    expect(backends).not.toContain('qwen');
  });

  it('extension beats builtin when backend names collide', async () => {
    // Unlikely in practice but worth pinning: if a user has both a 'snow'
    // builtin CLI and an extension also advertising backend='snow', the
    // extension's metadata (with its ext: customAgentId) must win so the
    // spawn layer gets the right identity.
    registryState.agents = [builtin('snow'), extension('snow', 'snow-ext')];
    const entry = await catalog.resolveByBackend('snow');
    expect(entry?.source).toBe('extension');
    expect(entry?.customAgentId).toBe('ext:snow-ext:snow');
  });

  it('preset disabled or non-preset assistants are skipped', async () => {
    storageState.assistants = [
      { id: 'a', name: 'a', isPreset: true, enabled: false, presetAgentType: 'claude' } as AcpBackendConfig,
      { id: 'b', name: 'b', isPreset: false, presetAgentType: 'claude' } as AcpBackendConfig,
      { id: 'c', name: 'c', isPreset: true, enabled: true, presetAgentType: 'claude' } as AcpBackendConfig,
    ];
    const all = await catalog.list();
    const ids = all.filter((e) => e.source === 'preset').map((e) => e.customAgentId);
    expect(ids).toEqual(['c']);
  });

  it('non-team backends (remote / openclaw-gateway / nanobot) are excluded', async () => {
    registryState.agents = [
      { ...builtin('openclaw-gateway'), kind: 'acp' } as AcpDetectedAgent,
      { ...builtin('nanobot'), kind: 'acp' } as AcpDetectedAgent,
    ];
    const all = await catalog.list();
    expect(all.find((e) => e.backend === 'openclaw-gateway')).toBeUndefined();
    expect(all.find((e) => e.backend === 'nanobot')).toBeUndefined();
  });

  it('resolveByBackend returns undefined for unknown backend', async () => {
    registryState.agents = [];
    const entry = await catalog.resolveByBackend('nonexistent');
    expect(entry).toBeUndefined();
  });

  it('resolveByBackend is case-sensitive (lowercase canonical)', async () => {
    registryState.agents = [extension('kaiwu', 'kaiwu-acp')];
    expect(await catalog.resolveByBackend('kaiwu')).toBeDefined();
    expect(await catalog.resolveByBackend('Kaiwu')).toBeUndefined();
  });

  // Regression guard: the TeamCreateModal dropdown listed gemini / aionrs
  // alongside ACP CLIs in the original (pre-catalog) UI. If the catalog
  // filtered those out by kind!=='acp' the visible dropdown would shrink.
  it('includes non-acp team-capable kinds (gemini / aionrs)', async () => {
    registryState.agents = [
      {
        id: 'gemini',
        name: 'Gemini CLI',
        kind: 'gemini',
        available: true,
        backend: 'gemini',
      } as unknown as AcpDetectedAgent,
      {
        id: 'aionrs',
        name: 'Aion CLI',
        kind: 'aionrs',
        available: true,
        backend: 'aionrs',
      } as unknown as AcpDetectedAgent,
    ];
    const all = await catalog.list();
    expect(all.find((e) => e.backend === 'gemini')).toBeDefined();
    expect(all.find((e) => e.backend === 'aionrs')).toBeDefined();
    // Both are in KNOWN_TEAM_CAPABLE_BACKENDS, so they must be team-capable.
    expect(all.find((e) => e.backend === 'gemini')!.isTeamCapable).toBe(true);
    expect(all.find((e) => e.backend === 'aionrs')!.isTeamCapable).toBe(true);
  });
});
