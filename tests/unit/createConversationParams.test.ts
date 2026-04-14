/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLocaleKey } from '../../src/common/utils';

const loadPresetAssistantResources = vi.fn();
const configGet = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {},
}));

vi.mock('@/common/config/storage', async () => {
  const actual = await vi.importActual<typeof import('../../src/common/config/storage')>(
    '../../src/common/config/storage'
  );
  return {
    ...actual,
    ConfigStorage: {
      get: configGet,
    },
  };
});

vi.mock('@/common/utils/presetAssistantResources', () => ({
  loadPresetAssistantResources,
}));

const { buildPresetAssistantParams, buildCliAgentParams } =
  await import('../../src/renderer/pages/conversation/utils/createConversationParams');

describe('createConversationParams', () => {
  beforeEach(() => {
    loadPresetAssistantResources.mockReset();
    configGet.mockReset();
  });

  it('uses the shared locale resolver for Turkish', async () => {
    loadPresetAssistantResources.mockResolvedValue({
      rules: 'preset rules',
      skills: '',
      enabledSkills: ['moltbook'],
    });
    configGet.mockResolvedValue([
      {
        id: 'provider-1',
        platform: 'openai',
        name: 'Provider',
        baseUrl: 'https://example.com',
        apiKey: 'token',
        model: ['gpt-4.1'],
        enabled: true,
      },
    ]);

    const params = await buildPresetAssistantParams(
      {
        backend: 'custom',
        name: 'Preset Assistant',
        customAgentId: 'builtin-cowork',
        isPreset: true,
        presetAgentType: 'gemini',
      },
      '/tmp/workspace',
      'tr'
    );

    expect(resolveLocaleKey('tr')).toBe('tr-TR');
    expect(loadPresetAssistantResources).toHaveBeenCalledWith({
      customAgentId: 'builtin-cowork',
      localeKey: 'tr-TR',
    });
    expect(params.extra.presetRules).toBe('preset rules');
    expect(params.extra.enabledSkills).toEqual(['moltbook']);
    expect(params.model.useModel).toBe('gpt-4.1');
  });

  it('maps acp preset assistants to presetContext and backend', async () => {
    loadPresetAssistantResources.mockResolvedValue({
      rules: 'acp preset rules',
      skills: '',
      enabledSkills: undefined,
    });

    const params = await buildPresetAssistantParams(
      {
        backend: 'custom',
        name: 'Codebuddy Assistant',
        customAgentId: 'preset-1',
        isPreset: true,
        presetAgentType: 'codebuddy',
      },
      '/tmp/workspace',
      'zh'
    );

    expect(params.type).toBe('acp');
    expect(params.extra.presetContext).toBe('acp preset rules');
    expect(params.extra.backend).toBe('codebuddy');
  });

  it('falls back to gemini-placeholder when no provider configured for gemini (preset)', async () => {
    loadPresetAssistantResources.mockResolvedValue({
      rules: 'gemini preset rules',
      skills: '',
      enabledSkills: [],
    });
    configGet.mockResolvedValue([]); // No providers

    const params = await buildPresetAssistantParams(
      {
        backend: 'gemini',
        name: 'Gemini Assistant',
        customAgentId: 'builtin-gemini',
        isPreset: true,
        presetAgentType: 'gemini',
      },
      '/tmp/workspace',
      'en'
    );

    expect(params.model.id).toBe('gemini-placeholder');
    expect(params.model.platform).toBe('gemini-with-google-auth');
  });

  it('falls back to gemini-placeholder when no provider configured for gemini (CLI)', async () => {
    configGet.mockResolvedValue([]); // No providers

    const params = await buildCliAgentParams(
      {
        backend: 'gemini',
        name: 'Gemini CLI Agent',
      },
      '/tmp/workspace'
    );

    expect(params.type).toBe('gemini');
    expect(params.model.id).toBe('gemini-placeholder');
    expect(params.model.platform).toBe('gemini-with-google-auth');
  });

  it('resolves aionrs model from enabled provider', async () => {
    configGet.mockResolvedValue([
      {
        id: 'provider-1',
        platform: 'openai',
        name: 'Provider',
        baseUrl: 'https://example.com',
        apiKey: 'token',
        model: ['gpt-4.1'],
        enabled: true,
      },
    ]);

    const params = await buildCliAgentParams(
      {
        backend: 'aionrs',
        name: 'Aion CLI Agent',
      },
      '/tmp/workspace'
    );

    expect(params.type).toBe('aionrs');
    expect(params.model.id).toBe('provider-1');
    expect(params.model.useModel).toBe('gpt-4.1');
  });

  it('throws error for aionrs if no provider configured', async () => {
    configGet.mockResolvedValue([]);

    await expect(
      buildCliAgentParams(
        {
          backend: 'aionrs',
          name: 'Aion CLI Agent',
        },
        '/tmp/workspace'
      )
    ).rejects.toThrow('No model provider configured');
  });

  it('sets empty model for ACP backend in buildCliAgentParams', async () => {
    const params = await buildCliAgentParams(
      {
        backend: 'claude',
        name: 'Claude Agent',
      },
      '/tmp/workspace'
    );

    expect(params.type).toBe('acp');
    expect(params.model).toEqual({});
  });

  it('throws error for aionrs if no enabled provider', async () => {
    configGet.mockResolvedValue([{ id: 'p1', enabled: false, model: ['m1'] }]);
    await expect(buildCliAgentParams({ backend: 'aionrs', name: 'Agent' }, '/tmp')).rejects.toThrow(
      'No enabled model provider for Aion CLI'
    );
  });

  it('throws error for gemini if no enabled provider', async () => {
    configGet.mockResolvedValue([{ id: 'p1', enabled: false, model: ['m1'] }]);
    // Note: buildCliAgentParams for gemini uses resolveGeminiModel which catches the error
    const params = await buildCliAgentParams({ backend: 'gemini', name: 'Agent' }, '/tmp');
    expect(params.model.id).toBe('gemini-placeholder');
  });

  it('maps various backends correctly', async () => {
    const backends = [
      { input: 'openclaw', expected: 'openclaw-gateway' },
      { input: 'nanobot', expected: 'nanobot' },
      { input: 'remote', expected: 'remote' },
      { input: 'custom', expected: 'acp' },
    ];

    for (const { input, expected } of backends) {
      const params = await buildCliAgentParams({ backend: input, name: 'Agent' }, '/tmp');
      expect(params.type).toBe(expected);
    }
  });

  it('falls back to first model if none enabled for aionrs', async () => {
    configGet.mockResolvedValue([
      {
        id: 'p1',
        platform: 'openai',
        name: 'P1',
        baseUrl: 'b1',
        apiKey: 'k1',
        model: ['m1', 'm2'],
        enabled: true,
        modelEnabled: { m1: false, m2: false },
      },
    ]);

    const params = await buildCliAgentParams({ backend: 'aionrs', name: 'A' }, '/tmp');
    expect(params.model.useModel).toBe('m1');
  });

  it('handles missing cliPath for acp backend', async () => {
    const params = await buildCliAgentParams({ backend: 'claude', name: 'A' }, '/tmp');
    expect(params.extra.cliPath).toBeUndefined();
  });

  it('sets backend for acp preset assistant', async () => {
    loadPresetAssistantResources.mockResolvedValue({ rules: 'r', skills: '', enabledSkills: [] });
    const params = await buildPresetAssistantParams(
      { backend: 'custom', name: 'A', customAgentId: 'p', isPreset: true, presetAgentType: 'claude' },
      '/tmp',
      'en'
    );
    expect(params.extra.backend).toBe('claude');
  });
});
