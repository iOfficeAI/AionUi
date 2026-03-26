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

const { handlers, mockModelsList } = vi.hoisted(() => {
  return {
    handlers: {} as Record<string, Handler>,
    mockModelsList: vi.fn(),
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
      detectProtocol: makeChannel('detectProtocol'),
    },
  },
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    models = {
      list: mockModelsList,
    };
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    set: vi.fn(async () => undefined),
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

import { initModelBridge } from '../../../src/process/bridge/modelBridge';

function getFetchModelListHandler() {
  const handler = handlers.fetchModelList;
  expect(handler).toBeTypeOf('function');
  return handler as (args: FetchModelListArgs) => Promise<FetchModelListResponse>;
}

describe('modelBridge fetchModelList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockModelsList.mockReset();
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
});
