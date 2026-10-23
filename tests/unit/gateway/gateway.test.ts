/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let testDir: string;

vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => testDir,
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

import { GatewayStore } from '@process/services/gateway/gatewayStore';
import { QuotaMonitor } from '@process/services/gateway/quotaMonitor';
import { ComboRouter } from '@process/services/gateway/comboRouter';
import type { GatewayAccount, GatewayCombo } from '@/common/types/gateway/gatewayTypes';

describe('Gateway Tests', () => {
  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });
  it('should save, retrieve, and delete accounts', () => {
    const store = new GatewayStore();
    const testAccount: GatewayAccount = {
      id: 'test-acc-1',
      name: 'Gemini Personal',
      platform: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'test-key-123',
      models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
      enabled: true,
      status: 'active',
    };

    store.saveAccount(testAccount);
    expect(store.getAccount('test-acc-1')).toEqual(testAccount);
    expect(store.getAccounts().some((a) => a.id === 'test-acc-1')).toBe(true);

    store.deleteAccount('test-acc-1');
    expect(store.getAccount('test-acc-1')).toBeUndefined();
  });

  it('should save, retrieve, and delete combos', () => {
    const store = new GatewayStore();
    const testCombo: GatewayCombo = {
      id: 'test-combo-1',
      name: 'Smart Coding Fallback',
      strategy: 'priority',
      targets: [
        { accountId: 'acc-1', model: 'claude-3-7-sonnet' },
        { accountId: 'acc-2', model: 'gemini-2.5-pro' },
      ],
      enabled: true,
    };

    store.saveCombo(testCombo);
    expect(store.getCombo('test-combo-1')).toEqual(testCombo);
    expect(store.getCombos().some((c) => c.id === 'test-combo-1')).toBe(true);

    store.deleteCombo('test-combo-1');
    expect(store.getCombo('test-combo-1')).toBeUndefined();
  });

  it('should record and retrieve telemetry logs', () => {
    const store = new GatewayStore();
    store.clearLogs();

    store.addLog({
      id: 'log-1',
      timestamp: Date.now(),
      requestedModelOrCombo: 'Smart Coding Fallback',
      resolvedAccountId: 'acc-1',
      resolvedAccountName: 'Claude Team',
      resolvedModel: 'claude-3-7-sonnet',
      fallbackAttempts: [],
      tokens: {
        promptTokens: 120,
        completionTokens: 80,
        cachedTokens: 30,
        thoughtTokens: 0,
        totalTokens: 200,
      },
      latencyMs: 1450,
      statusCode: 200,
      status: 'success',
    });

    const res = store.getLogs(10, 0);
    expect(res.total).toBe(1);
    expect(res.logs[0].id).toBe('log-1');
    expect(res.logs[0].tokens.cachedTokens).toBe(30);

    store.clearLogs();
    expect(store.getLogs().total).toBe(0);
  });
});

describe('QuotaMonitor', () => {
  it('should detect rate limits and put account into cooldown', () => {
    const store = new GatewayStore();
    const monitor = new QuotaMonitor(store);

    const account: GatewayAccount = {
      id: 'acc-quota-test',
      name: 'Gemini Quota Test',
      platform: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'key',
      models: ['gemini-2.5-pro'],
      enabled: true,
      status: 'active',
    };
    store.saveAccount(account);

    expect(monitor.isAccountAvailable(account)).toBe(true);

    // Simulate 429 response with Retry-After: 30
    monitor.handleResponse(account, 429, { 'retry-after': '30' });

    const updated = store.getAccount('acc-quota-test')!;
    expect(updated.status).toBe('rate_limited');
    expect(updated.cooldownUntil).toBeGreaterThan(Date.now());
    expect(monitor.isAccountAvailable(updated)).toBe(false);

    // Reset cooldown
    store.updateAccountQuota(account.id, undefined, 'active', 0);
    const recovered = store.getAccount('acc-quota-test')!;
    expect(monitor.isAccountAvailable(recovered)).toBe(true);
  });

  it('should parse quota headers from response', () => {
    const store = new GatewayStore();
    const monitor = new QuotaMonitor(store);

    const account: GatewayAccount = {
      id: 'acc-headers-test',
      name: 'OpenAI Test',
      platform: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'key',
      models: ['gpt-4o'],
      enabled: true,
      status: 'active',
    };
    store.saveAccount(account);

    monitor.handleResponse(account, 200, {
      'x-ratelimit-remaining-requests': '495',
      'x-ratelimit-remaining-tokens': '850000',
      'x-ratelimit-reset-requests': '24s',
    });

    const updated = store.getAccount('acc-headers-test')!;
    expect(updated.quotaRemaining?.requestsRemaining).toBe(495);
    expect(updated.quotaRemaining?.tokensRemaining).toBe(850000);
    expect(updated.quotaRemaining?.resetTimestamp).toBeGreaterThan(Date.now());
  });
});

describe('ComboRouter', () => {
  it('should resolve targets for a combo chain in priority order', () => {
    const store = new GatewayStore();
    const monitor = new QuotaMonitor(store);
    const router = new ComboRouter(store, monitor);

    const acc1: GatewayAccount = {
      id: 'acc-claude',
      name: 'Claude Pro',
      platform: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'key-1',
      models: ['claude-3-7-sonnet'],
      enabled: true,
      status: 'active',
    };
    const acc2: GatewayAccount = {
      id: 'acc-deepseek',
      name: 'DeepSeek Backup',
      platform: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'key-2',
      models: ['deepseek-chat'],
      enabled: true,
      status: 'active',
    };

    store.saveAccount(acc1);
    store.saveAccount(acc2);

    const combo: GatewayCombo = {
      id: 'combo-coding',
      name: 'Coding Pipeline',
      strategy: 'priority',
      targets: [
        { accountId: 'acc-claude', model: 'claude-3-7-sonnet' },
        { accountId: 'acc-deepseek', model: 'deepseek-chat' },
      ],
      enabled: true,
    };
    store.saveCombo(combo);

    const resolved = router.resolveTargets('Coding Pipeline');
    expect(resolved.combo?.name).toBe('Coding Pipeline');
    expect(resolved.targets.length).toBe(2);
    expect(resolved.targets[0].account.name).toBe('Claude Pro');
    expect(resolved.targets[0].model).toBe('claude-3-7-sonnet');
    expect(resolved.targets[1].account.name).toBe('DeepSeek Backup');
    expect(resolved.targets[1].model).toBe('deepseek-chat');
  });

  it('should rotate targets when strategy is round-robin', () => {
    const store = new GatewayStore();
    const monitor = new QuotaMonitor(store);
    const router = new ComboRouter(store, monitor);

    const acc1: GatewayAccount = {
      id: 'acc-rr-1',
      name: 'Account 1',
      platform: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'key-1',
      models: ['gemini-2.5-flash'],
      enabled: true,
      status: 'active',
    };
    const acc2: GatewayAccount = {
      id: 'acc-rr-2',
      name: 'Account 2',
      platform: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'key-2',
      models: ['gemini-2.5-flash'],
      enabled: true,
      status: 'active',
    };

    store.saveAccount(acc1);
    store.saveAccount(acc2);

    const combo: GatewayCombo = {
      id: 'combo-rr',
      name: 'Gemini Load Balanced',
      strategy: 'round-robin',
      targets: [
        { accountId: 'acc-rr-1', model: 'gemini-2.5-flash' },
        { accountId: 'acc-rr-2', model: 'gemini-2.5-flash' },
      ],
      enabled: true,
    };
    store.saveCombo(combo);

    const first = router.resolveTargets('combo-rr');
    const second = router.resolveTargets('combo-rr');

    expect(first.targets[0].account.id).toBe('acc-rr-1');
    expect(second.targets[0].account.id).toBe('acc-rr-2');
  });
});

import {
  isAnthropicNative,
  convertOpenAiToAnthropicPayload,
  convertAnthropicToOpenAiResponse,
  transformAnthropicSseLine,
  type AnthropicStreamState,
} from '@process/services/gateway/anthropicAdapter';

describe('AnthropicAdapter Tests', () => {
  it('should identify native Anthropic endpoints', () => {
    expect(isAnthropicNative('https://api.anthropic.com/v1', 'anthropic')).toBe(true);
    expect(isAnthropicNative('https://api.anthropic.com', 'anthropic')).toBe(true);
    expect(isAnthropicNative('https://openrouter.ai/api/v1', 'anthropic')).toBe(false);
    expect(isAnthropicNative('https://api.openai.com/v1', 'openai')).toBe(false);
  });

  it('should convert OpenAI chat completion payload to Anthropic format', () => {
    const openAiPayload = {
      model: 'claude-3-7-sonnet',
      messages: [
        { role: 'system', content: 'You are a helpful coding assistant.' },
        { role: 'user', content: 'Explain recursion.' },
        { role: 'assistant', content: 'Recursion is when a function calls itself.' },
        { role: 'user', content: 'Give an example.' },
      ],
      max_tokens: 2048,
      temperature: 0.5,
      stream: true,
    };

    const anthropicPayload = convertOpenAiToAnthropicPayload(openAiPayload, 'claude-3-7-sonnet-20250219');
    expect(anthropicPayload.model).toBe('claude-3-7-sonnet-20250219');
    expect(anthropicPayload.system).toBe('You are a helpful coding assistant.');
    expect(anthropicPayload.max_tokens).toBe(2048);
    expect(anthropicPayload.stream).toBe(true);
    expect(anthropicPayload.messages.length).toBe(3);
    expect(anthropicPayload.messages[0]).toEqual({ role: 'user', content: 'Explain recursion.' });
  });

  it('should convert Anthropic response to OpenAI chat completion format', () => {
    const anthropicRes = {
      id: 'msg_01XFDUDYJgJh9MrhGCTMo6pc',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
      model: 'claude-3-7-sonnet-20250219',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 25,
        output_tokens: 10,
        cache_read_input_tokens: 5,
      },
    };

    const openAiRes = convertAnthropicToOpenAiResponse(anthropicRes, 'claude-3-7-sonnet');
    expect(openAiRes.object).toBe('chat.completion');
    expect(openAiRes.model).toBe('claude-3-7-sonnet');
    const choices = openAiRes.choices as Array<{ message: { content: string }; finish_reason: string }>;
    expect(choices[0].message.content).toBe('Hello! How can I help you today?');
    expect(choices[0].finish_reason).toBe('stop');

    const usage = openAiRes.usage as {
      prompt_tokens: number;
      completion_tokens: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
    expect(usage.prompt_tokens).toBe(25);
    expect(usage.completion_tokens).toBe(10);
    expect(usage.prompt_tokens_details?.cached_tokens).toBe(5);
  });

  it('should parse Anthropic SSE stream lines and emit OpenAI SSE chunks', () => {
    const emittedChunks: string[] = [];
    const state: AnthropicStreamState = {
      id: 'test-stream',
      model: 'claude-3-7-sonnet',
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      thoughtTokens: 0,
    };

    // 1. message_start
    transformAnthropicSseLine(
      'data: {"type":"message_start","message":{"id":"msg_123","usage":{"input_tokens":30,"cache_read_input_tokens":12}}}',
      state,
      (c) => emittedChunks.push(c)
    );
    expect(state.id).toBe('msg_123');
    expect(state.inputTokens).toBe(30);
    expect(state.cachedTokens).toBe(12);

    // 2. content_block_delta
    transformAnthropicSseLine(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}',
      state,
      (c) => emittedChunks.push(c)
    );
    expect(emittedChunks.length).toBe(1);
    expect(emittedChunks[0]).toContain('"content":"Hello "');

    // 3. message_delta
    transformAnthropicSseLine(
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":8}}',
      state,
      (c) => emittedChunks.push(c)
    );
    expect(emittedChunks.length).toBe(2);
    expect(emittedChunks[1]).toContain('"completion_tokens":8');
    expect(emittedChunks[1]).toContain('"cached_tokens":12');

    // 4. message_stop
    transformAnthropicSseLine('data: {"type":"message_stop"}', state, (c) => emittedChunks.push(c));
    expect(emittedChunks.length).toBe(3);
    expect(emittedChunks[2]).toBe('data: [DONE]\n\n');
  });
});
