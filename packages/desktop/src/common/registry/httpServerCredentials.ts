/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  httpServerConnectionKey,
  toHttpServerConnection,
  type HttpServerConnection,
  type HttpServerConnectionKey,
  type HttpServerHttpBase,
  type HttpServerStoredRecord,
} from './httpServerConnection';

export type HttpServerCredentialPayload = {
  username?: string;
  password: string;
};

export type HttpServerCredentialStore = {
  get(key: HttpServerConnectionKey): HttpServerCredentialPayload | undefined;
  set(key: HttpServerConnectionKey, payload: HttpServerCredentialPayload): void;
  delete(key: HttpServerConnectionKey): void;
  has(key: HttpServerConnectionKey): boolean;
};

export type EncryptedCredentialBlob = {
  ciphertext: string;
  encoding: 'base64';
};

export type HttpServerCredentialEncryptor = {
  encrypt(plaintext: string): EncryptedCredentialBlob | undefined;
  decrypt(blob: EncryptedCredentialBlob): string | undefined;
};

export function createInMemoryHttpServerCredentialStore(): HttpServerCredentialStore {
  const secrets = new Map<HttpServerConnectionKey, HttpServerCredentialPayload>();
  return {
    get: (key) => secrets.get(key),
    set: (key, payload) => {
      secrets.set(key, payload);
    },
    delete: (key) => {
      secrets.delete(key);
    },
    has: (key) => secrets.has(key),
  };
}

export function credentialPayloadFromHttp(http: Pick<HttpServerHttpBase, 'username' | 'password'>): HttpServerCredentialPayload | undefined {
  if (!http.password) return undefined;
  return { username: http.username, password: http.password };
}

export function applyCredentialToHttp(
  http: HttpServerHttpBase,
  payload: HttpServerCredentialPayload | undefined,
): HttpServerHttpBase {
  if (!payload) {
    const { password: _password, ...rest } = http;
    return rest;
  }
  return {
    ...http,
    username: payload.username ?? http.username,
    password: payload.password,
  };
}

export function persistHttpServerCredential(
  conn: HttpServerConnection,
  store: HttpServerCredentialStore,
): void {
  const key = httpServerConnectionKey(conn);
  const payload = credentialPayloadFromHttp(conn.http);
  if (payload) store.set(key, payload);
  else store.delete(key);
}

export function hydrateHttpServerConnection(
  record: HttpServerStoredRecord,
  store: HttpServerCredentialStore,
): HttpServerConnection {
  const conn = toHttpServerConnection(record);
  const key = httpServerConnectionKey(conn);
  const payload = record.hasPassword ? store.get(key) : undefined;
  return {
    ...conn,
    http: applyCredentialToHttp(conn.http, payload),
  };
}

export function hydrateHttpServerConnections(
  records: HttpServerStoredRecord[],
  store: HttpServerCredentialStore,
): HttpServerConnection[] {
  return records.map((record) => hydrateHttpServerConnection(record, store));
}

export function storedRecordHasPlaintextPassword(record: unknown): boolean {
  if (!record || typeof record !== 'object') return false;
  const http = (record as { http?: unknown }).http;
  if (!http || typeof http !== 'object') return false;
  return 'password' in http && typeof (http as { password?: unknown }).password === 'string';
}

export function snapshotHasPlaintextPassword(snapshot: { list?: unknown[] } | undefined): boolean {
  return (snapshot?.list ?? []).some(storedRecordHasPlaintextPassword);
}
