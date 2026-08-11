/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLocaleKey } from '../../src/common/utils';

const loadPresetAssistantResources = vi.fn();
const configGet = vi.fn();
const getModelConfigInvoke = vi.fn();
const getAvailableAgentsInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getAvailableAgents: {
        invoke: getAvailableAgentsInvoke,
      },
    },
    mode: {
      getModelConfig: {
        invoke: getModelConfigInvoke,
      },
    },
  },
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

const { buildPresetAssistantParams, buildCliAgentParams, applyWorkspaceConversationConfigDefaults } =
  await import('../../src/renderer/pages/conversation/utils/createConversationParams');

describe('createConversationParams', () => {
  beforeEach(() => {
    loadPresetAssistantResources.mockReset();
    configGet.mockReset();
    getModelConfigInvoke.mockReset();
    getAvailableAgentsInvoke.mockReset();
  });

  it('uses the shared locale resolver for Turkish', async () => {
    loadPresetAssistantResources.mockResolvedValue({
      rules: 'preset rules',
      skills: '',
      enabledSkills: ['moltbook'],
    });
    getModelConfigInvoke.mockResolvedValue([
      {
        id: 'provider-1',
        platform: 'openai',
        name: 'Provider',
        baseUrl: 'https://example.com',
        apiKey: 'token',
        requestIntervalMs: 1500,
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

  it('routes codex preset assistants through native codex when the detected codex agent is native', async () => {
    loadPresetAssistantResources.mockResolvedValue({
      rules: 'codex preset rules',
      skills: '',
      enabledSkills: ['reviewer'],
    });
    getAvailableAgentsInvoke.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'codex',
          backend: 'codex',
          kind: 'codex',
          name: 'Codex',
          cliPath: '/native/codex',
        },
      ],
    });

    const params = await buildPresetAssistantParams(
      {
        backend: 'custom',
        name: 'Codex Preset',
        customAgentId: 'preset-codex',
        isPreset: true,
        presetAgentType: 'codex',
      },
      '/tmp/workspace',
      'en'
    );

    expect(params.type).toBe('codex');
    expect(params.extra).toEqual(
      expect.objectContaining({
        workspace: '/tmp/workspace',
        codexNative: true,
        cliPath: '/native/codex',
        presetAssistantId: 'preset-codex',
        presetContext: 'codex preset rules',
        enabledSkills: ['reviewer'],
      })
    );
    expect(params.extra.backend).toBeUndefined();
  });

  it('falls back to gemini-placeholder when no provider configured for gemini (preset)', async () => {
    loadPresetAssistantResources.mockResolvedValue({
      rules: 'gemini preset rules',
      skills: '',
      enabledSkills: [],
    });
    getModelConfigInvoke.mockResolvedValue([]); // No providers

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
    getModelConfigInvoke.mockResolvedValue([]); // No providers

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
    getModelConfigInvoke.mockResolvedValue([
      {
        id: 'provider-1',
        platform: 'openai',
        name: 'Provider',
        baseUrl: 'https://example.com',
        apiKey: 'token',
        requestIntervalMs: 1500,
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
    expect(params.model.requestIntervalMs).toBe(1500);
  });

  it('hydrates preferred aionrs reasoning effort for new workspace conversations', async () => {
    getModelConfigInvoke.mockResolvedValue([
      {
        id: 'provider-1',
        platform: 'chatgpt',
        name: 'ChatGPT',
        baseUrl: 'https://chatgpt.com/backend-api/codex',
        apiKey: '',
        model: ['gpt-5.5'],
        enabled: true,
      },
    ]);
    configGet.mockImplementation(async (key: string) => {
      if (key === 'aionrs.config') {
        return {
          preferredMode: 'auto_edit',
          preferredConfigOptions: {
            reasoning_effort: 'high',
          },
        };
      }
      return undefined;
    });

    const params = await buildCliAgentParams(
      {
        backend: 'aionrs',
        name: 'Aion CLI Agent',
      },
      '/tmp/workspace'
    );

    expect(params.extra.sessionMode).toBe('auto_edit');
    expect(params.extra.reasoningEffort).toBe('high');
  });

  it('prefers the saved aionrs default provider and model when still available', async () => {
    getModelConfigInvoke.mockResolvedValue([
      {
        id: 'provider-1',
        platform: 'openai',
        name: 'Provider One',
        baseUrl: 'https://example.com',
        apiKey: 'token-1',
        model: ['gpt-4.1'],
        enabled: true,
      },
      {
        id: 'provider-2',
        platform: 'copilot',
        name: 'GitHub Copilot',
        baseUrl: 'https://api.githubcopilot.com',
        apiKey: '',
        model: ['claude-sonnet-4', 'gpt-4o'],
        enabled: true,
      },
    ]);
    configGet.mockImplementation(async (key: string) => {
      if (key === 'aionrs.defaultModel') {
        return { id: 'provider-2', useModel: 'claude-sonnet-4' };
      }
      return undefined;
    });

    const params = await buildCliAgentParams(
      {
        backend: 'aionrs',
        name: 'Aion CLI Agent',
      },
      '/tmp/workspace'
    );

    expect(params.model.id).toBe('provider-2');
    expect(params.model.platform).toBe('copilot');
    expect(params.model.useModel).toBe('claude-sonnet-4');
  });

  it('repairs typoed saved aionrs default models when a close configured model exists', async () => {
    getModelConfigInvoke.mockResolvedValue([
      {
        id: 'provider-1',
        platform: 'custom',
        name: 'Ollama',
        baseUrl: 'https://ollama.com/v1',
        apiKey: 'token',
        model: ['glm-4.6', 'glm-5.1'],
        enabled: true,
      },
    ]);
    configGet.mockImplementation(async (key: string) => {
      if (key === 'aionrs.defaultModel') {
        return { id: 'provider-1', useModel: 'gml-4.6' };
      }
      return undefined;
    });

    const params = await buildCliAgentParams(
      {
        backend: 'aionrs',
        name: 'Aion CLI Agent',
      },
      '/tmp/workspace'
    );

    expect(params.model.useModel).toBe('glm-4.6');
  });

  it('throws error for aionrs if no provider configured', async () => {
    getModelConfigInvoke.mockResolvedValue([]);

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

  it('reuses the saved Codex mode without reusing a stale saved model for workspace conversations', async () => {
    configGet.mockImplementation(async (key: string) => {
      if (key === 'acp.config') {
        return {
          codex: {
            preferredMode: 'yolo',
            preferredModelId: 'gpt-5-codex',
          },
        };
      }
      return undefined;
    });

    const params = await buildCliAgentParams(
      {
        backend: 'codex',
        name: 'Codex Agent',
      },
      '/tmp/workspace'
    );

    expect(params.extra.sessionMode).toBe('yolo');
    expect(params.extra.currentModelId).toBeUndefined();
  });

  it('hydrates cached ACP config options for new workspace conversations', async () => {
    configGet.mockImplementation(async (key: string) => {
      if (key === 'acp.config') {
        return {
          codex: {
            preferredConfigOptions: {
              reasoning_effort: 'high',
            },
          },
        };
      }
      if (key === 'acp.cachedConfigOptions') {
        return {
          codex: [
            {
              id: 'reasoning_effort',
              category: 'reasoning',
              type: 'select',
              currentValue: 'medium',
              options: [
                { value: 'medium', name: 'Medium' },
                { value: 'high', name: 'High' },
              ],
            },
          ],
        };
      }
      return undefined;
    });

    const params = await buildCliAgentParams(
      {
        backend: 'codex',
        name: 'Codex Agent',
      },
      '/tmp/workspace'
    );

    expect(params.extra.configOptionValues).toEqual({
      reasoning_effort: 'high',
    });
    expect(params.extra.cachedConfigOptions).toEqual([
      expect.objectContaining({
        id: 'reasoning_effort',
        currentValue: 'high',
        selectedValue: 'high',
      }),
    ]);
  });

  it('inherits ACP config options from the active workspace conversation over global defaults', () => {
    const params = {
      type: 'acp',
      model: {},
      name: 'New Chat',
      extra: {
        workspace: '/tmp/workspace',
        customWorkspace: true,
        backend: 'codex',
        configOptionValues: {
          reasoning_effort: 'xhigh',
        },
        cachedConfigOptions: [
          {
            id: 'reasoning_effort',
            category: 'reasoning',
            type: 'select',
            currentValue: 'xhigh',
            selectedValue: 'xhigh',
          },
        ],
      },
    } as any;
    const sourceConversation = {
      id: 'conv-active',
      type: 'acp',
      extra: {
        workspace: '/tmp/workspace',
        customWorkspace: true,
        backend: 'codex',
        configOptionValues: {
          reasoning_effort: 'high',
        },
        cachedConfigOptions: [
          {
            id: 'reasoning_effort',
            category: 'reasoning',
            type: 'select',
            currentValue: 'medium',
            selectedValue: 'medium',
          },
        ],
        pendingConfigOptions: {
          reasoning_effort: 'xhigh',
        },
      },
    } as any;

    const next = applyWorkspaceConversationConfigDefaults(params, sourceConversation, 'codex');

    expect(next.extra.configOptionValues).toEqual({
      reasoning_effort: 'medium',
    });
    expect(next.extra.cachedConfigOptions).toEqual([
      expect.objectContaining({
        id: 'reasoning_effort',
        currentValue: 'medium',
        selectedValue: 'medium',
      }),
    ]);
    expect(next.extra.pendingConfigOptions).toBeUndefined();
  });

  it('inherits native Codex config options from the active workspace conversation', () => {
    const params = {
      type: 'codex',
      model: {},
      name: 'New Codex Chat',
      extra: {
        workspace: '/tmp/workspace',
        customWorkspace: true,
        codexNative: true,
        configOptionValues: {
          reasoning_effort: 'medium',
        },
      },
    } as any;
    const sourceConversation = {
      id: 'conv-active',
      type: 'codex',
      extra: {
        workspace: '/tmp/workspace',
        customWorkspace: true,
        codexNative: true,
        configOptionValues: {
          reasoning_effort: 'high',
        },
        cachedConfigOptions: [
          {
            id: 'reasoning_effort',
            category: 'reasoning',
            type: 'select',
            currentValue: 'high',
            selectedValue: 'high',
          },
        ],
        pendingConfigOptions: {
          reasoning_effort: 'xhigh',
        },
      },
    } as any;

    const next = applyWorkspaceConversationConfigDefaults(params, sourceConversation, 'codex');

    expect(next.extra.configOptionValues).toEqual({
      reasoning_effort: 'high',
    });
    expect(next.extra.cachedConfigOptions).toEqual([
      expect.objectContaining({
        id: 'reasoning_effort',
        currentValue: 'high',
        selectedValue: 'high',
      }),
    ]);
    expect(next.extra.pendingConfigOptions).toBeUndefined();
  });

  it('does not inherit workspace config options from a different ACP backend', () => {
    const params = {
      type: 'acp',
      model: {},
      name: 'New Chat',
      extra: {
        workspace: '/tmp/workspace',
        customWorkspace: true,
        backend: 'codex',
        configOptionValues: {
          reasoning_effort: 'xhigh',
        },
      },
    } as any;
    const sourceConversation = {
      id: 'conv-active',
      type: 'acp',
      extra: {
        workspace: '/tmp/workspace',
        customWorkspace: true,
        backend: 'qwen',
        configOptionValues: {
          reasoning_effort: 'medium',
        },
      },
    } as any;

    const next = applyWorkspaceConversationConfigDefaults(params, sourceConversation, 'codex');

    expect(next).toBe(params);
  });

  it('inherits aionrs reasoning effort and mode from the active workspace conversation', () => {
    const params = {
      type: 'aionrs',
      model: {},
      name: 'New Chat',
      extra: {
        workspace: '/tmp/workspace',
        customWorkspace: true,
        sessionMode: 'default',
        reasoningEffort: 'medium',
      },
    } as any;
    const sourceConversation = {
      id: 'conv-active',
      type: 'aionrs',
      extra: {
        workspace: '/tmp/workspace',
        customWorkspace: true,
        sessionMode: 'yolo',
        reasoningEffort: 'high',
      },
    } as any;

    const next = applyWorkspaceConversationConfigDefaults(params, sourceConversation, 'aionrs');

    expect(next.extra.sessionMode).toBe('yolo');
    expect(next.extra.reasoningEffort).toBe('high');
  });

  it('falls back to legacy yolo mode when preferred ACP mode is missing', async () => {
    configGet.mockImplementation(async (key: string) => {
      if (key === 'acp.config') {
        return {
          claude: {
            yoloMode: true,
          },
        };
      }
      return undefined;
    });

    const params = await buildCliAgentParams(
      {
        backend: 'claude',
        name: 'Claude Agent',
      },
      '/tmp/workspace'
    );

    expect(params.extra.sessionMode).toBe('bypassPermissions');
  });

  it('reuses the effective preset backend mode and model for ACP preset assistants', async () => {
    loadPresetAssistantResources.mockResolvedValue({ rules: 'r', skills: '', enabledSkills: [] });
    configGet.mockImplementation(async (key: string) => {
      if (key === 'acp.config') {
        return {
          claude: {
            preferredMode: 'acceptEdits',
            preferredModelId: 'claude-sonnet-4-5',
          },
        };
      }
      return undefined;
    });

    const params = await buildPresetAssistantParams(
      { backend: 'custom', name: 'A', customAgentId: 'p', isPreset: true, presetAgentType: 'claude' },
      '/tmp',
      'en'
    );

    expect(params.extra.backend).toBe('claude');
    expect(params.extra.sessionMode).toBe('acceptEdits');
    expect(params.extra.currentModelId).toBe('claude-sonnet-4-5');
  });

  it('hydrates cached ACP config options for ACP preset assistants', async () => {
    loadPresetAssistantResources.mockResolvedValue({ rules: 'r', skills: '', enabledSkills: [] });
    configGet.mockImplementation(async (key: string) => {
      if (key === 'acp.config') {
        return {
          claude: {
            preferredConfigOptions: {
              output_style: 'concise',
            },
          },
        };
      }
      if (key === 'acp.cachedConfigOptions') {
        return {
          claude: [
            {
              id: 'output_style',
              category: 'reasoning',
              type: 'select',
              currentValue: 'default',
              options: [
                { value: 'default', name: 'Default' },
                { value: 'concise', name: 'Concise' },
              ],
            },
          ],
        };
      }
      return undefined;
    });

    const params = await buildPresetAssistantParams(
      { backend: 'custom', name: 'A', customAgentId: 'p', isPreset: true, presetAgentType: 'claude' },
      '/tmp',
      'en'
    );

    expect(params.extra.configOptionValues).toEqual({
      output_style: 'concise',
    });
    expect(params.extra.cachedConfigOptions).toEqual([
      expect.objectContaining({
        id: 'output_style',
        currentValue: 'concise',
        selectedValue: 'concise',
      }),
    ]);
  });

  it('does not fall back to a cached/default Codex model for direct Codex conversations', async () => {
    configGet.mockImplementation(async (key: string) => {
      if (key === 'acp.config') {
        return { codex: { preferredModelId: 'stale-codex-model' } };
      }
      if (key === 'acp.cachedModels') {
        return { codex: { currentModelId: 'stale-cached-model' } };
      }
      return undefined;
    });

    const params = await buildCliAgentParams(
      {
        backend: 'codex',
        name: 'Codex Agent',
      },
      '/tmp/workspace'
    );

    expect(params.extra.currentModelId).toBeUndefined();
  });

  it('throws error for aionrs if no enabled provider', async () => {
    getModelConfigInvoke.mockResolvedValue([{ id: 'p1', enabled: false, model: ['m1'] }]);
    await expect(buildCliAgentParams({ backend: 'aionrs', name: 'Agent' }, '/tmp')).rejects.toThrow(
      'No enabled model provider for Aion CLI'
    );
  });

  it('throws error for gemini if no enabled provider', async () => {
    getModelConfigInvoke.mockResolvedValue([{ id: 'p1', enabled: false, model: ['m1'] }]);
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
    getModelConfigInvoke.mockResolvedValue([
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
