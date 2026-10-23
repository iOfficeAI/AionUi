/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GatewayAccount } from '@/common/types/gateway/gatewayTypes';
import type { GatewayStore } from './gatewayStore';

export class QuotaMonitor {
  private store: GatewayStore;

  constructor(store: GatewayStore) {
    this.store = store;
  }

  isAccountAvailable(account: GatewayAccount): boolean {
    if (!account.enabled) return false;
    if (account.status === 'disabled') return false;

    const now = Date.now();
    if (account.cooldownUntil && account.cooldownUntil > now) {
      return false;
    }

    // Cooldown has expired, auto-recover to active
    if (account.status === 'rate_limited' && (!account.cooldownUntil || account.cooldownUntil <= now)) {
      this.store.updateAccountQuota(account.id, undefined, 'active', 0);
    }

    return true;
  }

  handleResponse(
    account: GatewayAccount,
    statusCode: number,
    headers: Record<string, string | string[] | undefined>
  ): void {
    const normHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === 'string') {
        normHeaders[k.toLowerCase()] = v;
      } else if (Array.isArray(v) && v.length > 0) {
        normHeaders[k.toLowerCase()] = v[0];
      }
    }

    const now = Date.now();

    // 1. Check for Rate Limit / Quota Exceeded (429 or 403 quota)
    if (statusCode === 429) {
      let cooldownSeconds = 60; // default 60 seconds
      if (normHeaders['retry-after']) {
        const parsed = parseInt(normHeaders['retry-after'], 10);
        if (!isNaN(parsed) && parsed > 0) {
          cooldownSeconds = parsed;
        }
      }
      const cooldownUntil = now + cooldownSeconds * 1000;
      this.store.updateAccountQuota(
        account.id,
        {
          requestsRemaining: 0,
          resetTimestamp: cooldownUntil,
          lastUpdated: now,
        },
        'rate_limited',
        cooldownUntil
      );
      return;
    }

    // 2. Extract Quota Headers
    let requestsRemaining: number | undefined;
    let tokensRemaining: number | undefined;
    let resetTimestamp: number | undefined;

    // OpenAI / Groq / OpenRouter style
    if (normHeaders['x-ratelimit-remaining-requests']) {
      const v = parseInt(normHeaders['x-ratelimit-remaining-requests'], 10);
      if (!isNaN(v)) requestsRemaining = v;
    }
    if (normHeaders['x-ratelimit-remaining-tokens']) {
      const v = parseInt(normHeaders['x-ratelimit-remaining-tokens'], 10);
      if (!isNaN(v)) tokensRemaining = v;
    }
    if (normHeaders['x-ratelimit-reset-requests']) {
      const val = normHeaders['x-ratelimit-reset-requests'];
      resetTimestamp = this.parseResetHeader(val, now);
    }

    // Anthropic style
    if (normHeaders['anthropic-ratelimit-requests-remaining']) {
      const v = parseInt(normHeaders['anthropic-ratelimit-requests-remaining'], 10);
      if (!isNaN(v)) requestsRemaining = v;
    }
    if (normHeaders['anthropic-ratelimit-tokens-remaining']) {
      const v = parseInt(normHeaders['anthropic-ratelimit-tokens-remaining'], 10);
      if (!isNaN(v)) tokensRemaining = v;
    }
    if (normHeaders['anthropic-ratelimit-requests-reset']) {
      const val = normHeaders['anthropic-ratelimit-requests-reset'];
      resetTimestamp = this.parseResetHeader(val, now);
    }

    if (requestsRemaining !== undefined || tokensRemaining !== undefined || resetTimestamp !== undefined) {
      this.store.updateAccountQuota(
        account.id,
        {
          requestsRemaining: requestsRemaining ?? account.quotaRemaining?.requestsRemaining,
          tokensRemaining: tokensRemaining ?? account.quotaRemaining?.tokensRemaining,
          resetTimestamp: resetTimestamp ?? account.quotaRemaining?.resetTimestamp,
          lastUpdated: now,
        },
        'active'
      );
    }
  }

  private parseResetHeader(val: string, now: number): number | undefined {
    if (!val) return undefined;
    // Check if ISO date string (e.g., Anthropic "2026-10-15T12:00:00Z")
    if (val.includes('T') || val.includes('-')) {
      const parsed = Date.parse(val);
      if (!isNaN(parsed)) return parsed;
    }
    // Check if seconds or duration (e.g., OpenAI "24s", "2m", "100ms", or "12")
    if (/^\d+(\.\d+)?s$/.test(val)) {
      const s = parseFloat(val.replace('s', ''));
      return now + Math.round(s * 1000);
    }
    if (/^\d+(\.\d+)?m$/.test(val)) {
      const m = parseFloat(val.replace('m', ''));
      return now + Math.round(m * 60 * 1000);
    }
    const num = parseFloat(val);
    if (!isNaN(num)) {
      return now + Math.round(num * 1000);
    }
    return undefined;
  }
}
