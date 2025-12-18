/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UserTierId } from '@office-ai/aioncli-core';
import { getOauthInfoWithCache } from '@office-ai/aioncli-core';

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

// 检查订阅状态，但不触发登录流程。Check subscription without triggering login flow.
// 注意：由于 setupUser 需要交互式 OAuth client，我们暂时只能检查是否有有效凭证。
// 如果需要完整的订阅状态检查，用户需要先通过设置页面登录。
async function fetchSubscriptionStatus(proxy?: string): Promise<GeminiSubscriptionStatus> {
  try {
    // 只使用缓存的凭证检查，不触发登录流程
    // Only use cached credentials, do not trigger login flow
    const oauthInfo = await getOauthInfoWithCache(proxy);

    if (!oauthInfo) {
      // 没有有效的缓存凭证，返回未知状态
      // No valid cached credentials, return unknown status
      return {
        isSubscriber: false,
        tier: 'unknown',
        lastChecked: Date.now(),
        message: 'No valid cached credentials',
      };
    }

    // 有有效凭证，但我们无法在不触发登录流程的情况下检查实际订阅状态
    // 暂时假设有凭证的用户是标准用户（可以在登录时正确设置）
    // Has valid credentials, but we can't check actual subscription without triggering login
    // For now, assume users with valid credentials are standard users
    return {
      isSubscriber: false,
      tier: 'unknown',
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
