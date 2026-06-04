/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for HTTP server credential storage and hydration (t2-registry-03).
 */

import { describe, expect, it } from 'vitest';
import {
  applyCredentialToHttp,
  createInMemoryHttpServerCredentialStore,
  credentialPayloadFromHttp,
  hydrateHttpServerConnection,
  persistHttpServerCredential,
  serializeHttpServerRegistry,
  snapshotHasPlaintextPassword,
  storedRecordHasPlaintextPassword,
  toStoredHttpServerRecord,
  upsertHttpServerConnection,
  type HttpServerRegistryState,
} from '@/common/registry';

describe('toStoredHttpServerRecord / snapshotHasPlaintextPassword', () => {
  it('never serializes plaintext password; sets hasPassword when password is truthy', () => {
    const stored = toStoredHttpServerRecord({
      type: 'http',
      http: { url: 'http://a', username: 'alice', password: 'secret' },
    });
    expect(stored.hasPassword).toBe(true);
    expect((stored.http as Record<string, unknown>).password).toBeUndefined();
    expect(storedRecordHasPlaintextPassword(stored)).toBe(false);
  });

  it('detects plaintext password leaked into a persisted record', () => {
    const leaked = { type: 'http', http: { url: 'http://a', password: 'secret' } };
    expect(storedRecordHasPlaintextPassword(leaked)).toBe(true);
    expect(snapshotHasPlaintextPassword({ list: [leaked] })).toBe(true);
  });
});

describe('in-memory credential store', () => {
  it('hydrates password only at runtime when hasPassword is true', () => {
    const store = createInMemoryHttpServerCredentialStore();
    const state: HttpServerRegistryState = {
      list: [
        {
          type: 'http',
          http: { url: 'http://a', username: 'alice', password: 'secret' },
        },
      ],
    };
    persistHttpServerCredential(state.list[0], store);

    const snapshot = serializeHttpServerRegistry(state);
    expect(snapshot.list[0].hasPassword).toBe(true);
    expect((snapshot.list[0].http as Record<string, unknown>).password).toBeUndefined();

    const hydrated = hydrateHttpServerConnection(snapshot.list[0], store);
    expect(hydrated.http.password).toBe('secret');
    expect(hydrated.http.username).toBe('alice');
  });

  it('does not hydrate password when hasPassword is false or store is empty', () => {
    const store = createInMemoryHttpServerCredentialStore();
    const record = toStoredHttpServerRecord({
      type: 'http',
      http: { url: 'http://a', username: 'alice' },
    });
    expect(hydrateHttpServerConnection(record, store).http.password).toBeUndefined();

    const withFlag = { ...record, hasPassword: true };
    expect(hydrateHttpServerConnection(withFlag, store).http.password).toBeUndefined();
  });

  it('credentialPayloadFromHttp and applyCredentialToHttp round-trip', () => {
    const http = { url: 'http://a', username: 'bob', password: 'pwd' };
    const payload = credentialPayloadFromHttp(http);
    expect(payload).toEqual({ username: 'bob', password: 'pwd' });

    const stripped = applyCredentialToHttp(http, undefined);
    expect(stripped.password).toBeUndefined();
    expect(stripped.username).toBe('bob');

    const restored = applyCredentialToHttp(stripped, payload);
    expect(restored.password).toBe('pwd');
  });
});

describe('persistHttpServerCredential with registry upsert', () => {
  it('store holds secrets; serialized snapshot has no plaintext', () => {
    const store = createInMemoryHttpServerCredentialStore();
    const next = upsertHttpServerConnection({ list: [] }, { url: 'http://a', password: 'topsecret' });
    persistHttpServerCredential(next.list[0], store);

    const snapshot = serializeHttpServerRegistry(next);
    expect(snapshotHasPlaintextPassword(snapshot)).toBe(false);
    expect(store.has('http://a')).toBe(true);
    expect(store.get('http://a')?.password).toBe('topsecret');
  });
});
