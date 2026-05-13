/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const configStorageGet = vi.fn();
const processConfigGet = vi.fn();

vi.mock('@/common/config/storage', async () => {
  const actual = await vi.importActual<typeof import('../../../src/common/config/storage')>(
    '../../../src/common/config/storage'
  );
  return {
    ...actual,
    ConfigStorage: {
      get: configStorageGet,
    },
  };
});

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: processConfigGet,
  },
}));

const {
  getDefaultModelIntent,
  resolveBackendModelPreference,
  resolveProcessBackendModelPreference,
  resolveProcessUnifiedIntentForMigration,
} = await import('../../../src/process/agent/modelSync');

describe('defaultModelIntent resolver', () => {
  beforeEach(() => {
    configStorageGet.mockReset();
    processConfigGet.mockReset();
  });

  it('prefers the unified default model intent when present', async () => {
    configStorageGet.mockImplementation(async (key: string) => {
      if (key === 'agent.defaultModelIntent') {
        return {
          providerId: 'provider-1',
          modelId: 'gpt-4.1',
          providerPlatform: 'openai',
          providerName: 'Provider',
          source: 'guid',
          updatedAt: 1,
        };
      }
      if (key === 'model.config') {
        return [
          {
            id: 'provider-1',
            platform: 'openai',
            name: 'Provider',
            baseUrl: 'https://example.com',
            apiKey: 'token',
            model: ['gpt-4.1'],
            enabled: true,
          },
        ];
      }
      return undefined;
    });

    const intent = await getDefaultModelIntent();
    const pref = await resolveBackendModelPreference('gemini');

    expect(intent?.modelId).toBe('gpt-4.1');
    expect(pref.source).toBe('default-model-intent');
    expect(pref.providerModel?.useModel).toBe('gpt-4.1');
  });

  it('falls back to legacy gemini.defaultModel when unified intent is missing', async () => {
    configStorageGet.mockImplementation(async (key: string) => {
      if (key === 'agent.defaultModelIntent') return undefined;
      if (key === 'gemini.defaultModel') return { id: 'provider-1', useModel: 'gpt-4.1' };
      if (key === 'model.config') {
        return [
          {
            id: 'provider-1',
            platform: 'openai',
            name: 'Provider',
            baseUrl: 'https://example.com',
            apiKey: 'token',
            model: ['gpt-4.1'],
            enabled: true,
          },
        ];
      }
      return undefined;
    });

    const intent = await getDefaultModelIntent();
    const pref = await resolveBackendModelPreference('gemini');

    expect(intent?.source).toBe('migration');
    expect(pref.source).toBe('legacy-backend-config');
    expect(pref.providerModel?.useModel).toBe('gpt-4.1');
  });

  it('keeps Claude ACP backend on legacy preferredModelId for renderer preference resolution', async () => {
    configStorageGet.mockImplementation(async (key: string) => {
      if (key === 'agent.defaultModelIntent') {
        return {
          providerId: 'provider-1',
          modelId: 'gpt-4.1',
          updatedAt: 1,
        };
      }
      if (key === 'model.config') return [];
      if (key === 'acp.config') {
        return {
          claude: { preferredModelId: 'default' },
        };
      }
      if (key === 'acp.cachedModels') return {};
      return undefined;
    });

    const pref = await resolveBackendModelPreference('claude');
    expect(pref.source).toBe('legacy-backend-config');
    expect(pref.currentModelId).toBe('default');
  });

  it('uses process-side unified intent for cron/backend readers', async () => {
    processConfigGet.mockImplementation(async (key: string) => {
      if (key === 'agent.defaultModelIntent') {
        return {
          providerId: 'provider-2',
          modelId: 'claude-sonnet-4',
          providerPlatform: 'anthropic',
          providerName: 'Anthropic',
          updatedAt: 1,
        };
      }
      if (key === 'model.config') {
        return [
          {
            id: 'provider-2',
            platform: 'anthropic',
            name: 'Anthropic',
            baseUrl: 'https://example.com',
            apiKey: 'token',
            model: ['claude-sonnet-4'],
            enabled: true,
          },
        ];
      }
      return undefined;
    });

    const pref = await resolveProcessBackendModelPreference('aionrs');
    expect(pref.source).toBe('default-model-intent');
    expect(pref.providerModel?.useModel).toBe('claude-sonnet-4');
  });

  it('falls back to process-side aionrs.defaultModel when unified intent and gemini legacy are missing', async () => {
    processConfigGet.mockImplementation(async (key: string) => {
      if (key === 'agent.defaultModelIntent') return undefined;
      if (key === 'gemini.defaultModel') return undefined;
      if (key === 'aionrs.defaultModel') {
        return { id: 'provider-3', useModel: 'gpt-4.1-mini' };
      }
      if (key === 'model.config') {
        return [
          {
            id: 'provider-3',
            platform: 'openai',
            name: 'Provider 3',
            baseUrl: 'https://example.com',
            apiKey: 'token',
            model: ['gpt-4.1-mini'],
            enabled: true,
          },
        ];
      }
      return undefined;
    });

    const intent = await resolveProcessUnifiedIntentForMigration();
    const pref = await resolveProcessBackendModelPreference('aionrs');

    expect(intent?.providerId).toBe('provider-3');
    expect(intent?.modelId).toBe('gpt-4.1-mini');
    expect(intent?.source).toBe('migration');
    expect(pref.source).toBe('legacy-backend-config');
    expect(pref.providerModel?.useModel).toBe('gpt-4.1-mini');
  });

  it('prefers existing process-side unified intent over legacy defaults during migration resolution', async () => {
    processConfigGet.mockImplementation(async (key: string) => {
      if (key === 'agent.defaultModelIntent') {
        return {
          providerId: 'provider-live',
          modelId: 'claude-4-sonnet',
          providerPlatform: 'anthropic',
          providerName: 'Anthropic',
          source: 'guid',
          updatedAt: 42,
        };
      }
      if (key === 'gemini.defaultModel') return { id: 'provider-legacy', useModel: 'gpt-4.1' };
      if (key === 'model.config') {
        return [
          {
            id: 'provider-live',
            platform: 'anthropic',
            name: 'Anthropic',
            baseUrl: 'https://example.com',
            apiKey: 'token',
            model: ['claude-4-sonnet'],
            enabled: true,
          },
          {
            id: 'provider-legacy',
            platform: 'openai',
            name: 'Legacy',
            baseUrl: 'https://legacy.example.com',
            apiKey: 'token',
            model: ['gpt-4.1'],
            enabled: true,
          },
        ];
      }
      return undefined;
    });

    const intent = await resolveProcessUnifiedIntentForMigration();

    expect(intent).toEqual({
      providerId: 'provider-live',
      modelId: 'claude-4-sonnet',
      providerPlatform: 'anthropic',
      providerName: 'Anthropic',
      source: 'guid',
      updatedAt: 42,
    });
  });

  it('returns null when process-side legacy defaults point to a model not present in enabled providers', async () => {
    processConfigGet.mockImplementation(async (key: string) => {
      if (key === 'agent.defaultModelIntent') return undefined;
      if (key === 'gemini.defaultModel') return 'missing-model';
      if (key === 'aionrs.defaultModel') return { id: 'provider-4', useModel: 'also-missing' };
      if (key === 'model.config') {
        return [
          {
            id: 'provider-4',
            platform: 'openai',
            name: 'Provider 4',
            baseUrl: 'https://example.com',
            apiKey: 'token',
            model: ['gpt-4.1'],
            enabled: true,
          },
        ];
      }
      return undefined;
    });

    await expect(resolveProcessUnifiedIntentForMigration()).resolves.toBeNull();
  });
});
