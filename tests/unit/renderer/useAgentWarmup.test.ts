/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  clearAgentWarmupCacheForTest,
  resolveWarmupBackend,
  supportsAgentWarmup,
  warmupAgent,
} from '@/renderer/hooks/agent/useAgentWarmup';
import { ipcBridge } from '@/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      warmupAgent: {
        invoke: vi.fn(),
      },
    },
  },
}));

const warmupInvoke = vi.mocked(ipcBridge.acpConversation.warmupAgent.invoke);

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('agent warmup helper', () => {
  beforeEach(() => {
    clearAgentWarmupCacheForTest();
    warmupInvoke.mockReset();
  });

  afterEach(() => {
    clearAgentWarmupCacheForTest();
    vi.restoreAllMocks();
  });

  it('deduplicates concurrent warmups by backend', async () => {
    const deferred = createDeferred<{ results: [] }>();
    warmupInvoke.mockReturnValue(deferred.promise);

    const first = warmupAgent({ backend: 'codex', agent_type: 'acp' }, 'idle');
    const second = warmupAgent({ backend: 'codex', agent_type: 'acp' }, 'before_send');

    expect(second).toBe(first);
    expect(warmupInvoke).toHaveBeenCalledTimes(1);
    expect(warmupInvoke).toHaveBeenCalledWith({ backends: ['codex'], reason: 'idle' });

    deferred.resolve({ results: [] });
    await expect(first).resolves.toMatchObject({ ok: true, backend: 'codex', reason: 'idle' });
  });

  it('only warms Codex and Claude agents', async () => {
    await expect(warmupAgent({ backend: 'gemini', agent_type: 'acp' }, 'user_select')).resolves.toMatchObject({
      ok: false,
      skipped: true,
    });

    expect(supportsAgentWarmup({ backend: 'claude', agent_type: 'acp' })).toBe(true);
    expect(resolveWarmupBackend({ agent_type: 'codex' })).toBe('codex');
    expect(warmupInvoke).not.toHaveBeenCalled();
  });

  it('treats missing warmup endpoint as unsupported without throwing', async () => {
    warmupInvoke.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/agents/warmup',
        status: 404,
        body: { code: 'NOT_FOUND', error: 'not found' },
      })
    );

    await expect(warmupAgent({ backend: 'claude', agent_type: 'acp' }, 'idle')).resolves.toMatchObject({
      ok: false,
      backend: 'claude',
      skipped: true,
      unsupported: true,
    });
  });

  it('soft-fails unexpected warmup errors', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    warmupInvoke.mockRejectedValue(new Error('process failed'));

    await expect(warmupAgent({ backend: 'codex', agent_type: 'acp' }, 'before_send')).resolves.toMatchObject({
      ok: false,
      backend: 'codex',
      skipped: true,
      unsupported: false,
    });
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });
});
