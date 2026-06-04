/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for headless HTTP server credential parsing (t2-registry-03).
 */

import { describe, expect, it } from 'vitest';
import {
  HEADLESS_HTTP_SERVER_PASSWORD_ENV,
  HEADLESS_HTTP_SERVER_PASSWORD_FLAG,
  HEADLESS_HTTP_SERVER_URL_ENV,
  HEADLESS_HTTP_SERVER_URL_FLAG,
  HEADLESS_HTTP_SERVER_USERNAME_ENV,
  HEADLESS_HTTP_SERVER_USERNAME_FLAG,
  parseHeadlessHttpServerCredentials,
} from '@/common/registry';

describe('parseHeadlessHttpServerCredentials', () => {
  it('returns empty when no env or flags are set', () => {
    expect(parseHeadlessHttpServerCredentials({ env: {}, flags: new Map() })).toEqual({});
  });

  it('parses URL, username, and password from env', () => {
    const result = parseHeadlessHttpServerCredentials({
      env: {
        [HEADLESS_HTTP_SERVER_URL_ENV]: 'http://example.com/',
        [HEADLESS_HTTP_SERVER_USERNAME_ENV]: 'alice',
        [HEADLESS_HTTP_SERVER_PASSWORD_ENV]: 'secret',
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.http).toEqual({
      url: 'http://example.com',
      username: 'alice',
      password: 'secret',
    });
  });

  it('prefers flags over env', () => {
    const flags = new Map<string, string | true>([
      [HEADLESS_HTTP_SERVER_URL_FLAG, 'http://flag.example.com'],
      [HEADLESS_HTTP_SERVER_USERNAME_FLAG, 'bob'],
      [HEADLESS_HTTP_SERVER_PASSWORD_FLAG, 'flagpwd'],
    ]);
    const result = parseHeadlessHttpServerCredentials({
      env: {
        [HEADLESS_HTTP_SERVER_URL_ENV]: 'http://env.example.com',
        [HEADLESS_HTTP_SERVER_USERNAME_ENV]: 'envuser',
        [HEADLESS_HTTP_SERVER_PASSWORD_ENV]: 'envpwd',
      },
      flags,
    });
    expect(result.http).toEqual({
      url: 'http://flag.example.com',
      username: 'bob',
      password: 'flagpwd',
    });
  });

  it('returns missing_server_url when credentials without URL', () => {
    expect(
      parseHeadlessHttpServerCredentials({
        env: { [HEADLESS_HTTP_SERVER_PASSWORD_ENV]: 'secret' },
      }),
    ).toEqual({ error: 'missing_server_url' });
  });

  it('returns invalid_server_url for unparseable URL', () => {
    expect(
      parseHeadlessHttpServerCredentials({
        env: { [HEADLESS_HTTP_SERVER_URL_ENV]: '   ' },
      }),
    ).toEqual({ error: 'invalid_server_url' });
  });

  it('accepts URL without username or password', () => {
    const result = parseHeadlessHttpServerCredentials({
      env: { [HEADLESS_HTTP_SERVER_URL_ENV]: 'example.com' },
    });
    expect(result.http).toEqual({ url: 'http://example.com' });
  });
});
