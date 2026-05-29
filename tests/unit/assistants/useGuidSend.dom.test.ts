// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { TProviderWithModel } from '@/common/config/storage';
import type { AvailableAgent } from '@/renderer/pages/guid/types';

const { conversationCreateInvoke, messageWarning, navigateMock, emitterEmit, updateWorkspaceTimeMock, configGetMock } =
  vi.hoisted(() => ({
    conversationCreateInvoke: vi.fn(),
    messageWarning: vi.fn(),
    navigateMock: vi.fn(),
    emitterEmit: vi.fn(),
    updateWorkspaceTimeMock: vi.fn(),
    configGetMock: vi.fn(() => undefined),
  }));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      create: { invoke: conversationCreateInvoke },
    },
  },
}));

vi.mock('@/renderer/hooks/context/NewApiAccountContext', () => ({
  useNewApiAccount: () => ({ isLoggedIn: true }),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: emitterEmit },
}));

vi.mock('@/renderer/utils/workspace/workspaceHistory', () => ({
  updateWorkspaceTime: updateWorkspaceTimeMock,
}));

vi.mock('@/common/config/configService', () => ({
  configService: { get: configGetMock },
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      ...actual.Message,
      warning: messageWarning,
    },
  };
});

import { useGuidSend } from '@/renderer/pages/guid/hooks/useGuidSend';

describe('useGuidSend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversationCreateInvoke.mockResolvedValue({ id: 'conv-ozon-1' });
    sessionStorage.clear();
  });

  it('normalizes managed Claude fallback model to runtime slot id when user has not manually switched', async () => {
    const claudeAgent: AvailableAgent = {
      agent_type: 'acp',
      backend: 'claude',
      name: 'Claude Code',
      id: 'claude-row',
      is_preset: false,
    };

    const { result } = renderHook(() =>
      useGuidSend({
        input: 'Reply with exactly: smoke-claude',
        setInput: vi.fn(),
        files: [],
        setFiles: vi.fn(),
        dir: '',
        setDir: vi.fn(),
        setLoading: vi.fn(),
        loading: false,
        selectedAgent: 'claude',
        selectedAgentKey: 'claude',
        selectedAgentInfo: claudeAgent,
        is_presetAgent: false,
        selectedMode: 'default',
        selectedAcpModel: null,
        currentAcpCachedModelInfo: {
          current_model_id: 'MiniMax-M2.7-highspeed',
          current_model_label: 'MiniMax-M2.7-highspeed',
          available_models: [{ id: 'MiniMax-M2.7-highspeed', label: 'MiniMax-M2.7-highspeed' }],
        },
        current_model: {} as TProviderWithModel,
        findAgentByKey: vi.fn(() => claudeAgent),
        getEffectiveAgentType: vi.fn(() => ({
          agent_type: 'acp',
          isFallback: false,
          originalType: 'acp',
          isAvailable: true,
        })),
        resolvePresetRulesAndSkills: vi.fn(async () => ({ rules: undefined, skills: undefined })),
        resolveEnabledSkills: vi.fn(() => undefined),
        resolveDisabledBuiltinSkills: vi.fn(() => undefined),
        guidDisabledBuiltinSkills: undefined,
        guidEnabledSkills: undefined,
        currentEffectiveAgentInfo: {
          agent_type: 'acp',
          isFallback: false,
          originalType: 'acp',
          isAvailable: true,
        },
        isGoogleAuth: false,
        setMentionOpen: vi.fn(),
        setMentionQuery: vi.fn(),
        setMentionSelectorOpen: vi.fn(),
        setMentionActiveIndex: vi.fn(),
        navigate: navigateMock,
        closeAllTabs: vi.fn(),
        openTab: vi.fn(),
        t: ((key: string) => key) as any,
      })
    );

    await act(async () => {
      await result.current.handleSend();
    });

    expect(conversationCreateInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        extra: expect.objectContaining({
          current_model_id: 'MiniMax-M2.7-highspeed',
        }),
      })
    );
  });

  it('sends preset assistant enabled skills through aionrs conversation create params', async () => {
    const currentModel = {
      id: 'provider-1',
      name: 'POUNDING API',
      platform: 'openai',
      use_model: 'mimo-v2.5',
    } as TProviderWithModel;

    const presetAgent: AvailableAgent = {
      agent_type: 'aionrs',
      name: 'Ozon Assistants',
      custom_agent_id: 'ozon-assistants',
      id: 'ozon-assistants',
      is_preset: true,
    };

    const { result } = renderHook(() =>
      useGuidSend({
        input: '帮我上架这个商品',
        setInput: vi.fn(),
        files: [],
        setFiles: vi.fn(),
        dir: '',
        setDir: vi.fn(),
        setLoading: vi.fn(),
        loading: false,
        selectedAgent: 'aionrs',
        selectedAgentKey: 'ozon-assistants',
        selectedAgentInfo: presetAgent,
        is_presetAgent: true,
        selectedMode: 'default',
        selectedAcpModel: null,
        currentAcpCachedModelInfo: null,
        current_model: currentModel,
        findAgentByKey: vi.fn(() => presetAgent),
        getEffectiveAgentType: vi.fn(() => ({
          agent_type: 'aionrs',
          isFallback: false,
          originalType: 'aionrs',
          isAvailable: true,
        })),
        resolvePresetRulesAndSkills: vi.fn(async () => ({ rules: 'preset ozon rules', skills: 'skill body' })),
        resolveEnabledSkills: vi.fn(() => ['pounding-ozon']),
        resolveDisabledBuiltinSkills: vi.fn(() => undefined),
        guidDisabledBuiltinSkills: undefined,
        guidEnabledSkills: undefined,
        currentEffectiveAgentInfo: {
          agent_type: 'aionrs',
          isFallback: false,
          originalType: 'aionrs',
          isAvailable: true,
        },
        isGoogleAuth: false,
        setMentionOpen: vi.fn(),
        setMentionQuery: vi.fn(),
        setMentionSelectorOpen: vi.fn(),
        setMentionActiveIndex: vi.fn(),
        navigate: navigateMock,
        closeAllTabs: vi.fn(),
        openTab: vi.fn(),
        t: ((key: string) => key) as any,
      })
    );

    await act(async () => {
      await result.current.handleSend();
    });

    expect(conversationCreateInvoke).toHaveBeenCalledTimes(1);
    expect(conversationCreateInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'aionrs',
        extra: expect.objectContaining({
          preset_rules: 'preset ozon rules',
          preset_enabled_skills: ['pounding-ozon'],
          preset_assistant_id: 'ozon-assistants',
        }),
      })
    );
    expect(navigateMock).toHaveBeenCalledWith('/conversation/conv-ozon-1');
  });
});
