/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AcpConnection } from '../../src/process/agent/acp/AcpConnection';
import { AcpAgent } from '../../src/process/agent/acp/index';

vi.mock('@process/utils/initStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@process/utils/initStorage')>();
  return {
    ...actual,
    ProcessConfig: {
      ...actual.ProcessConfig,
      get: vi.fn().mockResolvedValue([]),
    },
  };
});

// ─── helpers ────────────────────────────────────────────────────────────────

function makeAgent(backend: string, extra: Record<string, unknown> = {}): AcpAgent {
  return new AcpAgent({
    id: 'test-agent',
    backend: backend as any,
    workingDir: '/tmp',
    extra: {
      backend: backend as any,
      workspace: '/tmp',
      ...extra,
    },
    onStreamEvent: vi.fn(),
  });
}

// ─── AcpAgent.start — pending config options ────────────────────────────────

describe('AcpAgent.start — pending config options from Guid page', () => {
  let agent: AcpAgent;
  let conn: AcpConnection;

  beforeEach(() => {
    agent = makeAgent('codex', {
      pendingConfigOptions: { thought_level: 'high', reasoning: 'detailed' },
    });
    conn = (agent as any).connection;
    // Stub out connection, auth, session creation, and other start() steps
    vi.spyOn(conn, 'connect').mockResolvedValue(undefined);
    vi.spyOn(agent as any, 'performAuthentication').mockResolvedValue(undefined);
    vi.spyOn(agent as any, 'createOrResumeSession').mockResolvedValue(undefined);
    vi.spyOn(agent as any, 'applySessionMode').mockResolvedValue(undefined);
    vi.spyOn(agent as any, 'emitModelInfo').mockReturnValue(undefined);
    vi.spyOn(agent as any, 'emitStatusMessage').mockReturnValue(undefined);
  });

  it('applies each pending config option via setConfigOption', async () => {
    const setConfigOption = vi.spyOn(conn, 'setConfigOption').mockResolvedValue({} as any);

    await agent.start();

    expect(setConfigOption).toHaveBeenCalledWith('thought_level', 'high');
    expect(setConfigOption).toHaveBeenCalledWith('reasoning', 'detailed');
    expect(setConfigOption).toHaveBeenCalledTimes(2);
  });

  it('continues applying remaining options when one fails', async () => {
    const setConfigOption = vi.spyOn(conn, 'setConfigOption').mockImplementation(async (configId: string) => {
      if (configId === 'thought_level') throw new Error('option not supported');
      return {} as any;
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await agent.start();

    // Should still attempt the second option despite first failure
    expect(setConfigOption).toHaveBeenCalledWith('reasoning', 'detailed');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('thought_level'));
    warnSpy.mockRestore();
  });

  it('skips setConfigOption entirely when pendingConfigOptions is undefined', async () => {
    const agentNoPending = makeAgent('codex');
    const connNoPending = (agentNoPending as any).connection;
    vi.spyOn(connNoPending, 'connect').mockResolvedValue(undefined);
    vi.spyOn(agentNoPending as any, 'performAuthentication').mockResolvedValue(undefined);
    vi.spyOn(agentNoPending as any, 'createOrResumeSession').mockResolvedValue(undefined);
    vi.spyOn(agentNoPending as any, 'applySessionMode').mockResolvedValue(undefined);
    vi.spyOn(agentNoPending as any, 'emitModelInfo').mockReturnValue(undefined);
    vi.spyOn(agentNoPending as any, 'emitStatusMessage').mockReturnValue(undefined);
    const setConfigOption = vi.spyOn(connNoPending, 'setConfigOption').mockResolvedValue({} as any);

    await agentNoPending.start();

    expect(setConfigOption).not.toHaveBeenCalled();
  });

  it('skips setConfigOption when pendingConfigOptions is empty object', async () => {
    const agentEmpty = makeAgent('codex', { pendingConfigOptions: {} });
    const connEmpty = (agentEmpty as any).connection;
    vi.spyOn(connEmpty, 'connect').mockResolvedValue(undefined);
    vi.spyOn(agentEmpty as any, 'performAuthentication').mockResolvedValue(undefined);
    vi.spyOn(agentEmpty as any, 'createOrResumeSession').mockResolvedValue(undefined);
    vi.spyOn(agentEmpty as any, 'applySessionMode').mockResolvedValue(undefined);
    vi.spyOn(agentEmpty as any, 'emitModelInfo').mockReturnValue(undefined);
    vi.spyOn(agentEmpty as any, 'emitStatusMessage').mockReturnValue(undefined);
    const setConfigOption = vi.spyOn(connEmpty, 'setConfigOption').mockResolvedValue({} as any);

    await agentEmpty.start();

    expect(setConfigOption).not.toHaveBeenCalled();
  });
});

// ─── cachedConfigOptions merge with pendingConfigOptions ────────────────────

describe('cachedConfigOptions merge with pendingConfigOptions', () => {
  // Replicate the merge logic from useGuidSend.ts
  function mergeCachedWithPending(cached: unknown[], pending: Record<string, string>): unknown[] {
    if (Object.keys(pending).length === 0) return cached;
    return cached.map((opt: unknown) => {
      const o = opt as { id?: string; currentValue?: string; selectedValue?: string };
      const pendingVal = o.id ? pending[o.id] : undefined;
      return pendingVal ? { ...o, currentValue: pendingVal, selectedValue: pendingVal } : o;
    });
  }

  const CACHED_OPTIONS = [
    {
      id: 'thought_level',
      type: 'select',
      category: 'config',
      currentValue: 'medium',
      selectedValue: 'medium',
      options: [
        { value: 'low', name: 'Low' },
        { value: 'medium', name: 'Medium' },
        { value: 'high', name: 'High' },
      ],
    },
    {
      id: 'reasoning',
      type: 'select',
      category: 'config',
      currentValue: 'standard',
      selectedValue: 'standard',
      options: [
        { value: 'standard', name: 'Standard' },
        { value: 'detailed', name: 'Detailed' },
      ],
    },
  ];

  it('updates currentValue and selectedValue for matched options', () => {
    const result = mergeCachedWithPending(CACHED_OPTIONS, { thought_level: 'high' });

    const updated = result as typeof CACHED_OPTIONS;
    expect(updated[0].currentValue).toBe('high');
    expect(updated[0].selectedValue).toBe('high');
  });

  it('leaves unmatched options unchanged', () => {
    const result = mergeCachedWithPending(CACHED_OPTIONS, { thought_level: 'high' });

    const updated = result as typeof CACHED_OPTIONS;
    expect(updated[1].currentValue).toBe('standard');
    expect(updated[1].selectedValue).toBe('standard');
  });

  it('returns original array when pending is empty', () => {
    const result = mergeCachedWithPending(CACHED_OPTIONS, {});

    expect(result).toBe(CACHED_OPTIONS); // Same reference, not a copy
  });

  it('handles empty cached options without error', () => {
    const result = mergeCachedWithPending([], { thought_level: 'high' });

    expect(result).toEqual([]);
  });

  it('handles options without id field gracefully', () => {
    const cached = [{ type: 'select', currentValue: 'x' }];
    const result = mergeCachedWithPending(cached, { thought_level: 'high' });

    // Should remain unchanged since no id to match
    expect((result[0] as any).currentValue).toBe('x');
  });

  it('updates multiple options when multiple pending values exist', () => {
    const result = mergeCachedWithPending(CACHED_OPTIONS, {
      thought_level: 'high',
      reasoning: 'detailed',
    });

    const updated = result as typeof CACHED_OPTIONS;
    expect(updated[0].currentValue).toBe('high');
    expect(updated[1].currentValue).toBe('detailed');
  });

  it('preserves other properties of the option object', () => {
    const result = mergeCachedWithPending(CACHED_OPTIONS, { thought_level: 'high' });

    const updated = result as typeof CACHED_OPTIONS;
    expect(updated[0].options).toEqual(CACHED_OPTIONS[0].options);
    expect(updated[0].type).toBe('select');
    expect(updated[0].category).toBe('config');
  });
});
