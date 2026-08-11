/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted so vi.mock factories can access them
const { handlers, mockModelsList } = vi.hoisted(() => {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const mockModelsList = vi.fn();
  return { handlers, mockModelsList };
});

const { mockGetCopilotAuthHeaders, mockGetCopilotModelsUrl } = vi.hoisted(() => ({
  mockGetCopilotAuthHeaders: vi.fn(),
  mockGetCopilotModelsUrl: vi.fn(),
}));

const { mockFetchChatgptModels } = vi.hoisted(() => ({
  mockFetchChatgptModels: vi.fn(),
}));

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

// Auto-create channels on access via Proxy
vi.mock('@/common', () => {
  const mode = new Proxy(
    {},
    {
      get(_target, prop) {
        return {
          provider: vi.fn((fn: (...args: any[]) => any) => {
            handlers[prop as string] = fn;
          }),
          emit: vi.fn(),
          invoke: vi.fn(),
        };
      },
    }
  );
  return { ipcBridge: { mode } };
});

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn(() => ({})), set: vi.fn() },
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: { getInstance: vi.fn(() => ({ getExtensionModelList: vi.fn(async () => []) })) },
}));

vi.mock('openai', () => {
  class MockOpenAI {
    models = { list: mockModelsList };
  }
  return { default: MockOpenAI };
});

vi.mock('@process/agent/aionrs/copilotAuth', () => ({
  getCopilotAuthHeaders: mockGetCopilotAuthHeaders,
  getCopilotModelsUrl: mockGetCopilotModelsUrl,
}));

vi.mock('@process/agent/aionrs/chatgptAuth', () => ({
  fetchChatgptModels: mockFetchChatgptModels,
}));

import { initModelBridge } from '../../src/process/bridge/modelBridge';
import { guessProtocolFromUrl } from '../../src/common/utils/protocolDetector';

beforeEach(() => {
  vi.clearAllMocks();
  mockModelsList.mockReset();
  mockGetCopilotAuthHeaders.mockResolvedValue({ Authorization: 'Bearer copilot-token' });
  mockGetCopilotModelsUrl.mockReturnValue('https://api.githubcopilot.com/models');
  mockFetchChatgptModels.mockResolvedValue([{ id: 'gpt-5.2', name: 'gpt-5.2' }]);
  initModelBridge();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchModelList', () => {
  const fetchModelList = (args: any) => handlers.fetchModelList(args);

  describe('apiKey validation (Fixes ELECTRON-6X, ELECTRON-5, ELECTRON-1A)', () => {
    it('should return error when apiKey is empty string', async () => {
      const result = await fetchModelList({
        base_url: 'https://api.openai.com/v1',
        api_key: '',
        try_fix: false,
      });

      expect(result.success).toBe(false);
      expect(result.msg).toContain('API key is required');
    });

    it('should return error when apiKey is undefined', async () => {
      const result = await fetchModelList({
        base_url: 'https://api.openai.com/v1',
        api_key: undefined,
        try_fix: false,
      });

      expect(result.success).toBe(false);
      expect(result.msg).toContain('API key is required');
    });

    it('should proceed when apiKey is provided', async () => {
      mockModelsList.mockResolvedValueOnce({ data: [{ id: 'gpt-4' }] });

      const result = await fetchModelList({
        base_url: 'https://api.openai.com/v1',
        api_key: 'sk-test-key',
        try_fix: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.mode).toContain('gpt-4');
    });

    it('should use Copilot OAuth headers when platform is copilot', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ id: 'gpt-4o', name: 'GPT-4o' }],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchModelList({
        base_url: 'https://api.githubcopilot.com',
        api_key: '',
        platform: 'copilot',
      });

      expect(mockGetCopilotAuthHeaders).toHaveBeenCalledWith('', undefined);
      expect(result).toEqual({
        success: true,
        data: {
          mode: [{ id: 'gpt-4o', name: 'GPT-4o' }],
        },
      });
    });

    it('should return the ChatGPT model list from the authenticated account', async () => {
      const result = await fetchModelList({
        base_url: 'https://chatgpt.com',
        api_key: '',
        platform: 'chatgpt',
      });

      expect(mockGetCopilotAuthHeaders).not.toHaveBeenCalled();
      expect(mockFetchChatgptModels).toHaveBeenCalledOnce();
      expect(result).toEqual({
        success: true,
        data: {
          mode: [{ id: 'gpt-5.2', name: 'gpt-5.2' }],
        },
      });
    });
  });

  describe('URL validation (Fixes ELECTRON-6Z, ELECTRON-G)', () => {
    it('should return error for invalid URL when try_fix is true', async () => {
      mockModelsList.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await fetchModelList({
        base_url: 'not-a-valid-url',
        api_key: 'sk-test-key',
        try_fix: true,
      });

      expect(result.success).toBe(false);
      expect(result.msg).toContain('Invalid URL');
    });

    it('should return original error when try_fix is false', async () => {
      mockModelsList.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await fetchModelList({
        base_url: 'not-a-valid-url',
        api_key: 'sk-test-key',
        try_fix: false,
      });

      expect(result.success).toBe(false);
      expect(result.msg).toBe('Connection refused');
    });
  });

  it('treats Ollama Cloud as an OpenAI-compatible provider when listing models', async () => {
    mockModelsList.mockResolvedValueOnce({
      data: [{ id: 'qwen3-coder:480b-cloud' }],
    });

    const result = await fetchModelList({
      base_url: 'https://ollama.com/v1',
      api_key: 'ollama-test-key',
      try_fix: false,
    });

    expect(result).toEqual({
      success: true,
      data: {
        mode: ['qwen3-coder:480b-cloud'],
      },
    });
  });
});

describe('guessProtocolFromUrl', () => {
  it('recognizes Ollama Cloud as an OpenAI-compatible endpoint', () => {
    expect(guessProtocolFromUrl('https://ollama.com/v1')).toBe('openai');
  });
});
