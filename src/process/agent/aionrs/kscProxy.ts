/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';

const KSC_PROXY_PATH_PREFIX = '/api/ksc-proxy/';
const LOOPBACK_HOST = '127.0.0.1';

export function isKscProxyBaseUrl(baseUrl?: string): boolean {
  if (!baseUrl) return false;
  try {
    return new URL(baseUrl).pathname.startsWith(KSC_PROXY_PATH_PREFIX);
  } catch {
    return false;
  }
}

function getPreferredPort(baseUrl: string): number | undefined {
  try {
    const port = Number(new URL(baseUrl).port);
    return Number.isInteger(port) && port > 0 ? port : undefined;
  } catch {
    return undefined;
  }
}

export function rewriteKscProxyBaseUrlPort(baseUrl: string, port: number): string {
  const url = new URL(baseUrl);
  url.protocol = 'http:';
  url.hostname = LOOPBACK_HOST;
  url.port = String(port);
  return url.toString();
}

export async function ensureKscProxyModel(model: TProviderWithModel): Promise<TProviderWithModel> {
  if (!isKscProxyBaseUrl(model.baseUrl)) {
    return model;
  }

  const { ensureLocalWebServerRunning } = await import('@process/bridge/webuiBridge');
  const instance = await ensureLocalWebServerRunning(getPreferredPort(model.baseUrl));
  const nextBaseUrl = rewriteKscProxyBaseUrlPort(model.baseUrl, instance.port);
  if (nextBaseUrl === model.baseUrl) {
    return model;
  }

  return {
    ...model,
    baseUrl: nextBaseUrl,
  };
}
