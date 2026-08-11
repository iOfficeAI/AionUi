/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Dispatcher } from 'undici';
import { ProxyAgent } from 'undici';

type RequestInitWithDispatcher = RequestInit & {
  dispatcher?: Dispatcher;
};

export async function fetchWithOptionalProxy(
  input: string | URL,
  init: RequestInit = {},
  proxy?: string
): Promise<Response> {
  const trimmedProxy = proxy?.trim();
  if (!trimmedProxy) {
    return fetch(input, init);
  }

  const requestInit: RequestInitWithDispatcher = {
    ...init,
    dispatcher: new ProxyAgent(trimmedProxy),
  };

  return fetch(input, requestInit);
}
