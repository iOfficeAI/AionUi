/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (...args: unknown[]) => unknown | Promise<unknown>;

type FetchModelListArgs = {
  base_url?: string;
  api_key: string;
  try_fix?: boolean;
  platform?: string;
};

type FetchModelListResponse = {
  success: boolean;
  msg?: string;
  data?: { mode: Array<string | { id: string; name: string }>; fix_base_url?: string };
};

type SyncDefaultModelBackendsArgs = {
  intent: {
    providerId: string;
    modelId: string;
    updatedAt: number;
    providerPlatform?: string;
    providerName?: string;
    source?: 'guid' | 'migration' | 'sync' | 'unknown';
  };
  backends: string[];
};

type SyncDefaultModelBackendsResponse = {
  success: boolean;
  msg?: string;
  data?: {
    results: Array<{ backend: string; supported: boolean; reason?: string; appliedModelId?: string }>;
  };
};

const { handlers, mockModelsList, mockSyncBackends, mockProcessConfigSet } = vi.hoisted(() => {
  return {
    handlers: {} as Record<string, Handler>,
    mockModelsList: vi.fn(),
    mockSyncBackends: vi.fn(),
    mockProcessConfigSet: vi.fn(async () => undefined),
  };
});

function makeChannel(name: string) {
  return {
    provider: vi.fn((fn: Handler) => {
      handlers[name] = fn;
    }),
    emit: vi.fn(),
    invoke: vi.fn(),
  };
}

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      fetchModelList: makeChannel('fetchModelList'),
      saveModelConfig: makeChannel('saveModelConfig'),
      getModelConfig: makeChannel('getModelConfig'),
      syncDefaultModelBackends: makeChannel('syncDefaultModelBackends'),
      detectProtocol: makeChannel('detectProtocol'),
    },
  },
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    constructor(config: { apiKey?: string }) {
      // Simulate real OpenAI SDK behavior: throw when apiKey is undefined or whitespace-only
      const key = config.apiKey;
      if (key === undefined || key.trim() === '') {
        throw new Error(
          'Missing credentials. Please pass an `apiKey`, or set the `OPENAI_API_KEY` environment variable.'
        );
      }
    }

    models = {
      list: mockModelsList,
    };
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    set: mockProcessConfigSet,
    get: vi.fn(async () => []),
  },
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: vi.fn(() => ({
      getModelProviders: vi.fn(() => []),
    })),
  },
}));

vi.mock('@aws-sdk/client-bedrock', () => ({
  BedrockClient: function MockBedrockClient() {},
  ListInferenceProfilesCommand: function MockListInferenceProfilesCommand() {},
}));

vi.mock('@process/agent/modelSync', () => ({
  modelSyncOrchestrator: {
    syncBackends: mockSyncBackends,
  },
}));

import { initModelBridge } from '../../../src/process/bridge/modelBridge';

function getFetchModelListHandler() {
  const handler = handlers.fetchModelList;
  expect(handler).toBeTypeOf('function');
  return handler as (args: FetchModelListArgs) => Promise<FetchModelListResponse>;
}

function getSyncDefaultModelBackendsHandler() {
  const handler = handlers.syncDefaultModelBackends;
  expect(handler).toBeTypeOf('function');
  return handler as (args: SyncDefaultModelBackendsArgs) => Promise<SyncDefaultModelBackendsResponse>;
}

describe('modelBridge fetchModelList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockModelsList.mockReset();
    mockSyncBackends.mockReset();
    mockProcessConfigSet.mockReset();
    initModelBridge();
  });

  it('returns the MiniMax hardcoded list including MiniMax-M2.7 and MiniMax-M2.5', async () => {
    const fetchModelList = getFetchModelListHandler();

    const result = await fetchModelList({
      base_url: 'https://api.minimaxi.com/v1',
      api_key: 'minimax-key',
    });

    expect(result).toEqual({
      success: true,
      data: {
        mode: ['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.1', 'MiniMax-M2.1-lightning', 'MiniMax-M2', 'M2-her'],
      },
    });
    expect(mockModelsList).not.toHaveBeenCalled();
  });

  it('returns error when apiKey is empty for new-api platform (Fixes ELECTRON-6X)', async () => {
    const fetchModelList = getFetchModelListHandler();

    const result = await fetchModelList({
      base_url: 'https://new-api.example.com',
      api_key: '',
      platform: 'new-api',
    });

    expect(result.success).toBe(false);
    expect(result.msg).toContain('API key is required');
    expect(mockModelsList).not.toHaveBeenCalled();
  });

  it('returns error when apiKey is undefined for new-api platform (Fixes ELECTRON-6X)', async () => {
    const fetchModelList = getFetchModelListHandler();

    const result = await fetchModelList({
      base_url: 'https://new-api.example.com',
      api_key: undefined as unknown as string,
      platform: 'new-api',
    });

    expect(result.success).toBe(false);
    expect(result.msg).toContain('API key is required');
    expect(mockModelsList).not.toHaveBeenCalled();
  });

  it('returns error when apiKey is whitespace-only for new-api platform (Fixes ELECTRON-6X)', async () => {
    const fetchModelList = getFetchModelListHandler();

    const result = await fetchModelList({
      base_url: 'https://new-api.example.com',
      api_key: '   ',
      platform: 'new-api',
    });

    expect(result.success).toBe(false);
    expect(result.msg).toContain('API key is required');
    expect(mockModelsList).not.toHaveBeenCalled();
  });

  it('returns error when apiKey is whitespace-only for default OpenAI path (Fixes ELECTRON-6X)', async () => {
    const fetchModelList = getFetchModelListHandler();

    const result = await fetchModelList({
      base_url: 'https://api.openai.com/v1',
      api_key: ' \t\n ',
      try_fix: false,
    });

    expect(result.success).toBe(false);
    expect(result.msg).toContain('API key is required');
    expect(mockModelsList).not.toHaveBeenCalled();
  });

  it('catches OpenAI constructor errors instead of unhandled rejection (Fixes ELECTRON-6X)', async () => {
    const fetchModelList = getFetchModelListHandler();

    // Even if apiKey somehow passes the guard, the constructor error should be caught
    const result = await fetchModelList({
      base_url: 'https://api.openai.com/v1',
      api_key: undefined as unknown as string,
      try_fix: false,
    });

    expect(result.success).toBe(false);
    expect(mockModelsList).not.toHaveBeenCalled();
  });

  it('returns the OpenAI-compatible result for non-MiniMax URLs', async () => {
    mockModelsList.mockResolvedValue({
      data: [{ id: 'gpt-4o-mini' }],
    });

    const fetchModelList = getFetchModelListHandler();
    const result = await fetchModelList({
      base_url: 'https://api.openai.com/v1',
      api_key: 'sk-test',
      try_fix: false,
    });

    expect(mockModelsList).toHaveBeenCalledOnce();
    expect(result).toEqual({
      success: true,
      data: {
        mode: ['gpt-4o-mini'],
      },
    });
  });

  it('returns an error when a non-MiniMax OpenAI-compatible provider fails', async () => {
    mockModelsList.mockRejectedValue(new Error('upstream unavailable'));

    const fetchModelList = getFetchModelListHandler();
    const result = await fetchModelList({
      base_url: 'https://example.com/v1',
      api_key: 'sk-test',
      try_fix: false,
    });

    expect(mockModelsList).toHaveBeenCalledOnce();
    expect(result).toEqual({
      success: false,
      msg: 'upstream unavailable',
    });
  });

  it('proxies default-model backend sync requests through the orchestrator', async () => {
    mockSyncBackends.mockResolvedValue([
      {
        backend: 'openclaw-gateway',
        supported: true,
        appliedModelId: 'anthropic/claude-sonnet-4',
      },
    ]);

    const syncDefaultModelBackends = getSyncDefaultModelBackendsHandler();
    const intent = {
      providerId: 'provider-1',
      modelId: 'claude-sonnet-4',
      providerPlatform: 'anthropic',
      updatedAt: 1,
      source: 'guid' as const,
    };

    const result = await syncDefaultModelBackends({
      intent,
      backends: ['openclaw-gateway', 'opencode'],
    });

    expect(mockProcessConfigSet).toHaveBeenCalledWith('agent.defaultModelIntent', intent);
    expect(mockSyncBackends).toHaveBeenCalledWith(intent, ['openclaw-gateway', 'opencode']);
    expect(result).toEqual({
      success: true,
      data: {
        results: [
          {
            backend: 'openclaw-gateway',
            supported: true,
            appliedModelId: 'anthropic/claude-sonnet-4',
          },
        ],
      },
    });
  });
});
