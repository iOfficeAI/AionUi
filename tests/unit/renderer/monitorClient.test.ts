import { describe, expect, it, vi } from 'vitest';

import type { MonitorTransport } from '@/renderer/pages/conversation/explorer/monitorClient';
import {
  MonitorClient,
  RPC_ABANDONED,
  RPC_DISCONNECTED,
  RPC_MALFORMED_RESPONSE,
  RPC_RECONNECTED,
  RpcError,
} from '@/renderer/pages/conversation/explorer/monitorClient';

type Harness = {
  transport: MonitorTransport;
  sent: unknown[];
  feed: (frame: unknown) => void;
  reconnect: () => void;
  setSendOk: (ok: boolean) => void;
};

function makeHarness(): Harness {
  const sent: unknown[] = [];
  let frameCb: ((f: unknown) => void) | undefined;
  let reconnectCb: (() => void) | undefined;
  let sendOk = true;
  return {
    transport: {
      send: (f) => {
        sent.push(f);
        return sendOk;
      },
      onFrame: (cb) => {
        frameCb = cb;
        return () => {
          frameCb = undefined;
        };
      },
      onReconnect: (cb) => {
        reconnectCb = cb;
        return () => {
          reconnectCb = undefined;
        };
      },
    },
    sent,
    feed: (frame) => frameCb?.(frame),
    reconnect: () => reconnectCb?.(),
    setSendOk: (ok) => {
      sendOk = ok;
    },
  };
}

describe('MonitorClient request/response pairing', () => {
  it('sends a request frame with an id and resolves on the matching response', async () => {
    const h = makeHarness();
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });

    const promise = client.request('fs/subscribe', { targets: [] });
    expect(h.sent).toHaveLength(1);
    const frame = h.sent[0] as { jsonrpc: string; id: number; method: string; params: unknown };
    expect(frame).toMatchObject({ jsonrpc: '2.0', method: 'fs/subscribe', params: { targets: [] } });
    expect(typeof frame.id).toBe('number');

    h.feed({ jsonrpc: '2.0', id: frame.id, result: { snapshots: [] } });
    await expect(promise).resolves.toEqual({ snapshots: [] });
  });

  it('rejects with RpcError on an error response', async () => {
    const h = makeHarness();
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });

    const promise = client.request('fs/read', {});
    const id = (h.sent[0] as { id: number }).id;
    h.feed({ jsonrpc: '2.0', id, error: { code: -32002, message: 'resource_not_found' } });

    await expect(promise).rejects.toBeInstanceOf(RpcError);
    await promise.catch((e: RpcError) => {
      expect(e.code).toBe(-32002);
      expect(e.message).toBe('resource_not_found');
    });
  });

  it('gives each request a distinct monotonic id', () => {
    const h = makeHarness();
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });
    void client.request('a');
    void client.request('b');
    const ids = h.sent.map((f) => (f as { id: number }).id);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[1]).toBeGreaterThan(ids[0]);
  });

  it('rejects immediately when the transport is offline (no pending leak)', async () => {
    const h = makeHarness();
    h.setSendOk(false);
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });

    const promise = client.request('fs/subscribe');
    await expect(promise).rejects.toMatchObject({ code: RPC_DISCONNECTED });
    // A late response for that id must not throw (nothing pending).
    expect(() => h.feed({ jsonrpc: '2.0', id: 1, result: {} })).not.toThrow();
  });

  it('ignores a response with an unknown id', () => {
    const h = makeHarness();
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });
    expect(() => h.feed({ jsonrpc: '2.0', id: 999, result: {} })).not.toThrow();
  });

  it('rejects (not leaks) a pending request when the matching frame has neither result nor error', async () => {
    const h = makeHarness();
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });

    const promise = client.request('fs/subscribe');
    const id = (h.sent[0] as { id: number }).id;
    // Malformed response for `id`: numeric id, no result, no error, no method.
    h.feed({ jsonrpc: '2.0', id });

    await expect(promise).rejects.toMatchObject({ code: RPC_MALFORMED_RESPONSE });
    // The id is settled and gone — a second frame for it is a harmless no-op.
    expect(() => h.feed({ jsonrpc: '2.0', id, result: {} })).not.toThrow();
  });

  it('ignores a malformed (no result/error/method) frame with an unknown id', () => {
    const h = makeHarness();
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });
    expect(() => h.feed({ jsonrpc: '2.0', id: 4242 })).not.toThrow();
    void client;
  });
});

describe('MonitorClient notifications', () => {
  it('routes id-less frames to onNotification', () => {
    const h = makeHarness();
    const onNotification = vi.fn();
    new MonitorClient({ transport: h.transport, onNotification });

    h.feed({ jsonrpc: '2.0', method: 'fs/delta', params: { target: { pe_id: 'pe1', relative_path: 'src' } } });
    expect(onNotification).toHaveBeenCalledWith('fs/delta', { target: { pe_id: 'pe1', relative_path: 'src' } });
  });

  it('notify sends a frame without an id', () => {
    const h = makeHarness();
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });
    client.notify('fs/unsubscribe', { targets: [] });
    expect(h.sent[0]).toEqual({ jsonrpc: '2.0', method: 'fs/unsubscribe', params: { targets: [] } });
    expect('id' in (h.sent[0] as object)).toBe(false);
  });

  it('ignores malformed inbound frames', () => {
    const h = makeHarness();
    const onNotification = vi.fn();
    const client = new MonitorClient({ transport: h.transport, onNotification });
    expect(() => {
      h.feed(null);
      h.feed(42);
      h.feed({ jsonrpc: '2.0' }); // no id, no method
    }).not.toThrow();
    expect(onNotification).not.toHaveBeenCalled();
    void client;
  });
});

describe('MonitorClient reconnect', () => {
  it('rejects in-flight requests and fires the reconnect callback', async () => {
    const h = makeHarness();
    const onReconnect = vi.fn();
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {}, onReconnect });

    const promise = client.request('fs/subscribe');
    h.reconnect();

    await expect(promise).rejects.toMatchObject({ code: RPC_RECONNECTED });
    expect(onReconnect).toHaveBeenCalledOnce();
  });
});

describe('MonitorClient requestWithId (streaming)', () => {
  it('surfaces the assigned id and resolves the result on the matching response', async () => {
    const h = makeHarness();
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });

    const { id, result } = client.requestWithId('fs/search', { roots: [], query: 'x' });
    const frame = h.sent[0] as { id: number; method: string };
    expect(frame.id).toBe(id);
    expect(frame.method).toBe('fs/search');

    h.feed({ jsonrpc: '2.0', id, result: { limit_reached: false, total: 0 } });
    await expect(result).resolves.toEqual({ limit_reached: false, total: 0 });
  });

  it('assigns an id even when offline and rejects the result', async () => {
    const h = makeHarness();
    h.setSendOk(false);
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });

    const { id, result } = client.requestWithId('fs/search', {});
    expect(typeof id).toBe('number');
    await expect(result).rejects.toMatchObject({ code: RPC_DISCONNECTED });
  });

  it('gives distinct monotonic ids across requests', () => {
    const h = makeHarness();
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });
    const a = client.requestWithId('fs/search', {}).id;
    const b = client.requestWithId('fs/search', {}).id;
    expect(b).toBe(a + 1);
  });
});

describe('MonitorClient abandon (superseded streaming request)', () => {
  it('rejects the abandoned request with RPC_ABANDONED and ignores its later response', async () => {
    const h = makeHarness();
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });

    const { id, result } = client.requestWithId('fs/search', {});
    client.abandon(id);
    await expect(result).rejects.toMatchObject({ code: RPC_ABANDONED });

    // A late terminal for the abandoned id must not throw or re-settle.
    expect(() => h.feed({ jsonrpc: '2.0', id, result: { limit_reached: false, total: 0 } })).not.toThrow();
  });

  it('is a no-op for an unknown id', () => {
    const h = makeHarness();
    const client = new MonitorClient({ transport: h.transport, onNotification: () => {} });
    expect(() => client.abandon(999)).not.toThrow();
  });
});

describe('MonitorClient dispose', () => {
  it('unsubscribes from transport and rejects pending', async () => {
    const h = makeHarness();
    const onNotification = vi.fn();
    const client = new MonitorClient({ transport: h.transport, onNotification });

    const promise = client.request('fs/subscribe');
    client.dispose();
    await expect(promise).rejects.toMatchObject({ code: RPC_DISCONNECTED });

    // After dispose, transport frames no longer reach the client.
    h.feed({ jsonrpc: '2.0', method: 'fs/delta', params: {} });
    expect(onNotification).not.toHaveBeenCalled();
  });
});
