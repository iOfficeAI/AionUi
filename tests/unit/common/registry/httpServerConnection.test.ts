/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the Chisl HTTP server connection model (t2-registry-01).
 * Covers URL normalization, basic-auth username defaulting, non-HTTP type
 * rejection, password presence metadata, and round-trip
 * HttpServerConnection <-> HttpServerStoredRecord conversions.
 */

import { describe, expect, it } from 'vitest';
import {
  CHISL_HTTP_SERVER_REGISTRY_KEY,
  DEFAULT_HTTP_BASIC_USERNAME,
  basicAuthUsername,
  httpServerConnectionKey,
  httpServerDisplayName,
  isHttpServerConnection,
  normalizeServerUrl,
  prepareHttpServerConnectionInput,
  rejectNonHttpServerType,
  toHttpServerConnection,
  toStoredHttpServerRecord,
  type HttpServerConnection,
  type HttpServerStoredRecord,
} from '@/common/registry';

describe('normalizeServerUrl', () => {
  it('returns undefined for empty / whitespace input', () => {
    expect(normalizeServerUrl('')).toBeUndefined();
    expect(normalizeServerUrl('   ')).toBeUndefined();
    expect(normalizeServerUrl('\t\n')).toBeUndefined();
  });

  it('prepends http:// when no protocol is present', () => {
    expect(normalizeServerUrl('localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeServerUrl('example.com')).toBe('http://example.com');
    expect(normalizeServerUrl('  127.0.0.1:8080  ')).toBe('http://127.0.0.1:8080');
  });

  it('preserves an existing http:// or https:// protocol', () => {
    expect(normalizeServerUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeServerUrl('https://example.com')).toBe('https://example.com');
    expect(normalizeServerUrl('https://example.com/')).toBe('https://example.com');
  });

  it('strips trailing slashes', () => {
    expect(normalizeServerUrl('http://example.com/')).toBe('http://example.com');
    expect(normalizeServerUrl('http://example.com///')).toBe('http://example.com');
    expect(normalizeServerUrl('example.com/')).toBe('http://example.com');
  });

  it('preserves paths and only trims trailing slashes', () => {
    expect(normalizeServerUrl('http://example.com/api/v1/')).toBe('http://example.com/api/v1');
    expect(normalizeServerUrl('http://example.com/api/v1//')).toBe('http://example.com/api/v1');
  });
});

describe('basicAuthUsername', () => {
  it('returns undefined when neither username nor password is set', () => {
    expect(basicAuthUsername({})).toBeUndefined();
    expect(basicAuthUsername({ username: '', password: '' })).toBeUndefined();
  });

  it('returns the explicit username when one is provided', () => {
    expect(basicAuthUsername({ username: 'alice' })).toBe('alice');
    expect(basicAuthUsername({ username: 'alice', password: 'secret' })).toBe('alice');
  });

  it('defaults to "opencode" when only a password is provided', () => {
    expect(basicAuthUsername({ password: 'secret' })).toBe(DEFAULT_HTTP_BASIC_USERNAME);
    expect(basicAuthUsername({ password: 'secret' })).toBe('opencode');
  });
});

describe('isHttpServerConnection / rejectNonHttpServerType', () => {
  it('accepts well-formed HTTP connection values', () => {
    expect(isHttpServerConnection({ type: 'http', http: { url: 'http://localhost' } })).toBe(true);
    expect(rejectNonHttpServerType({ type: 'http' })).toBe(false);
  });

  it('rejects sidecar / ssh / other non-http types', () => {
    expect(rejectNonHttpServerType({ type: 'sidecar' })).toBe(true);
    expect(rejectNonHttpServerType({ type: 'ssh' })).toBe(true);
    expect(rejectNonHttpServerType({ type: 'ws' })).toBe(true);
    expect(isHttpServerConnection({ type: 'sidecar', http: { url: 'http://x' } })).toBe(false);
    expect(isHttpServerConnection({ type: 'ssh', host: 'h', http: { url: 'http://h' } })).toBe(false);
  });

  it('rejects missing or empty http.url', () => {
    expect(isHttpServerConnection({ type: 'http' })).toBe(false);
    expect(isHttpServerConnection({ type: 'http', http: {} })).toBe(false);
    expect(isHttpServerConnection({ type: 'http', http: { url: '' } })).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(isHttpServerConnection(null)).toBe(false);
    expect(isHttpServerConnection('http://x')).toBe(false);
    expect(isHttpServerConnection(42)).toBe(false);
    expect(rejectNonHttpServerType(undefined)).toBe(true);
    expect(rejectNonHttpServerType(null)).toBe(true);
  });
});

describe('httpServerConnectionKey / httpServerDisplayName', () => {
  it('keys connections by their URL verbatim (caller is expected to normalize first)', () => {
    const a = httpServerConnectionKey({ http: { url: 'http://example.com' } });
    const b = httpServerConnectionKey({ http: { url: 'http://example.com' } });
    expect(a).toBe(b);
  });

  it('produces identical keys when both inputs are normalized identically', () => {
    const normalized = 'http://example.com';
    const a = httpServerConnectionKey({ http: { url: normalized } });
    const b = httpServerConnectionKey({ http: { url: normalized } });
    expect(a).toBe(b);
  });

  it('returns the displayName when present, else the host portion of the URL', () => {
    expect(httpServerDisplayName({ displayName: 'prod', http: { url: 'http://example.com' } })).toBe('prod');
    expect(httpServerDisplayName({ http: { url: 'http://example.com/' } })).toBe('example.com');
    expect(httpServerDisplayName({ http: { url: 'https://api.example.com' } })).toBe('api.example.com');
    expect(httpServerDisplayName(undefined)).toBe('');
  });
});

describe('password presence metadata (no plaintext persisted)', () => {
  it('strips password on serialize and sets hasPassword=true when provided', () => {
    const conn: HttpServerConnection = {
      type: 'http',
      http: { url: 'http://example.com', username: 'alice', password: 'topsecret' },
      displayName: 'prod',
    };
    const stored = toStoredHttpServerRecord(conn);

    expect(stored.type).toBe('http');
    expect(stored.http.url).toBe('http://example.com');
    expect(stored.http.username).toBe('alice');
    expect(stored.hasPassword).toBe(true);
    expect((stored.http as Record<string, unknown>).password).toBeUndefined();
  });

  it('hasPassword is false when password is omitted or empty', () => {
    const noPwd: HttpServerConnection = { type: 'http', http: { url: 'http://a' } };
    const emptyPwd: HttpServerConnection = { type: 'http', http: { url: 'http://b', password: '' } };

    expect(toStoredHttpServerRecord(noPwd).hasPassword).toBe(false);
    expect(toStoredHttpServerRecord(emptyPwd).hasPassword).toBe(false);
  });

  it('round-trip preserves non-secret fields and never exposes the password', () => {
    const conn: HttpServerConnection = {
      type: 'http',
      http: { url: 'http://example.com', username: 'alice', password: 'topsecret' },
      displayName: 'prod',
      authToken: true,
    };
    const stored = toStoredHttpServerRecord(conn);
    const rebuilt = toHttpServerConnection(stored);

    expect(rebuilt.http.url).toBe('http://example.com');
    expect(rebuilt.http.username).toBe('alice');
    expect(rebuilt.http.password).toBeUndefined();
    expect(rebuilt.displayName).toBe('prod');
    expect(rebuilt.authToken).toBe(true);
    expect(rebuilt.type).toBe('http');
  });
});

describe('prepareHttpServerConnectionInput', () => {
  it('normalizes URL, drops empty fields, and sets type to http', () => {
    const result = prepareHttpServerConnectionInput({
      url: 'example.com/',
      displayName: 'prod',
      username: 'alice',
      password: 'topsecret',
    });
    expect(result).toBeDefined();
    expect(result?.type).toBe('http');
    expect(result?.http.url).toBe('http://example.com');
    expect(result?.http.username).toBe('alice');
    expect(result?.http.password).toBe('topsecret');
    expect(result?.displayName).toBe('prod');
  });

  it('returns undefined for empty URL input', () => {
    expect(prepareHttpServerConnectionInput({ url: '   ' })).toBeUndefined();
  });

  it('omits username/password from http when not provided', () => {
    const result = prepareHttpServerConnectionInput({ url: 'http://example.com' });
    expect(result?.http.username).toBeUndefined();
    expect(result?.http.password).toBeUndefined();
  });
});

describe('CHISL_HTTP_SERVER_REGISTRY_KEY', () => {
  it('is the namespaced storage key string', () => {
    expect(CHISL_HTTP_SERVER_REGISTRY_KEY).toBe('chisl.httpServerRegistry.v1');
  });
});
