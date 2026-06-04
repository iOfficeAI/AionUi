/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpServerAuthHeaders } from './httpServerAuth';
import type { HttpServerConnection, HttpServerHttpBase } from './httpServerConnection';

export const HTTP_SERVER_GLOBAL_EVENT_PATH = '/global/event' as const;

export function httpServerBaseUrl(http: Pick<HttpServerHttpBase, 'url'>): string {
  return http.url.replace(/\/+$/, '');
}

export function httpServerGlobalEventUrl(http: Pick<HttpServerHttpBase, 'url'>): string {
  return `${httpServerBaseUrl(http)}${HTTP_SERVER_GLOBAL_EVENT_PATH}`;
}

export function httpServerSdkConfig(http: Pick<HttpServerHttpBase, 'url' | 'username' | 'password'>) {
  const headers = httpServerAuthHeaders(http);
  return {
    baseUrl: httpServerBaseUrl(http),
    headers: headers ? { ...headers } : undefined,
  };
}

export function httpServerSseRequestInit(http: Pick<HttpServerHttpBase, 'url' | 'username' | 'password'>): RequestInit {
  const headers = httpServerAuthHeaders(http);
  if (!headers) return { method: 'GET' };
  return { method: 'GET', headers: { ...headers } };
}

export type HttpServerPtyConnectInput = {
  url: string;
  id: string;
  directory: string;
  cursor: number;
  ticket?: string;
};

export function httpServerPtyWebSocketUrl(input: HttpServerPtyConnectInput): URL {
  const next = new URL(`${httpServerBaseUrl({ url: input.url })}/pty/${input.id}/connect`);
  next.searchParams.set('directory', input.directory);
  next.searchParams.set('cursor', String(input.cursor));
  next.protocol = next.protocol === 'https:' ? 'wss:' : 'ws:';
  if (input.ticket) next.searchParams.set('ticket', input.ticket);
  return next;
}

export function httpServerRoutingFromConnection(conn: HttpServerConnection) {
  return {
    baseUrl: httpServerBaseUrl(conn.http),
    sseUrl: httpServerGlobalEventUrl(conn.http),
    sdk: httpServerSdkConfig(conn.http),
    sse: httpServerSseRequestInit(conn.http),
  };
}
