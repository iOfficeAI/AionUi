/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsSend = vi.fn<(name: string, data: unknown) => boolean>(() => true);
const frameHandlers = new Map<string, Array<(f: unknown) => void>>();

vi.mock('@/common/adapter/httpBridge', () => ({
  wsSend: (name: string, data: unknown) => wsSend(name, data),
  wsEmitter: (eventName: string) => ({
    on: (cb: (f: unknown) => void) => {
      const list = frameHandlers.get(eventName) ?? [];
      list.push(cb);
      frameHandlers.set(eventName, list);
      return () => {
        frameHandlers.set(
          eventName,
          (frameHandlers.get(eventName) ?? []).filter((h) => h !== cb)
        );
      };
    },
    emit: () => {},
  }),
}));

import { createWsScmTransport } from '@/renderer/pages/conversation/SourceControl/scmTransport';

const feed = (eventName: string, frame: unknown): void => {
  for (const handler of frameHandlers.get(eventName) ?? []) handler(frame);
};

beforeEach(() => {
  wsSend.mockClear();
  frameHandlers.clear();
});

describe('SCM WS transport envelope', () => {
  it('sends on the `scm` envelope, NOT the explorer `fs` one', () => {
    // The two lanes are separate backend routers: an SCM frame arriving on `fs`
    // would be dispatched to the explorer handler and silently dropped.
    const transport = createWsScmTransport();
    transport.send({ jsonrpc: '2.0', id: 1, method: 'scm/subscribe' });

    expect(wsSend).toHaveBeenCalledTimes(1);
    expect(wsSend.mock.calls[0][0]).toBe('scm');
  });

  it('reports a dropped frame when the socket is not open', () => {
    wsSend.mockReturnValueOnce(false);
    expect(createWsScmTransport().send({ jsonrpc: '2.0', method: 'scm/unsubscribe' })).toBe(false);
  });

  it('receives frames from the `scm` event and ignores `fs` traffic', () => {
    const seen: unknown[] = [];
    createWsScmTransport().onFrame((f) => seen.push(f));

    feed('fs', { jsonrpc: '2.0', method: 'fs/delta' });
    expect(seen).toEqual([]); // explorer traffic must not reach the SCM client

    feed('scm', { jsonrpc: '2.0', method: 'scm/statusChanged' });
    expect(seen).toEqual([{ jsonrpc: '2.0', method: 'scm/statusChanged' }]);
  });

  it('subscribes to the shared reconnect event', () => {
    const onReconnect = vi.fn();
    createWsScmTransport().onReconnect(onReconnect);

    feed('realtime.reconnected', undefined);
    expect(onReconnect).toHaveBeenCalledOnce();
  });

  it('stops delivering frames after unsubscribing', () => {
    const seen: unknown[] = [];
    const off = createWsScmTransport().onFrame((f) => seen.push(f));
    off();

    feed('scm', { jsonrpc: '2.0', method: 'scm/statusChanged' });
    expect(seen).toEqual([]);
  });
});
