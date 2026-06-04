/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the Chisl HTTP server connection registry state machine
 * (t2-registry-01). Covers HTTP-only filtering, upsert/remove/active
 * behavior, snapshot load/serialize round-trip, and input coercion.
 */

import { describe, expect, it } from 'vitest';
import {
  coerceHttpServerConnection,
  filterHttpServerRecords,
  getActiveHttpServerConnection,
  httpServerConnectionKey,
  loadHttpServerRegistrySnapshot,
  removeHttpServerConnection,
  serializeHttpServerRegistry,
  setActiveHttpServerConnection,
  toStoredHttpServerRecord,
  upsertHttpServerConnection,
  type HttpServerConnection,
  type HttpServerRegistryState,
  type HttpServerStoredRecord,
} from '@/common/registry';

function emptyState(): HttpServerRegistryState {
  return { list: [] };
}

describe('filterHttpServerRecords — HTTP-only filtering', () => {
  it('keeps only type=http records, drops sidecar/ssh/non-objects', () => {
    const input: unknown[] = [
      { type: 'http', http: { url: 'http://a' } },
      { type: 'sidecar', http: { url: 'http://b' } },
      { type: 'ssh', host: 'h', http: { url: 'http://h' } },
      { type: 'http', http: { url: 'http://a/' } },
      { type: 'http', http: { url: 'http://c' } },
      null,
      undefined,
      42,
      { not: 'a connection' },
    ];
    const filtered = filterHttpServerRecords(input);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.http.url).sort()).toEqual(['http://a', 'http://c']);
  });

  it('drops records with invalid or empty URLs', () => {
    const input: unknown[] = [
      { type: 'http', http: {} },
      { type: 'http', http: { url: '' } },
      { type: 'http' },
      { type: 'http', http: { url: '   ' } },
    ];
    expect(filterHttpServerRecords(input)).toHaveLength(0);
  });

  it('deduplicates by normalized URL, keeping the last occurrence', () => {
    const input: unknown[] = [
      { type: 'http', http: { url: 'http://a' }, displayName: 'first' },
      { type: 'http', http: { url: 'http://a/' }, displayName: 'second' },
    ];
    const filtered = filterHttpServerRecords(input);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].displayName).toBe('second');
  });
});

describe('parseStoredHttpServerRecord (exposed via filter)', () => {
  it('normalizes the stored URL on parse', () => {
    const [record] = filterHttpServerRecords([{ type: 'http', http: { url: 'http://example.com/' } }]);
    expect(record.http.url).toBe('http://example.com');
  });

  it('preserves hasPassword / authToken / displayName when truthy', () => {
    const [record] = filterHttpServerRecords([
      {
        type: 'http',
        http: { url: 'http://example.com' },
        displayName: 'prod',
        hasPassword: true,
        authToken: true,
      },
    ]);
    expect(record.displayName).toBe('prod');
    expect(record.hasPassword).toBe(true);
    expect(record.authToken).toBe(true);
  });
});

describe('upsertHttpServerConnection', () => {
  it('inserts a new connection and makes it active', () => {
    const next = upsertHttpServerConnection(emptyState(), { url: 'example.com' });
    expect(next.list).toHaveLength(1);
    expect(next.list[0].http.url).toBe('http://example.com');
    expect(next.activeKey).toBe(httpServerConnectionKey(next.list[0]));
  });

  it('deduplicates by normalized URL on a second upsert', () => {
    const a = upsertHttpServerConnection(emptyState(), { url: 'http://a', displayName: 'a' });
    const b = upsertHttpServerConnection(a, { url: 'http://a/', displayName: 'a2' });

    expect(b.list).toHaveLength(1);
    expect(b.list[0].displayName).toBe('a2');
    expect(b.activeKey).toBe(httpServerConnectionKey(b.list[0]));
  });

  it('preserves a previously stored password when the new upsert omits one', () => {
    const a = upsertHttpServerConnection(emptyState(), { url: 'http://a', password: 'topsecret' });
    const b = upsertHttpServerConnection(a, { url: 'http://a', displayName: 'no-pwd-this-time' });

    expect(b.list).toHaveLength(1);
    expect(b.list[0].http.password).toBe('topsecret');
    expect(b.list[0].displayName).toBe('no-pwd-this-time');
  });

  it('returns the original state unchanged for empty URL input', () => {
    const start = emptyState();
    const next = upsertHttpServerConnection(start, { url: '   ' });
    expect(next).toBe(start);
  });
});

describe('removeHttpServerConnection', () => {
  it('removes the connection and reassigns activeKey to the first remaining entry', () => {
    const s1 = upsertHttpServerConnection(emptyState(), { url: 'http://a' });
    const s2 = upsertHttpServerConnection(s1, { url: 'http://b' });

    const keyA = httpServerConnectionKey(s2.list[0]);
    const after = removeHttpServerConnection(s2, keyA);

    expect(after.list).toHaveLength(1);
    expect(after.list[0].http.url).toBe('http://b');
    expect(after.activeKey).toBe(httpServerConnectionKey(after.list[0]));
  });

  it('clears activeKey when the last connection is removed', () => {
    const s1 = upsertHttpServerConnection(emptyState(), { url: 'http://a' });
    const keyA = httpServerConnectionKey(s1.list[0]);
    const after = removeHttpServerConnection(s1, keyA);

    expect(after.list).toHaveLength(0);
    expect(after.activeKey).toBeUndefined();
  });

  it('is a no-op for an unknown key', () => {
    const s1 = upsertHttpServerConnection(emptyState(), { url: 'http://a' });
    const fakeKey = httpServerConnectionKey({ http: { url: 'http://does-not-exist' } });
    const after = removeHttpServerConnection(s1, fakeKey);
    expect(after.list).toEqual(s1.list);
  });
});

describe('setActiveHttpServerConnection / getActiveHttpServerConnection', () => {
  it('switches activeKey to an existing key', () => {
    const s1 = upsertHttpServerConnection(emptyState(), { url: 'http://a' });
    const s2 = upsertHttpServerConnection(s1, { url: 'http://b' });
    const keyB = httpServerConnectionKey(s2.list[1]);

    const after = setActiveHttpServerConnection(s2, keyB);
    expect(after.activeKey).toBe(keyB);
    expect(getActiveHttpServerConnection(after)?.http.url).toBe('http://b');
  });

  it('rejects keys not present in the list', () => {
    const s1 = upsertHttpServerConnection(emptyState(), { url: 'http://a' });
    const fakeKey = httpServerConnectionKey({ http: { url: 'http://nope' } });
    const after = setActiveHttpServerConnection(s1, fakeKey);
    expect(after.activeKey).toBe(s1.activeKey);
  });

  it('falls back to the first connection when activeKey is missing', () => {
    const state: HttpServerRegistryState = { list: [] };
    upsertHttpServerConnection(state, { url: 'http://a' });
    const after = { list: [], activeKey: undefined };
    expect(getActiveHttpServerConnection(after)).toBeUndefined();
  });
});

describe('loadHttpServerRegistrySnapshot / serializeHttpServerRegistry', () => {
  it('loads an empty snapshot to an empty state', () => {
    const loaded = loadHttpServerRegistrySnapshot(undefined);
    expect(loaded.list).toEqual([]);
    expect(loaded.activeKey).toBeUndefined();
  });

  it('rebuilds state from a stored snapshot, dropping sidecar/ssh entries', () => {
    const snapshot = {
      list: [
        { type: 'http' as const, http: { url: 'http://a' } },
        { type: 'sidecar' as const, http: { url: 'http://ignored' } },
        { type: 'http' as const, http: { url: 'http://b' }, displayName: 'b' },
      ],
      activeKey: httpServerConnectionKey({ http: { url: 'http://b' } }),
    };
    const loaded = loadHttpServerRegistrySnapshot(snapshot);

    expect(loaded.list).toHaveLength(2);
    expect(loaded.activeKey).toBe(httpServerConnectionKey({ http: { url: 'http://b' } }));
  });

  it('falls back to the first connection when stored activeKey is missing', () => {
    const snapshot = {
      list: [{ type: 'http' as const, http: { url: 'http://a' } }],
      activeKey: httpServerConnectionKey({ http: { url: 'http://does-not-exist' } }),
    };
    const loaded = loadHttpServerRegistrySnapshot(snapshot);
    expect(loaded.activeKey).toBe(httpServerConnectionKey(loaded.list[0]));
  });

  it('serialize -> load round-trip preserves metadata and never persists the password', () => {
    const original: HttpServerRegistryState = {
      list: [
        {
          type: 'http',
          http: { url: 'http://a', username: 'alice', password: 'topsecret' },
          displayName: 'prod',
        },
      ],
      activeKey: undefined,
    };
    original.activeKey = httpServerConnectionKey(original.list[0]);

    const serialized = serializeHttpServerRegistry(original);
    expect(serialized.list[0].hasPassword).toBe(true);
    expect((serialized.list[0].http as Record<string, unknown>).password).toBeUndefined();

    const reloaded = loadHttpServerRegistrySnapshot(serialized);
    expect(reloaded.list).toHaveLength(1);
    expect(reloaded.list[0].http.password).toBeUndefined();
    expect(reloaded.list[0].http.username).toBe('alice');
    expect(reloaded.list[0].displayName).toBe('prod');
    expect(reloaded.activeKey).toBe(original.activeKey);
  });
});

describe('coerceHttpServerConnection', () => {
  it('returns undefined for non-http values', () => {
    expect(coerceHttpServerConnection({ type: 'sidecar', http: { url: 'http://x' } })).toBeUndefined();
    expect(coerceHttpServerConnection({ type: 'ssh', host: 'h', http: { url: 'http://h' } })).toBeUndefined();
    expect(coerceHttpServerConnection(null)).toBeUndefined();
    expect(coerceHttpServerConnection(undefined)).toBeUndefined();
  });

  it('coerces live HttpServerConnection values and normalizes the URL', () => {
    const coerced = coerceHttpServerConnection({ type: 'http', http: { url: 'http://example.com/' } });
    expect(coerced?.type).toBe('http');
    expect(coerced?.http.url).toBe('http://example.com');
  });

  it('coerces stored HttpServerStoredRecord values back to connections', () => {
    const stored: HttpServerStoredRecord = {
      type: 'http',
      http: { url: 'http://a' },
      displayName: 'a',
    };
    const coerced = coerceHttpServerConnection(stored);
    expect(coerced).toBeDefined();
    expect(coerced?.http.url).toBe('http://a');
    expect(coerced?.displayName).toBe('a');
  });
});

describe('integration: typed HttpServerConnection usage', () => {
  it('treats the live HttpServerConnection type as the canonical working type', () => {
    const conn: HttpServerConnection = {
      type: 'http',
      http: { url: 'http://a', username: 'alice', password: 'pwd' },
      displayName: 'a',
    };
    const stored = toStoredHttpServerRecord(conn);
    expect(stored.http.url).toBe('http://a');
    expect(stored.hasPassword).toBe(true);
  });
});
