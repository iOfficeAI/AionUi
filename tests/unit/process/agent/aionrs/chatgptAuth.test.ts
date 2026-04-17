/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
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
  spawn: vi.fn(),
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

vi.mock('node:child_process', () => ({
  spawn: state.spawn,
}));

vi.mock('../../../../../src/process/agent/aionrs/binaryResolver', () => ({
  resolveAionrsBinary: vi.fn(() => 'C:/Tools/aionrs.exe'),
}));

vi.mock('../../../../../src/process/agent/aionrs/envBuilder', () => ({
  buildAionrsChildEnv: vi.fn(() => ({})),
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
    state.spawn.mockReset();
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

  it('falls back to /status --chatgpt when capabilities do not include account limits', async () => {
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
    state.agentCapabilities = {
      current_model: 'gpt-5-codex',
    };
    state.mkdtemp
      .mockResolvedValueOnce('C:/Temp/aionrs-chatgpt-quota-123')
      .mockResolvedValueOnce('C:/Temp/aionrs-chatgpt-status-123');
    state.spawn.mockImplementation(() => {
      const childEvents = new EventEmitter();
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const stdin = {
        write: vi.fn(),
        end: vi.fn(),
      };

      const child = {
        stdout,
        stderr,
        stdin,
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          childEvents.on(event, handler);
          return child;
        }),
      };

      queueMicrotask(() => {
        childEvents.emit('spawn');
        stderr.emit(
          'data',
          Buffer.from(
            [
              'Status (ChatGPT)',
              'Model: gpt-5-codex',
              'Plan: Pro',
              '5h limit: 55% left (45% used)',
              'Credits: 38 credits',
            ].join('\n')
          )
        );
        childEvents.emit('exit', 0, null);
      });

      return child;
    });

    const { getChatgptQuotaStatus } = await import('@/process/agent/aionrs/chatgptAuth');

    const result = await getChatgptQuotaStatus({ model: 'gpt-5-codex' });

    expect(result.authenticated).toBe(true);
    expect(result.accountLimits).toBeUndefined();
    expect(result.statusText).toContain('Status (ChatGPT)');
    expect(result.statusText).toContain('Plan: Pro');
    expect(state.spawn).toHaveBeenCalledWith(
      'C:/Tools/aionrs.exe',
      expect.arrayContaining(['--provider', 'chatgpt', '--model', 'gpt-5-codex', '--no-color']),
      expect.objectContaining({
        cwd: 'C:/Temp/aionrs-chatgpt-status-123',
      })
    );
    const spawnedChild = state.spawn.mock.results[0]?.value as { stdin: { write: ReturnType<typeof vi.fn> } };
    expect(spawnedChild.stdin.write).toHaveBeenCalledWith('/status --chatgpt\n/quit\n');
  });
});
