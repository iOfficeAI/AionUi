/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const CHISL_HTTP_SERVER_REGISTRY_KEY = 'chisl.httpServerRegistry.v1' as const;

export const DEFAULT_HTTP_BASIC_USERNAME = 'opencode';

export type HttpServerConnectionKey = string & { readonly __brand: 'HttpServerConnectionKey' };

export const HttpServerConnectionKey = {
  make: (normalizedUrl: string): HttpServerConnectionKey => normalizedUrl as HttpServerConnectionKey,
};

export type HttpServerHttpBase = {
  url: string;
  username?: string;
  password?: string;
};

export type HttpServerConnection = {
  type: 'http';
  http: HttpServerHttpBase;
  displayName?: string;
  authToken?: boolean;
};

export type HttpServerStoredRecord = {
  type: 'http';
  http: {
    url: string;
    username?: string;
  };
  displayName?: string;
  hasPassword?: boolean;
  authToken?: boolean;
};

export type HttpServerRegistrySnapshot = {
  list: HttpServerStoredRecord[];
  activeKey?: HttpServerConnectionKey;
};

export type HttpServerRegistryInput = {
  url: string;
  displayName?: string;
  username?: string;
  password?: string;
  authToken?: boolean;
};

export function normalizeServerUrl(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

export function httpServerConnectionKey(conn: Pick<HttpServerConnection, 'http'>): HttpServerConnectionKey {
  return HttpServerConnectionKey.make(conn.http.url);
}

export function httpServerDisplayName(
  conn?: Pick<HttpServerConnection, 'displayName' | 'http'>,
  ignoreDisplayName = false,
): string {
  if (!conn) return '';
  if (conn.displayName && !ignoreDisplayName) return conn.displayName;
  return conn.http.url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function basicAuthUsername(http: Pick<HttpServerHttpBase, 'username' | 'password'>): string | undefined {
  if (http.username) return http.username;
  if (http.password) return DEFAULT_HTTP_BASIC_USERNAME;
  return undefined;
}

export function isHttpServerConnection(value: unknown): value is HttpServerConnection {
  if (!value || typeof value !== 'object') return false;
  const record = value as { type?: unknown; http?: unknown };
  if (record.type !== 'http') return false;
  if (!record.http || typeof record.http !== 'object') return false;
  const http = record.http as { url?: unknown };
  return typeof http.url === 'string' && http.url.length > 0;
}

export function rejectNonHttpServerType(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  const type = (value as { type?: unknown }).type;
  if (type === undefined) return false;
  return type !== 'http';
}

export function toStoredHttpServerRecord(conn: HttpServerConnection): HttpServerStoredRecord {
  const { password, ...httpWithoutPassword } = conn.http;
  return {
    type: 'http',
    http: httpWithoutPassword,
    displayName: conn.displayName,
    hasPassword: password !== undefined && password !== '',
    authToken: conn.authToken,
  };
}

export function toHttpServerConnection(record: HttpServerStoredRecord): HttpServerConnection {
  return {
    type: 'http',
    http: { ...record.http },
    displayName: record.displayName,
    authToken: record.authToken,
  };
}

export function prepareHttpServerConnectionInput(input: HttpServerRegistryInput): HttpServerConnection | undefined {
  const url = normalizeServerUrl(input.url);
  if (!url) return undefined;

  const http: HttpServerHttpBase = { url };
  if (input.username) http.username = input.username;
  if (input.password) http.password = input.password;

  return {
    type: 'http',
    http,
    displayName: input.displayName,
    authToken: input.authToken,
  };
}
