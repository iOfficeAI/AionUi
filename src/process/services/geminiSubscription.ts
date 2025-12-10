/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, Config, UserTierId, getOauthClient } from '@office-ai/aioncli-core';
import { setupUser } from '@office-ai/aioncli-core/dist/src/code_assist/setup.js';

export interface GeminiSubscriptionStatus {
  isSubscriber: boolean;
  tier?: UserTierId | 'unknown';
  lastChecked: number;
  message?: string;
}

// 利用短期缓存避免频繁触发 CLI OAuth。Cache TTL keeps CLI auth calls minimal.
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

type CacheEntry = {
  status: GeminiSubscriptionStatus;
  expiresAt: number;
};

// statusCache: 记录每个代理的订阅状态；pendingRequests: 去抖并发。Cache per proxy & dedupe inflight calls.
const statusCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<GeminiSubscriptionStatus>>();

// 直接询问 Gemini CLI，判断当前账号的订阅等级。Call CLI to determine user tier.
async function fetchSubscriptionStatus(proxy?: string): Promise<GeminiSubscriptionStatus> {
  try {
    const config = new Config({
      proxy,
      sessionId: '',
      targetDir: '',
      debugMode: false,
      cwd: '',
      model: '',
    });

    const client = await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, config);
    const userData = await setupUser(client);

    const tier = userData.userTier;
    const isSubscriber = tier === UserTierId.STANDARD || tier === UserTierId.LEGACY;

    return {
      isSubscriber,
      tier,
      lastChecked: Date.now(),
    };
  } catch (error) {
    return {
      isSubscriber: false,
      tier: 'unknown',
      lastChecked: Date.now(),
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// 对外接口：自动复用缓存/并发请求，返回订阅态。Public helper that reuses cache/de-duplicates calls.
export async function getGeminiSubscriptionStatus(proxy?: string): Promise<GeminiSubscriptionStatus> {
  const cacheKey = proxy || 'default';
  const cached = statusCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.status;
  }

  if (pendingRequests.has(cacheKey)) {
    return await pendingRequests.get(cacheKey)!;
  }

  const request = fetchSubscriptionStatus(proxy)
    .then((status) => {
      statusCache.set(cacheKey, {
        status,
        expiresAt: Date.now() + CACHE_TTL,
      });
      return status;
    })
    .finally(() => {
      pendingRequests.delete(cacheKey);
    });

  pendingRequests.set(cacheKey, request);
  return await request;
}
