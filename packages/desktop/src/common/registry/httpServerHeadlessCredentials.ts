/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizeServerUrl, type HttpServerHttpBase } from './httpServerConnection';

export const HEADLESS_HTTP_SERVER_URL_ENV = 'CHISL_HTTP_SERVER_URL' as const;
export const HEADLESS_HTTP_SERVER_USERNAME_ENV = 'CHISL_HTTP_SERVER_USERNAME' as const;
export const HEADLESS_HTTP_SERVER_PASSWORD_ENV = 'CHISL_HTTP_SERVER_PASSWORD' as const;

export const HEADLESS_HTTP_SERVER_URL_FLAG = 'server-url' as const;
export const HEADLESS_HTTP_SERVER_USERNAME_FLAG = 'server-username' as const;
export const HEADLESS_HTTP_SERVER_PASSWORD_FLAG = 'server-password' as const;

export type HeadlessHttpServerCredentialInput = {
  url?: string;
  username?: string;
  password?: string;
};

export type HeadlessHttpServerCredentialResult = {
  http?: HttpServerHttpBase;
  error?: string;
};

export type ParseHeadlessHttpServerCredentialsOptions = {
  env?: Record<string, string | undefined>;
  flags?: Map<string, string | true>;
};

function readFlag(flags: Map<string, string | true> | undefined, name: string): string | undefined {
  const value = flags?.get(name);
  return typeof value === 'string' ? value : undefined;
}

function readEnv(env: Record<string, string | undefined> | undefined, name: string): string | undefined {
  const value = env?.[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function parseHeadlessHttpServerCredentials(
  opts?: ParseHeadlessHttpServerCredentialsOptions
): HeadlessHttpServerCredentialResult {
  const env = opts?.env ?? (typeof process !== 'undefined' ? process.env : {});
  const flags = opts?.flags;

  const urlFromFlag = readFlag(flags, HEADLESS_HTTP_SERVER_URL_FLAG);
  const urlFromEnv = env?.[HEADLESS_HTTP_SERVER_URL_ENV];
  const urlExplicit = urlFromFlag !== undefined || urlFromEnv !== undefined;
  const rawUrl = urlFromFlag ?? urlFromEnv;
  const username =
    readFlag(flags, HEADLESS_HTTP_SERVER_USERNAME_FLAG) ?? readEnv(env, HEADLESS_HTTP_SERVER_USERNAME_ENV);
  const password =
    readFlag(flags, HEADLESS_HTTP_SERVER_PASSWORD_FLAG) ?? readEnv(env, HEADLESS_HTTP_SERVER_PASSWORD_ENV);

  if (!rawUrl?.trim() && !username && !password) {
    if (urlExplicit) return { error: 'invalid_server_url' };
    return {};
  }

  if (!rawUrl?.trim()) {
    return { error: 'missing_server_url' };
  }

  const url = normalizeServerUrl(rawUrl);
  if (!url) {
    return { error: 'invalid_server_url' };
  }

  const http: HttpServerHttpBase = { url };
  if (username) http.username = username;
  if (password) http.password = password;
  return { http };
}
