/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { basicAuthUsername, DEFAULT_HTTP_BASIC_USERNAME, type HttpServerHttpBase } from './httpServerConnection';

export function basicAuthToken(http: Pick<HttpServerHttpBase, 'username' | 'password'>): string | undefined {
  if (!http.password) return undefined;
  const username = basicAuthUsername(http) ?? DEFAULT_HTTP_BASIC_USERNAME;
  const credentials = `${username}:${http.password}`;
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(credentials, 'utf8').toString('base64');
  }
  return btoa(credentials);
}

export function httpServerAuthHeaders(
  http: Pick<HttpServerHttpBase, 'username' | 'password'>
): HeadersInit | undefined {
  const token = basicAuthToken(http);
  if (!token) return undefined;
  return { Authorization: `Basic ${token}` };
}
