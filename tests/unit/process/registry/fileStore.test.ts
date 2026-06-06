/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the Chisl server registry JSON file persistence and
 * encrypted credential sidecar (t2-registry-01 / t2-registry-03).
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createChislServerCredentialFileStore,
  createChislServerRegistryFileStore,
} from '@/process/services/registry/fileStore';
import { createVolatileMemoryEncryptor } from '@/process/services/registry/safeStorageEncryptor';
import type { HttpServerRegistrySnapshot } from '@/common/registry';

let tempDir: string;
let jsonPath: string;
let credPath: string;

beforeEach(() => {
  tempDir = path.join(tmpdir(), `chisl-registry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
  jsonPath = path.join(tempDir, 'chisl-servers.json');
  credPath = path.join(tempDir, 'chisl-server-credentials.json');
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('createChislServerRegistryFileStore', () => {
  it('returns empty snapshot when file does not exist', () => {
    const store = createChislServerRegistryFileStore(jsonPath);
    expect(store.load()).toEqual({ list: [] });
  });

  it('saves and loads a snapshot round-trip', () => {
    const store = createChislServerRegistryFileStore(jsonPath);
    const snapshot: HttpServerRegistrySnapshot = {
      list: [
        { type: 'http', http: { url: 'http://example.com', username: 'alice' }, displayName: 'prod', hasPassword: true },
        { type: 'http', http: { url: 'http://localhost:3000' } },
      ],
      activeKey: 'http://example.com' as never,
    };
    store.save(snapshot);
    expect(existsSync(jsonPath)).toBe(true);

    const loaded = store.load();
    expect(loaded.list).toHaveLength(2);
    expect(loaded.list[0].http.url).toBe('http://example.com');
    expect(loaded.list[0].http.username).toBe('alice');
    expect(loaded.list[0].hasPassword).toBe(true);
    expect(loaded.list[0].displayName).toBe('prod');
    expect(loaded.list[1].http.url).toBe('http://localhost:3000');
    expect(loaded.activeKey).toBe('http://example.com');
  });

  it('rejects snapshots that contain plaintext passwords', () => {
    const store = createChislServerRegistryFileStore(jsonPath);
    const dirty = {
      list: [{ type: 'http', http: { url: 'http://a', password: 'leaked' } }],
    } as unknown as HttpServerRegistrySnapshot;
    expect(() => store.save(dirty)).toThrow('Refusing to persist snapshot containing plaintext passwords');
  });

  it('returns empty snapshot for malformed JSON file', () => {
    const fs = require('fs') as typeof import('fs');
    fs.writeFileSync(jsonPath, 'NOT VALID JSON{{{', 'utf8');
    const store = createChislServerRegistryFileStore(jsonPath);
    expect(store.load()).toEqual({ list: [] });
  });

  it('returns empty snapshot for JSON file with wrong structure', () => {
    const fs = require('fs') as typeof import('fs');
    fs.writeFileSync(jsonPath, JSON.stringify({ not: 'a list' }), 'utf8');
    const store = createChislServerRegistryFileStore(jsonPath);
    expect(store.load()).toEqual({ list: [] });
  });

  it('creates parent directories on save if they do not exist', () => {
    const nestedPath = path.join(tempDir, 'nested', 'dir', 'chisl-servers.json');
    const store = createChislServerRegistryFileStore(nestedPath);
    store.save({ list: [{ type: 'http', http: { url: 'http://a' } }] });
    expect(existsSync(nestedPath)).toBe(true);
  });
});

describe('createChislServerCredentialFileStore', () => {
  it('returns empty results when no sidecar file exists', () => {
    const encryptor = createVolatileMemoryEncryptor();
    const store = createChislServerCredentialFileStore(encryptor, credPath);
    store.load();
    expect(store.has('http://a' as never)).toBe(false);
    expect(store.get('http://a' as never)).toBeUndefined();
  });

  it('persists and reloads encrypted credentials round-trip', () => {
    const encryptor = createVolatileMemoryEncryptor();
    const store = createChislServerCredentialFileStore(encryptor, credPath);
    store.set('http://example.com' as never, { username: 'alice', password: 'topsecret' });
    store.flush();

    expect(existsSync(credPath)).toBe(true);

    const store2 = createChislServerCredentialFileStore(encryptor, credPath);
    store2.load();
    expect(store2.has('http://example.com' as never)).toBe(true);
    expect(store2.get('http://example.com' as never)).toEqual({ username: 'alice', password: 'topsecret' });
  });

  it('deletes credentials and persists the removal', () => {
    const encryptor = createVolatileMemoryEncryptor();
    const store = createChislServerCredentialFileStore(encryptor, credPath);
    store.set('http://a' as never, { password: 'pwd' });
    store.flush();

    store.delete('http://a' as never);
    store.flush();

    const store2 = createChislServerCredentialFileStore(encryptor, credPath);
    store2.load();
    expect(store2.has('http://a' as never)).toBe(false);
  });

  it('handles malformed sidecar file gracefully', () => {
    const fs = require('fs') as typeof import('fs');
    fs.writeFileSync(credPath, 'NOT JSON', 'utf8');
    const encryptor = createVolatileMemoryEncryptor();
    const store = createChislServerCredentialFileStore(encryptor, credPath);
    store.load();
    expect(store.has('http://a' as never)).toBe(false);
  });

  it('creates parent directories on flush', () => {
    const nestedPath = path.join(tempDir, 'nested', 'creds.json');
    const encryptor = createVolatileMemoryEncryptor();
    const store = createChislServerCredentialFileStore(encryptor, nestedPath);
    store.set('http://a' as never, { password: 'x' });
    store.flush();
    expect(existsSync(nestedPath)).toBe(true);
  });
});

describe('integration: registry file store + credential file store', () => {
  it('registry stores metadata; credential store holds secrets separately', () => {
    const encryptor = createVolatileMemoryEncryptor();
    const registry = createChislServerRegistryFileStore(jsonPath);
    const credStore = createChislServerCredentialFileStore(encryptor, credPath);

    const snapshot: HttpServerRegistrySnapshot = {
      list: [
        {
          type: 'http',
          http: { url: 'http://example.com', username: 'alice' },
          displayName: 'prod',
          hasPassword: true,
        },
      ],
      activeKey: 'http://example.com' as never,
    };
    registry.save(snapshot);
    credStore.set('http://example.com' as never, { username: 'alice', password: 'topsecret' });
    credStore.flush();

    const rawJson = readFileSync(jsonPath, 'utf8');
    expect(rawJson).not.toContain('topsecret');
    expect(rawJson).toContain('"hasPassword": true');

    const rawCred = readFileSync(credPath, 'utf8');
    expect(rawCred).not.toContain('topsecret');

    const loadedRegistry = registry.load();
    expect(loadedRegistry.list[0].hasPassword).toBe(true);

    credStore.load();
    const hydrated = credStore.get('http://example.com' as never);
    expect(hydrated?.password).toBe('topsecret');
    expect(hydrated?.username).toBe('alice');
  });
});
