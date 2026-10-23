/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow } from 'electron';
import type { GatewayAccount, GatewayCombo, GatewayTelemetryLog } from '@/common/types/gateway/gatewayTypes';
import type { GatewayStore } from './gatewayStore';
import type { QuotaMonitor } from './quotaMonitor';
import { isAnthropicNative, convertOpenAiToAnthropicPayload } from './anthropicAdapter';

type FallbackRecord = {
  accountId: string;
  accountName: string;
  model: string;
  error: string;
  statusCode?: number;
};

export type ChatCompletionRequest = {
  model: string;
  messages: unknown[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
};

export class ComboRouter {
  private store: GatewayStore;
  private quotaMonitor: QuotaMonitor;
  private roundRobinIndices: Map<string, number> = new Map();

  constructor(store: GatewayStore, quotaMonitor: QuotaMonitor) {
    this.store = store;
    this.quotaMonitor = quotaMonitor;
  }

  private broadcastLog(log: GatewayTelemetryLog): void {
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('gateway:logAdded', log);
        }
      }
    } catch {
      // Window might not be ready or in headless mode
    }
  }

  private broadcastQuotaUpdate(account: GatewayAccount): void {
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('gateway:quotaUpdated', account);
        }
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Resolve targets for the requested model name.
   */
  resolveTargets(modelName: string): {
    combo?: GatewayCombo;
    targets: Array<{ account: GatewayAccount; model: string }>;
  } {
    // 1. Check if model matches a Combo (by id, name, or combo:<id>)
    const cleanName = modelName.replace(/^combo:/i, '').trim();
    const combos = this.store.getCombos().filter((c) => c.enabled);
    const matchedCombo = combos.find((c) => c.id === cleanName || c.name.toLowerCase() === cleanName.toLowerCase());

    if (matchedCombo && matchedCombo.targets.length > 0) {
      let targets = [...matchedCombo.targets];
      if (matchedCombo.strategy === 'round-robin' && targets.length > 1) {
        const curIdx = this.roundRobinIndices.get(matchedCombo.id) ?? 0;
        const nextIdx = (curIdx + 1) % targets.length;
        this.roundRobinIndices.set(matchedCombo.id, nextIdx);
        // Rotate so curIdx is first
        targets = [...targets.slice(curIdx), ...targets.slice(0, curIdx)];
      }

      const resolved = targets
        .map((t) => {
          const acc = this.store.getAccount(t.accountId);
          return acc ? { account: acc, model: t.model } : null;
        })
        .filter((t): t is { account: GatewayAccount; model: string } => t !== null);

      return { combo: matchedCombo, targets: resolved };
    }

    // 2. Check if model has format "accountId:modelName"
    if (modelName.includes(':')) {
      const parts = modelName.split(':');
      const accountId = parts[0];
      const actualModel = parts.slice(1).join(':');
      const acc = this.store.getAccount(accountId);
      if (acc) {
        return { targets: [{ account: acc, model: actualModel }] };
      }
    }

    // 3. Fallback: match by model name across all enabled accounts
    const allAccounts = this.store.getAccounts().filter((a) => a.enabled);
    const matchedAccounts = allAccounts.filter((a) => a.models.includes(modelName));
    if (matchedAccounts.length > 0) {
      return {
        targets: matchedAccounts.map((acc) => ({ account: acc, model: modelName })),
      };
    }

    // 4. Default: try the first enabled account
    if (allAccounts.length > 0) {
      return {
        targets: [{ account: allAccounts[0], model: modelName }],
      };
    }

    return { targets: [] };
  }

  /**
   * Execute chat completion with automatic fallback across targets.
   */
  async executeChat(
    reqBody: ChatCompletionRequest,
    onChunk?: (chunk: string) => void
  ): Promise<{ response: Response; targetAccount: GatewayAccount; targetModel: string; isAnthropic: boolean }> {
    const startTime = Date.now();
    const { targets } = this.resolveTargets(reqBody.model);

    if (targets.length === 0) {
      throw new Error(`[Gateway] No active provider accounts available for model "${reqBody.model}"`);
    }

    const fallbackAttempts: FallbackRecord[] = [];

    // oxlint-disable-next-line eslint/no-await-in-loop
    for (let i = 0; i < targets.length; i++) {
      const { account, model } = targets[i];

      // Check quota cooldown
      if (!this.quotaMonitor.isAccountAvailable(account)) {
        fallbackAttempts.push({
          accountId: account.id,
          accountName: account.name,
          model,
          error: `Account is currently cooling down (${account.status})`,
        });
        continue;
      }

      try {
        const isAnthropic = isAnthropicNative(account.baseUrl, account.platform);
        const upstreamUrl = this.buildUpstreamUrl(account.baseUrl, account.platform);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (isAnthropic) {
          headers['x-api-key'] = account.apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else {
          headers.Authorization = `Bearer ${account.apiKey}`;
        }

        const payload = isAnthropic ? convertOpenAiToAnthropicPayload(reqBody, model) : { ...reqBody, model };

        // oxlint-disable-next-line eslint/no-await-in-loop
        const res = await fetch(upstreamUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        // Record headers for quota tracking
        const resHeaders: Record<string, string> = {};
        res.headers.forEach((val, key) => {
          resHeaders[key] = val;
        });
        this.quotaMonitor.handleResponse(account, res.status, resHeaders);
        this.broadcastQuotaUpdate(account);

        // Check if upstream failed (429, 401, 5xx, etc.)
        if (!res.ok) {
          // oxlint-disable-next-line eslint/no-await-in-loop
          const errText = await res.text();
          fallbackAttempts.push({
            accountId: account.id,
            accountName: account.name,
            model,
            error: errText.slice(0, 300),
            statusCode: res.status,
          });

          // If there are more fallback targets, try the next one!
          if (i < targets.length - 1) {
            console.warn(`[Gateway] Target ${account.name} failed (${res.status}). Falling back to next target...`);
            continue;
          }

          // If no more targets, log failure and throw
          this.logExecution({
            startTime,
            reqModel: reqBody.model,
            resolvedAccount: account,
            resolvedModel: model,
            fallbackAttempts,
            tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            statusCode: res.status,
            status: 'failed',
          });
          throw new Error(`[Gateway] Upstream error (${res.status}): ${errText}`);
        }

        // Upstream succeeded!
        const status = fallbackAttempts.length > 0 ? 'fallback_success' : 'success';

        // If streaming and chunk handler provided, handle stream and extract tokens
        if (reqBody.stream && onChunk && res.body) {
          return { response: res, targetAccount: account, targetModel: model, isAnthropic };
        }

        // If non-streaming or handled by caller, log success
        this.logExecution({
          startTime,
          reqModel: reqBody.model,
          resolvedAccount: account,
          resolvedModel: model,
          fallbackAttempts,
          tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          statusCode: res.status,
          status,
        });

        return { response: res, targetAccount: account, targetModel: model, isAnthropic };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        fallbackAttempts.push({
          accountId: account.id,
          accountName: account.name,
          model,
          error: errorMsg,
        });

        if (i < targets.length - 1) {
          console.warn(`[Gateway] Error connecting to ${account.name}: ${errorMsg}. Falling back...`);
          continue;
        }

        this.logExecution({
          startTime,
          reqModel: reqBody.model,
          resolvedAccount: account,
          resolvedModel: model,
          fallbackAttempts,
          tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          statusCode: 500,
          status: 'failed',
        });
        throw err;
      }
    }

    throw new Error(`[Gateway] All fallback targets failed for "${reqBody.model}"`);
  }

  logExecution(params: {
    startTime: number;
    reqModel: string;
    resolvedAccount: GatewayAccount;
    resolvedModel: string;
    fallbackAttempts: FallbackRecord[];
    tokens: {
      promptTokens: number;
      completionTokens: number;
      cachedTokens?: number;
      thoughtTokens?: number;
      totalTokens: number;
    };
    statusCode: number;
    status: 'success' | 'fallback_success' | 'failed';
  }): void {
    const log: GatewayTelemetryLog = {
      id: `gw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: params.startTime,
      requestedModelOrCombo: params.reqModel,
      resolvedAccountId: params.resolvedAccount.id,
      resolvedAccountName: params.resolvedAccount.name,
      resolvedModel: params.resolvedModel,
      fallbackAttempts: params.fallbackAttempts,
      tokens: params.tokens,
      latencyMs: Date.now() - params.startTime,
      statusCode: params.statusCode,
      status: params.status,
    };

    this.store.addLog(log);
    this.broadcastLog(log);
  }

  private buildUpstreamUrl(baseUrl: string, platform: string): string {
    let clean = baseUrl.trim().replace(/\/+$/, '');
    if (isAnthropicNative(baseUrl, platform)) {
      if (!clean.endsWith('/v1/messages')) {
        clean = `${clean}/v1/messages`;
      }
      return clean;
    }
    if (platform === 'gemini') {
      if (!clean.includes('/openai')) {
        clean = `${clean}/openai`;
      }
      if (!clean.endsWith('/chat/completions')) {
        clean = `${clean}/chat/completions`;
      }
      return clean;
    }
    if (!clean.endsWith('/chat/completions')) {
      if (clean.endsWith('/v1')) {
        clean = `${clean}/chat/completions`;
      } else {
        clean = `${clean}/v1/chat/completions`;
      }
    }
    return clean;
  }
}
