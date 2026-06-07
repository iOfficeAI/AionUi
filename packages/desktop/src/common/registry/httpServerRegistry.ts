/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  httpServerConnectionKey,
  isHttpServerConnection,
  normalizeServerUrl,
  prepareHttpServerConnectionInput,
  rejectNonHttpServerType,
  toHttpServerConnection,
  toStoredHttpServerRecord,
  type HttpServerConnection,
  type HttpServerConnectionKey,
  type HttpServerRegistryInput,
  type HttpServerRegistrySnapshot,
  type HttpServerStoredRecord,
} from './httpServerConnection';

export type HttpServerRegistryState = {
  list: HttpServerConnection[];
  activeKey?: HttpServerConnectionKey;
};

export function parseStoredHttpServerRecord(value: unknown): HttpServerStoredRecord | undefined {
  if (rejectNonHttpServerType(value)) return undefined;
  if (!value || typeof value !== 'object') return undefined;

  const record = value as Partial<HttpServerStoredRecord> & { http?: { url?: unknown; username?: unknown } };
  if (record.type !== 'http') return undefined;

  const rawUrl = typeof record.http?.url === 'string' ? record.http.url : undefined;
  const url = rawUrl ? normalizeServerUrl(rawUrl) : undefined;
  if (!url) return undefined;

  return {
    type: 'http',
    http: {
      url,
      username: typeof record.http?.username === 'string' ? record.http.username : undefined,
    },
    displayName: typeof record.displayName === 'string' ? record.displayName : undefined,
    hasPassword: record.hasPassword === true,
    authToken: record.authToken === true ? true : undefined,
  };
}

export function filterHttpServerRecords(values: unknown[]): HttpServerStoredRecord[] {
  const deduped = new Map<string, HttpServerStoredRecord>();

  for (const value of values) {
    const parsed = parseStoredHttpServerRecord(value);
    if (!parsed) continue;
    deduped.set(parsed.http.url, parsed);
  }

  return [...deduped.values()];
}

export function loadHttpServerRegistrySnapshot(
  snapshot: HttpServerRegistrySnapshot | undefined
): HttpServerRegistryState {
  const list = filterHttpServerRecords(snapshot?.list ?? []).map(toHttpServerConnection);
  const activeKey = snapshot?.activeKey;
  const activeExists = activeKey ? list.some((entry) => httpServerConnectionKey(entry) === activeKey) : false;

  return {
    list,
    activeKey: activeExists ? activeKey : list[0] ? httpServerConnectionKey(list[0]) : undefined,
  };
}

export function serializeHttpServerRegistry(state: HttpServerRegistryState): HttpServerRegistrySnapshot {
  return {
    list: state.list.map(toStoredHttpServerRecord),
    activeKey: state.activeKey,
  };
}

export function upsertHttpServerConnection(
  state: HttpServerRegistryState,
  input: HttpServerRegistryInput
): HttpServerRegistryState {
  const conn = prepareHttpServerConnectionInput(input);
  if (!conn) return state;

  const key = httpServerConnectionKey(conn);
  const nextList = [...state.list];
  const existingIndex = nextList.findIndex((entry) => httpServerConnectionKey(entry) === key);

  if (existingIndex === -1) {
    nextList.push(conn);
  } else {
    const existing = nextList[existingIndex];
    nextList[existingIndex] = {
      ...existing,
      ...conn,
      http: {
        ...existing.http,
        ...conn.http,
        password: conn.http.password ?? existing.http.password,
      },
    };
  }

  return {
    list: nextList,
    activeKey: key,
  };
}

export function removeHttpServerConnection(
  state: HttpServerRegistryState,
  key: HttpServerConnectionKey
): HttpServerRegistryState {
  const nextList = state.list.filter((entry) => httpServerConnectionKey(entry) !== key);
  const activeKey =
    state.activeKey === key ? (nextList[0] ? httpServerConnectionKey(nextList[0]) : undefined) : state.activeKey;

  return {
    list: nextList,
    activeKey,
  };
}

export function setActiveHttpServerConnection(
  state: HttpServerRegistryState,
  key: HttpServerConnectionKey
): HttpServerRegistryState {
  const exists = state.list.some((entry) => httpServerConnectionKey(entry) === key);
  if (!exists) return state;
  return { ...state, activeKey: key };
}

export function getActiveHttpServerConnection(state: HttpServerRegistryState): HttpServerConnection | undefined {
  if (!state.activeKey) return state.list[0];
  return state.list.find((entry) => httpServerConnectionKey(entry) === state.activeKey) ?? state.list[0];
}

export function coerceHttpServerConnection(value: unknown): HttpServerConnection | undefined {
  if (rejectNonHttpServerType(value)) return undefined;
  if (isHttpServerConnection(value)) {
    const url = normalizeServerUrl(value.http.url);
    if (!url) return undefined;
    return { ...value, http: { ...value.http, url } };
  }

  const stored = parseStoredHttpServerRecord(value);
  return stored ? toHttpServerConnection(stored) : undefined;
}
