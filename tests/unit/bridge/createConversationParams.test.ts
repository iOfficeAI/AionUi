/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Provider = {
  id: string;
  platform: string;
  name: string;
  base_url: string;
  api_key: string;
  models: string[];
  enabled?: boolean;
  model_enabled?: Record<string, boolean>;
};

const listProvidersInvoke = vi.fn<() => Promise<Provider[]>>();
const configGet = vi.fn<(key: string) => unknown>();

beforeEach(() => {
  listProvidersInvoke.mockReset();
  configGet.mockReset();

  vi.doMock('@/common', () => ({
    ipcBridge: {
      mode: {
        listProviders: { invoke: listProvidersInvoke },
      },
    },
  }));

  vi.doMock('@/common/config/configService', () => ({
    configService: {
      get: configGet,
    },
  }));
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@/common');
  vi.doUnmock('@/common/config/configService');
});

describe('getDefaultAionrsModel', () => {
  it('prefers the saved aionrs.defaultModel when that provider/model is still available', async () => {
    listProvidersInvoke.mockResolvedValue([
      {
        id: 'google-auth',
        platform: 'gemini-with-google-auth',
        name: 'Google Auth',
        base_url: '',
        api_key: '',
        models: ['gemini-2.5-pro'],
      },
      {
        id: 'openai-main',
        platform: 'openai',
        name: 'OpenAI',
        base_url: 'https://api.openai.com',
        api_key: 'sk-main',
        models: ['gpt-4.1-mini', 'gpt-4.1'],
      },
    ]);
    configGet.mockImplementation((key) =>
      key === 'aionrs.defaultModel' ? { id: 'openai-main', use_model: 'gpt-4.1' } : undefined
    );

    const { getDefaultAionrsModel } = await import('@/renderer/pages/conversation/utils/createConversationParams');
    const model = await getDefaultAionrsModel();

    expect(model.id).toBe('openai-main');
    expect(model.use_model).toBe('gpt-4.1');
  });

  it('falls back to the first compatible provider and skips google-auth or non-primary models', async () => {
    listProvidersInvoke.mockResolvedValue([
      {
        id: 'google-auth',
        platform: 'gemini-with-google-auth',
        name: 'Google Auth',
        base_url: '',
        api_key: '',
        models: ['gemini-2.5-pro'],
      },
      {
        id: 'image-only',
        platform: 'openai',
        name: 'Image Provider',
        base_url: 'https://api.example.com',
        api_key: 'sk-image',
        models: ['dall-e-3'],
      },
      {
        id: 'anthropic-main',
        platform: 'anthropic',
        name: 'Anthropic',
        base_url: 'https://api.anthropic.com',
        api_key: 'sk-anthropic',
        models: ['claude-3-7-sonnet', 'claude-3-5-haiku'],
        model_enabled: { 'claude-3-7-sonnet': false },
      },
    ]);
    configGet.mockReturnValue(undefined);

    const { getDefaultAionrsModel } = await import('@/renderer/pages/conversation/utils/createConversationParams');
    const model = await getDefaultAionrsModel();

    expect(model.id).toBe('anthropic-main');
    expect(model.use_model).toBe('claude-3-5-haiku');
  });
});

describe('buildCliAgentParams', () => {
  it('uses agent_type as the creation backend when the detected agent has no backend field', async () => {
    listProvidersInvoke.mockResolvedValue([
      {
        id: 'anthropic-main',
        platform: 'anthropic',
        name: 'Anthropic',
        base_url: 'https://api.anthropic.com',
        api_key: 'sk-anthropic',
        models: ['claude-3-5-haiku'],
      },
    ]);
    configGet.mockImplementation((key) => {
      if (key === 'aionrs.defaultModel') {
        return { id: 'anthropic-main', use_model: 'claude-3-5-haiku' };
      }
      if (key === 'aionrs.config') {
        return { preferredMode: 'default' };
      }
      return undefined;
    });

    const { buildCliAgentParams } = await import('@/renderer/pages/conversation/utils/createConversationParams');
    const params = await buildCliAgentParams(
      {
        id: 'agent-aionrs',
        name: 'Aion CLI',
        agent_type: 'aionrs',
        agent_source: 'builtin',
        enabled: true,
        available: true,
      },
      '/tmp/workspace'
    );

    expect(params.type).toBe('aionrs');
    expect(params.extra.workspace).toBe('/tmp/workspace');
    expect(params.extra.session_mode).toBe('default');
    expect(params.model.id).toBe('anthropic-main');
    expect(params.model.use_model).toBe('claude-3-5-haiku');
  });
});
