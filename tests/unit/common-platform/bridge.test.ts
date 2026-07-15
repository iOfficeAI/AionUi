/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type TransportEmitter = {
  emit: (name: string, data: unknown) => unknown;
};

const loadLoopbackBridge = async () => {
  vi.resetModules();
  const { bridge } = await import('@/common/platform/bridge');
  let incoming: TransportEmitter | undefined;
  const outbound: Array<{ name: string; data: unknown }> = [];

  bridge.adapter({
    emit(name, data) {
      outbound.push({ name, data });
      return incoming?.emit(name, data);
    },
    on(emitter) {
      incoming = emitter;
    },
  });

  return { bridge, getIncoming: () => incoming, outbound };
};

describe('local bridge', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('routes provider requests and replies through the subscribe protocol', async () => {
    const { bridge, outbound } = await loadLoopbackBridge();
    const provider = bridge.buildProvider<string, { value: string }>('test.echo');
    provider.provider(({ value }) => value.toUpperCase());

    await expect(provider.invoke({ value: 'hello' })).resolves.toBe('HELLO');
    expect(outbound[0]?.name).toBe('subscribe-test.echo');
    expect(outbound[1]?.name).toMatch(/^subscribe\.callback-test\.echo/);
  });

  it('replaces the previous provider for the same key', async () => {
    const { bridge } = await loadLoopbackBridge();
    const endpoint = bridge.buildProvider<string, void>('test.replace');
    const first = vi.fn(() => 'first');
    endpoint.provider(first);
    endpoint.provider(() => 'second');

    await expect(endpoint.invoke()).resolves.toBe('second');
    expect(first).not.toHaveBeenCalled();
  });

  it('ignores malformed requests without invoking the provider', async () => {
    const { bridge, getIncoming } = await loadLoopbackBridge();
    const handler = vi.fn(() => 'unused');
    bridge.buildProvider<string, string>('test.invalid').provider(handler);

    getIncoming()?.emit('subscribe-test.invalid', { data: 'missing-id' });
    await Promise.resolve();

    expect(handler).not.toHaveBeenCalled();
  });

  it('logs rejected providers without emitting a success callback', async () => {
    const { bridge, getIncoming, outbound } = await loadLoopbackBridge();
    const error = new Error('provider failed');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bridge.buildProvider<string, void>('test.failure').provider(() => Promise.reject(error));

    getIncoming()?.emit('subscribe-test.failure', { id: 'request-1', data: undefined });
    await Promise.resolve();
    await Promise.resolve();

    expect(console.error).toHaveBeenCalledWith('[bridge] Provider "test.failure" failed:', error);
    expect(outbound.some(({ name }) => name === 'subscribe.callback-test.failurerequest-1')).toBe(false);
  });
});
