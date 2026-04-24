/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockDetectBuiltinAgents = vi.fn(async () => []);
const mockDetectExtensionAgents = vi.fn(async () => []);
const mockDetectCustomAgents = vi.fn(async () => []);
const mockClearEnvCache = vi.fn();
const mockIsCliAvailable = vi.fn(() => false);
const mockGetRemoteAgents = vi.fn(() => []);

vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: {
    detectBuiltinAgents: (...args: unknown[]) => mockDetectBuiltinAgents(...args),
    detectExtensionAgents: (...args: unknown[]) => mockDetectExtensionAgents(...args),
    detectCustomAgents: (...args: unknown[]) => mockDetectCustomAgents(...args),
    clearEnvCache: (...args: unknown[]) => mockClearEnvCache(...args),
    isCliAvailable: (...args: unknown[]) => mockIsCliAvailable(...args),
  },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn().mockResolvedValue({
    getRemoteAgents: (...args: unknown[]) => mockGetRemoteAgents(...args),
  }),
}));

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

import type { AcpDetectedAgent, RemoteDetectedAgent } from '../../../../src/common/types/detectedAgent';

function makeAcpAgent(opts: {
  id: string;
  name: string;
  backend: string;
  cliPath?: string;
  isExtension?: boolean;
  extensionName?: string;
}): AcpDetectedAgent {
  return {
    id: opts.id,
    name: opts.name,
    kind: 'acp',
    available: true,
    backend: opts.backend,
    cliPath: opts.cliPath ?? opts.id,
    acpArgs: ['--acp'],
    isExtension: opts.isExtension,
    extensionName: opts.extensionName,
  };
}

function makeRemoteAgentConfig(opts: { id: string; name: string; url?: string }) {
  return {
    id: opts.id,
    name: opts.name,
    url: opts.url ?? `wss://example.com/${opts.id}`,
    protocol: 'openclaw' as const,
    authType: 'none' as const,
  };
}

async function createFreshRegistry() {
  vi.resetModules();
  const mod = await import('@process/agent/AgentRegistry');
  return mod.agentRegistry;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentRegistry.deduplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectBuiltinAgents.mockResolvedValue([]);
    mockDetectExtensionAgents.mockResolvedValue([]);
    mockDetectCustomAgents.mockResolvedValue([]);
    mockIsCliAvailable.mockReturnValue(false);
    mockGetRemoteAgents.mockReturnValue([]);
  });

  it('keeps the first agent when two agents share the same backend', async () => {
    mockDetectBuiltinAgents.mockResolvedValue([
      makeAcpAgent({ id: 'qwen-v1', name: 'Qwen v1', backend: 'qwen', cliPath: '/usr/bin/qwen' }),
    ]);
    mockDetectExtensionAgents.mockResolvedValue([
      makeAcpAgent({
        id: 'qwen-v2',
        name: 'Qwen v2',
        backend: 'qwen',
        cliPath: '/ext/qwen',
        isExtension: true,
        extensionName: 'ext-qwen',
      }),
    ]);

    const registry = await createFreshRegistry();
    await registry.initialize();
    const agents = registry.getDetectedAgents();

    const qwenAgents = agents.filter((a) => a.backend === 'qwen');
    expect(qwenAgents).toHaveLength(1);
    // Builtin is merged before extension, so builtin wins
    expect(qwenAgents[0].id).toBe('qwen-v1');
  });

  it('deduplicates remote agents by id, not by backend', async () => {
    mockGetRemoteAgents.mockReturnValue([
      makeRemoteAgentConfig({ id: 'r1', name: 'Remote A' }),
      makeRemoteAgentConfig({ id: 'r1', name: 'Remote A Dup' }),
    ]);

    const registry = await createFreshRegistry();
    await registry.initialize();
    const agents = registry.getDetectedAgents();

    const remoteAgents = agents.filter((a) => a.kind === 'remote') as RemoteDetectedAgent[];
    // Both have id 'remote:r1' — only first survives
    expect(remoteAgents).toHaveLength(1);
    expect(remoteAgents[0].name).toBe('Remote A');
  });

  it('keeps both remote agents when they have different ids', async () => {
    mockGetRemoteAgents.mockReturnValue([
      makeRemoteAgentConfig({ id: 'r1', name: 'Remote A' }),
      makeRemoteAgentConfig({ id: 'r2', name: 'Remote B' }),
    ]);

    const registry = await createFreshRegistry();
    await registry.initialize();
    const agents = registry.getDetectedAgents();

    const remoteAgents = agents.filter((a) => a.kind === 'remote') as RemoteDetectedAgent[];
    expect(remoteAgents).toHaveLength(2);
    expect(remoteAgents.map((a) => a.remoteAgentId)).toEqual(['r1', 'r2']);
  });

  it('builtin wins over extension with same backend (merge order priority)', async () => {
    mockDetectBuiltinAgents.mockResolvedValue([
      makeAcpAgent({ id: 'claude', name: 'Claude Code', backend: 'claude', cliPath: 'claude' }),
    ]);
    mockDetectExtensionAgents.mockResolvedValue([
      makeAcpAgent({
        id: 'claude-ext',
        name: 'Claude Ext',
        backend: 'claude',
        cliPath: 'bunx @claude/claude',
        isExtension: true,
        extensionName: 'ext-claude',
      }),
    ]);

    const registry = await createFreshRegistry();
    await registry.initialize();
    const agents = registry.getDetectedAgents();

    const claudeAgents = agents.filter((a) => a.backend === 'claude');
    expect(claudeAgents).toHaveLength(1);
    expect(claudeAgents[0].id).toBe('claude');
    expect(claudeAgents[0].isExtension).toBeUndefined();
  });

  it('returns aionrs + gemini for empty sub-detector results', async () => {
    const registry = await createFreshRegistry();
    await registry.initialize();
    const agents = registry.getDetectedAgents();

    // Only the always-present agents
    expect(agents).toHaveLength(2);
    expect(agents[0].backend).toBe('aionrs');
    expect(agents[1].backend).toBe('gemini');
  });

  it('returns a single agent unchanged (no false dedup)', async () => {
    mockDetectBuiltinAgents.mockResolvedValue([
      makeAcpAgent({ id: 'codex', name: 'Codex', backend: 'codex', cliPath: 'codex' }),
    ]);

    const registry = await createFreshRegistry();
    await registry.initialize();
    const agents = registry.getDetectedAgents();

    // aionrs + gemini + codex
    expect(agents).toHaveLength(3);
    expect(agents[2]).toMatchObject({ id: 'codex', backend: 'codex' });
  });

  it('keeps multiple remote agents alongside a single non-remote backend', async () => {
    mockDetectBuiltinAgents.mockResolvedValue([
      makeAcpAgent({ id: 'claude', name: 'Claude Code', backend: 'claude', cliPath: 'claude' }),
    ]);
    mockGetRemoteAgents.mockReturnValue([
      makeRemoteAgentConfig({ id: 'r1', name: 'Remote 1' }),
      makeRemoteAgentConfig({ id: 'r2', name: 'Remote 2' }),
    ]);

    const registry = await createFreshRegistry();
    await registry.initialize();
    const agents = registry.getDetectedAgents();

    // aionrs + gemini + claude + 2 remotes
    expect(agents).toHaveLength(5);
    const remoteAgents = agents.filter((a) => a.kind === 'remote');
    expect(remoteAgents).toHaveLength(2);
    const claudeAgents = agents.filter((a) => a.backend === 'claude');
    expect(claudeAgents).toHaveLength(1);
  });
});
