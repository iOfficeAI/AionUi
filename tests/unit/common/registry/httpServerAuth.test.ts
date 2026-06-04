/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for HTTP server Basic auth header construction (t2-registry-02).
 */

import { describe, expect, it } from 'vitest';
import { basicAuthToken, httpServerAuthHeaders } from '@/common/registry';

describe('httpServerAuthHeaders', () => {
  it('returns undefined when no password is set', () => {
    expect(httpServerAuthHeaders({ url: 'http://example.com' })).toBeUndefined();
    expect(httpServerAuthHeaders({ url: 'http://example.com', username: 'alice' })).toBeUndefined();
    expect(httpServerAuthHeaders({ url: 'http://example.com', password: '' })).toBeUndefined();
  });

  it('sends Basic auth with explicit username when password is truthy', () => {
    const headers = httpServerAuthHeaders({ url: 'http://example.com', username: 'alice', password: 'secret' });
    expect(headers).toEqual({ Authorization: `Basic ${basicAuthToken({ username: 'alice', password: 'secret' })}` });
    expect(basicAuthToken({ username: 'alice', password: 'secret' })).toBe(Buffer.from('alice:secret', 'utf8').toString('base64'));
  });

  it('defaults username to opencode when only password is provided', () => {
    const headers = httpServerAuthHeaders({ url: 'http://example.com', password: 'secret' });
    expect(headers).toEqual({ Authorization: `Basic ${Buffer.from('opencode:secret', 'utf8').toString('base64')}` });
  });
});
