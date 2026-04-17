/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rm: vi.fn(),
  mkdtemp: vi.fn(),
  agentStart: vi.fn(),
  agentKill: vi.fn(),
  agentCapabilities: null as Record<string, unknown> | null,
  agentInstances: [] as Array<{ options: Record<string, unknown> }>,
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'appData') return 'C:/Users/test/AppData/Roaming';
      if (name === 'temp') return 'C:/Temp';
      return 'C:/Unknown';
    }),
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: state.readFile,
  mkdir: state.mkdir,
  writeFile: state.writeFile,
  rm: state.rm,
  mkdtemp: state.mkdtemp,
}));

vi.mock('@/process/agent/aionrs', () => ({
  AionrsAgent: class MockAionrsAgent {
    capabilities = state.agentCapabilities;

    constructor(public options: Record<string, unknown>) {
      state.agentInstances.push(this);
    }

    start() {
      return state.agentStart();
    }

    kill() {
      return state.agentKill();
    }
  },
}));

describe('chatgpt quota status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    state.agentCapabilities = {
      current_model: 'gpt-5-codex',
      account_limits: {
        plan_type: 'pro',
        limits: [],
      },
    };
    state.agentInstances.length = 0;
    state.agentStart.mockResolvedValue(undefined);
    state.rm.mockResolvedValue(undefined);
    state.mkdtemp.mockResolvedValue('C:/Temp/aionrs-chatgpt-quota-123');
  });

  it('returns auth metadata and account limits when the quota probe succeeds', async () => {
    state.readFile.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('auth.json')) {
        return JSON.stringify({
          providers: {
            chatgpt: {
              auth_mode: 'chatgpt',
              last_refresh: '2026-04-17T00:00:00.000Z',
              tokens: {
                access_token: 'header.payload.signature',
                account_id: 'acct_123',
                id_token: 'id_token',
              },
            },
          },
        });
      }

      if (filePath.endsWith('auth-private.json')) {
        return JSON.stringify({
          providers: {
            chatgpt: {
              refresh_token: 'refresh_token',
              expires_at: '2026-04-18T00:00:00.000Z',
              token_type: 'Bearer',
            },
          },
        });
      }

      throw new Error(`Unexpected file: ${filePath}`);
    });

    const { getChatgptQuotaStatus } = await import('@/process/agent/aionrs/chatgptAuth');

    const result = await getChatgptQuotaStatus({
      model: 'gpt-5-codex',
      proxy: 'http://127.0.0.1:7890',
    });

    expect(result.authenticated).toBe(true);
    expect(result.accountLimits?.plan_type).toBe('pro');
    expect(result.currentModel).toBe('gpt-5-codex');
    expect(state.agentStart).toHaveBeenCalledTimes(1);
    expect(state.agentKill).toHaveBeenCalledTimes(1);
    expect(state.rm).toHaveBeenCalledWith('C:/Temp/aionrs-chatgpt-quota-123', {
      recursive: true,
      force: true,
    });
    expect(state.agentInstances[0]?.options).toMatchObject({
      workspace: 'C:/Temp/aionrs-chatgpt-quota-123',
      proxy: 'http://127.0.0.1:7890',
      model: expect.objectContaining({
        platform: 'chatgpt',
        useModel: 'gpt-5-codex',
      }),
    });
  });

  it('skips the probe when ChatGPT is not authenticated', async () => {
    const notFoundError = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    state.readFile.mockRejectedValue(notFoundError);

    const { getChatgptQuotaStatus } = await import('@/process/agent/aionrs/chatgptAuth');

    const result = await getChatgptQuotaStatus({ model: 'gpt-5-codex' });

    expect(result.authenticated).toBe(false);
    expect(state.agentStart).not.toHaveBeenCalled();
    expect(state.mkdtemp).not.toHaveBeenCalled();
  });

  it('falls back to plain auth status when the probe fails', async () => {
    state.readFile.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('auth.json')) {
        return JSON.stringify({
          providers: {
            chatgpt: {
              auth_mode: 'chatgpt',
              last_refresh: '2026-04-17T00:00:00.000Z',
              tokens: {
                access_token: 'header.payload.signature',
                account_id: 'acct_123',
                id_token: 'id_token',
              },
            },
          },
        });
      }

      if (filePath.endsWith('auth-private.json')) {
        return JSON.stringify({
          providers: {
            chatgpt: {
              refresh_token: 'refresh_token',
              expires_at: '2026-04-18T00:00:00.000Z',
              token_type: 'Bearer',
            },
          },
        });
      }

      throw new Error(`Unexpected file: ${filePath}`);
    });
    state.agentStart.mockRejectedValue(new Error('probe failed'));

    const { getChatgptQuotaStatus } = await import('@/process/agent/aionrs/chatgptAuth');

    const result = await getChatgptQuotaStatus({ model: 'gpt-5-codex' });

    expect(result.authenticated).toBe(true);
    expect(result.accountLimits).toBeUndefined();
    expect(state.agentKill).toHaveBeenCalledTimes(1);
  });
});
