/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for HTTP server SDK/SSE/PTY routing (t2-registry-03).
 */

import { describe, expect, it } from 'vitest';
import {
  HTTP_SERVER_GLOBAL_EVENT_PATH,
  httpServerGlobalEventUrl,
  httpServerPtyWebSocketUrl,
  httpServerRoutingFromConnection,
  httpServerSdkConfig,
  httpServerSseRequestInit,
} from '@/common/registry';

describe('httpServerGlobalEventUrl', () => {
  it('builds SSE URL from base server URL', () => {
    expect(httpServerGlobalEventUrl({ url: 'http://example.com' })).toBe(
      `http://example.com${HTTP_SERVER_GLOBAL_EVENT_PATH}`
    );
    expect(httpServerGlobalEventUrl({ url: 'http://example.com/' })).toBe(
      `http://example.com${HTTP_SERVER_GLOBAL_EVENT_PATH}`
    );
  });
});

describe('httpServerSdkConfig', () => {
  it('returns baseUrl without Authorization when no password', () => {
    const config = httpServerSdkConfig({ url: 'http://example.com' });
    expect(config.baseUrl).toBe('http://example.com');
    expect(config.headers).toBeUndefined();
  });

  it('includes Basic auth headers when password is set', () => {
    const config = httpServerSdkConfig({ url: 'http://example.com', password: 'secret' });
    expect(config.baseUrl).toBe('http://example.com');
    expect(config.headers).toEqual({
      Authorization: `Basic ${Buffer.from('opencode:secret', 'utf8').toString('base64')}`,
    });
  });
});

describe('httpServerSseRequestInit', () => {
  it('returns GET without headers when no password', () => {
    expect(httpServerSseRequestInit({ url: 'http://example.com' })).toEqual({ method: 'GET' });
  });

  it('returns GET with Basic auth headers when password is set', () => {
    const init = httpServerSseRequestInit({ url: 'http://example.com', username: 'alice', password: 'secret' });
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({
      Authorization: `Basic ${Buffer.from('alice:secret', 'utf8').toString('base64')}`,
    });
  });
});

describe('httpServerPtyWebSocketUrl', () => {
  it('builds ws URL with query params', () => {
    const url = httpServerPtyWebSocketUrl({
      url: 'http://example.com/',
      id: 'pty-1',
      directory: '/tmp',
      cursor: 42,
    });
    expect(url.protocol).toBe('ws:');
    expect(url.pathname).toBe('/pty/pty-1/connect');
    expect(url.searchParams.get('directory')).toBe('/tmp');
    expect(url.searchParams.get('cursor')).toBe('42');
  });

  it('uses wss for https base URL and includes ticket when provided', () => {
    const url = httpServerPtyWebSocketUrl({
      url: 'https://example.com',
      id: 'pty-1',
      directory: '/tmp',
      cursor: 0,
      ticket: 'abc123',
    });
    expect(url.protocol).toBe('wss:');
    expect(url.searchParams.get('ticket')).toBe('abc123');
  });
});

describe('httpServerRoutingFromConnection', () => {
  it('aggregates baseUrl, sseUrl, sdk, and sse init from connection', () => {
    const routing = httpServerRoutingFromConnection({
      type: 'http',
      http: { url: 'http://example.com', password: 'secret' },
    });
    expect(routing.baseUrl).toBe('http://example.com');
    expect(routing.sseUrl).toBe(`http://example.com${HTTP_SERVER_GLOBAL_EVENT_PATH}`);
    expect(routing.sdk.baseUrl).toBe('http://example.com');
    expect(routing.sdk.headers?.Authorization).toMatch(/^Basic /);
    expect(routing.sse.method).toBe('GET');
    expect(routing.sse.headers).toEqual(routing.sdk.headers);
  });
});
