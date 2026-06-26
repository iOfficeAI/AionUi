/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  modelSelectionMock,
  agentSelectionMock,
  locationMock,
  guidInputMock,
  capturedGuidActionRowProps,
  capturedAssistantSelectionAreaProps,
  capturedGuidInputCardProps,
  capturedGuidSendDeps,
  resolveGuidAssistantDefaultsMock,
  sendMock,
} = vi.hoisted(() => ({
  modelSelectionMock: {
    modelList: [],
    isGoogleAuth: false,
    current_model: undefined,
    setCurrentModel: vi.fn(),
    resetCurrentModel: vi.fn(),
  },
  agentSelectionMock: {
    selectedAssistantId: 'bare-aionrs',
    selectedAssistant: {
      id: 'bare-aionrs',
      source: 'generated',
      name: 'Aion CLI',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 10,
      preset_agent_type: 'aionrs',
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
      agent_status: 'online',
      team_selectable: true,
      deletable: false,
    },
    assistants: [
      {
        id: 'bare-aionrs',
        source: 'generated',
        name: 'Aion CLI',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 10,
        preset_agent_type: 'aionrs',
        enabled_skills: [],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: [],
        agent_status: 'online',
        team_selectable: true,
        deletable: false,
      },
    ],
    selectedAssistantBackend: 'aionrs',
    selectedAssistantAvailable: true,
    selectedMode: 'default',
    setSelectedMode: vi.fn(),
    selectedAcpModel: null,
    setSelectedAcpModel: vi.fn(),
    currentAcpCachedModelInfo: null,
    defaultAssistantId: 'bare-aionrs',
    setSelectedAssistantId: vi.fn(),
  },
  guidInputMock: {
    input: '',
    setInput: vi.fn(),
    files: [],
    setFiles: vi.fn(),
    dir: '',
    setDir: vi.fn(),
    loading: false,
    setLoading: vi.fn(),
    isInputFocused: false,
    isFileDragging: false,
    dragHandlers: {},
    onPaste: vi.fn(),
    handleTextareaFocus: vi.fn(),
    handleTextareaBlur: vi.fn(),
    handleFilesUploaded: vi.fn(),
    handleRemoveFile: vi.fn(),
  },
  locationMock: {
    state: null as unknown,
    key: 'guid-location',
    pathname: '/guid',
    search: '',
    hash: '',
  },
  capturedGuidActionRowProps: [] as Array<Record<string, unknown>>,
  capturedAssistantSelectionAreaProps: [] as Array<Record<string, unknown>>,
  capturedGuidInputCardProps: [] as Array<Record<string, unknown>>,
  capturedGuidSendDeps: [] as Array<Record<string, unknown>>,
  resolveGuidAssistantDefaultsMock: vi.fn(() => ({
    disabledBuiltinSkillIds: [],
    skillIds: [],
    mcpIds: [],
  })),
  sendMock: {
    handleSend: vi.fn(),
    sendMessageHandler: vi.fn(),
    isButtonDisabled: false,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; [key: string]: unknown }) => options?.defaultValue || key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => locationMock,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: { invoke: vi.fn().mockResolvedValue([]) },
    },
  },
}));

vi.mock('@/renderer/hooks/mcp/catalog', () => ({
  ensureBackendMcpCatalog: vi.fn().mockResolvedValue({ allServers: [] }),
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: '#000',
    inactiveBorderColor: '#ccc',
    activeShadow: 'none',
  }),
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidModelSelection', () => ({
  useGuidModelSelection: () => modelSelectionMock,
}));

const useGuidAssistantSelectionMock = vi.fn(() => agentSelectionMock);

vi.mock('@/renderer/pages/guid/hooks/useGuidAssistantSelection', () => ({
  useGuidAssistantSelection: (...args: unknown[]) => useGuidAssistantSelectionMock(...args),
  resolveAssistantSelectionKey: vi.fn(),
  pickDefaultAssistantSelectionKey: vi.fn(),
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidInput', () => ({
  useGuidInput: () => guidInputMock,
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidSend', () => ({
  useGuidSend: (deps: Record<string, unknown>) => {
    capturedGuidSendDeps.push(deps);
    return sendMock;
  },
}));

vi.mock('@/renderer/pages/guid/hooks/useTypewriterPlaceholder', () => ({
  useTypewriterPlaceholder: () => '',
}));

vi.mock('@/renderer/pages/guid/components/AssistantSelectionArea', () => ({
  default: (props: Record<string, unknown>) => {
    capturedAssistantSelectionAreaProps.push(props);
    return <div data-testid='assistant-selection-area' />;
  },
}));

vi.mock('@/renderer/pages/guid/components/GuidActionRow', () => ({
  default: (props: Record<string, unknown>) => {
    capturedGuidActionRowProps.push(props);
    return <div data-testid='guid-action-row' />;
  },
}));

vi.mock('@/renderer/pages/guid/components/GuidInputCard', () => ({
  default: (props: Record<string, unknown>) => {
    capturedGuidInputCardProps.push(props);
    return <div data-testid='guid-input-card'>{props.actionRow as React.ReactNode}</div>;
  },
}));

vi.mock('@/renderer/pages/guid/components/GuidModelSelector', () => ({
  default: () => <div data-testid='guid-model-selector' />,
}));

vi.mock('@/renderer/pages/guid/components/QuickActionButtons', () => ({
  default: () => <div data-testid='guid-quick-actions' />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/components/chat/SpeechInputButton', () => ({
  default: () => null,
}));

vi.mock('@/renderer/hooks/system/useLiveTranscriptInsertion', () => ({
  useLiveTranscriptInsertion: () => ({ handleLiveTranscript: vi.fn() }),
}));

vi.mock('@/renderer/hooks/system/useSpeechInput', () => ({
  appendSpeechTranscript: (prev: string, next: string) => `${prev}${next}`,
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: vi.fn(),
  resolveExtensionAssetUrl: vi.fn(),
  resolveBackendAssetUrl: vi.fn((path: string) => path),
}));

vi.mock('@/renderer/pages/guid/utils/assistantDefaults', () => ({
  resolveGuidAssistantDefaults: (...args: unknown[]) => resolveGuidAssistantDefaultsMock(...args),
}));

const swrMock = vi.hoisted(() => ({
  useSWRMock: vi.fn(),
}));

const assistantDetailFixture = {
  prompts: {
    recommended: [],
    recommended_i18n: {
      'en-US': [
        'Create a three-page financial dashboard with profit, revenue mix, and conditional formatting highlights',
      ],
    },
  },
  defaults: {
    model: { mode: 'auto' },
    permission: { mode: 'auto' },
    skills: { mode: 'auto', value: [] },
    mcps: { mode: 'auto', value: [] },
  },
  preferences: {
    last_model_id: null,
    last_permission_value: null,
    last_skill_ids: [],
    last_disabled_builtin_skill_ids: [],
    last_mcp_ids: [],
  },
};

vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr');
  return {
    ...actual,
    default: swrMock.useSWRMock,
    mutate: vi.fn(),
  };
});

import GuidPage from '@/renderer/pages/guid/GuidPage';

describe('GuidPage', () => {
  beforeEach(() => {
    locationMock.state = null;
    swrMock.useSWRMock.mockReturnValue({ data: null });
    capturedGuidActionRowProps.length = 0;
    capturedAssistantSelectionAreaProps.length = 0;
    capturedGuidInputCardProps.length = 0;
    capturedGuidSendDeps.length = 0;
    useGuidAssistantSelectionMock.mockClear();
    resolveGuidAssistantDefaultsMock.mockReturnValue({
      disabledBuiltinSkillIds: [],
      skillIds: [],
      mcpIds: [],
    });
    modelSelectionMock.modelList = [];
    modelSelectionMock.setCurrentModel.mockReset();
    modelSelectionMock.resetCurrentModel.mockReset();
    agentSelectionMock.currentAgentModeOptions = [];
    agentSelectionMock.currentAcpCachedModelInfo = null;
    agentSelectionMock.setSelectedAcpModel.mockReset();
    agentSelectionMock.setSelectedMode.mockReset();
    agentSelectionMock.assistants = [
      {
        id: 'bare-aionrs',
        source: 'generated',
        name: 'Aion CLI',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 10,
        preset_agent_type: 'aionrs',
        enabled_skills: [],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: [],
        agent_status: 'online',
        team_selectable: true,
        deletable: false,
      },
    ];
  });

  it('keeps a generic conversation heading and omits assistant-detail chrome on the home page', () => {
    render(<GuidPage />);

    expect(screen.queryByLabelText('common.back')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Assistant Details')).not.toBeInTheDocument();
    expect(screen.getByText('conversation.welcome.title')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-selection-area')).toBeInTheDocument();
    const latestAssistantSelectionAreaProps = capturedAssistantSelectionAreaProps.at(-1);
    const latestGuidActionRowProps = capturedGuidActionRowProps.at(-1);
    const latestGuidInputCardProps = capturedGuidInputCardProps.at(-1);

    expect(capturedAssistantSelectionAreaProps.length).toBeGreaterThan(0);
    expect(latestAssistantSelectionAreaProps).not.toHaveProperty('is_presetAgent');
    expect(latestAssistantSelectionAreaProps).not.toHaveProperty('selectedAgentInfo');
    expect(capturedGuidActionRowProps.length).toBeGreaterThan(0);
    expect(latestGuidActionRowProps).not.toHaveProperty('hidePresetTag');
    expect(latestGuidActionRowProps).not.toHaveProperty('is_presetAgent');
    expect(latestGuidActionRowProps).not.toHaveProperty('selectedAgent');
    expect(latestGuidActionRowProps).not.toHaveProperty('selectedAgentInfo');
    expect(latestGuidActionRowProps).not.toHaveProperty('onClosePresetTag');
    expect(capturedGuidInputCardProps.length).toBeGreaterThan(0);
    expect(latestGuidInputCardProps).not.toHaveProperty('mentionOpen');
    expect(latestGuidInputCardProps).not.toHaveProperty('mentionSelectorBadge');
    expect(latestGuidInputCardProps).not.toHaveProperty('mentionDropdown');
  });

  it('ignores legacy selectedAgentKey navigation state when preselecting an assistant', () => {
    locationMock.state = {
      selectedAgentKey: 'bare:claude',
    };

    render(<GuidPage />);

    expect(useGuidAssistantSelectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preselectAssistantId: undefined,
      })
    );
  });

  it('renders example prompts with wrapping text for long assistant suggestions', () => {
    agentSelectionMock.assistants = [
      {
        id: 'bare-aionrs',
        source: 'generated',
        name: 'Aion CLI',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 10,
        preset_agent_type: 'aionrs',
        enabled_skills: [],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {
          'en-US': [
            'Create a three-page financial dashboard with profit, revenue mix, and conditional formatting highlights',
          ],
        },
        models: [],
        agent_status: 'online',
        team_selectable: true,
        deletable: false,
      },
    ];

    swrMock.useSWRMock.mockImplementation((key: string | null) => {
      if (key?.startsWith('guid.assistant.detail.')) {
        return {
          data: assistantDetailFixture,
        };
      }
      return { data: null };
    });

    render(<GuidPage />);

    const promptButton = screen.getByRole('button', {
      name: /Create a three-page financial dashboard with profit/i,
    });

    expect(promptButton.className).toContain('!whitespace-normal');
    expect(promptButton.className).toContain('!break-words');
  });

  it('falls back to default instruction prompts when the selected assistant has no recommendations', () => {
    render(<GuidPage />);

    expect(screen.getByRole('button', { name: 'guid.defaultPrompts.capabilities' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'guid.defaultPrompts.skills' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'guid.defaultPrompts.tools' })).toBeInTheDocument();
  });

  it('does not seed skill defaults from the assistant list while detail is loading', async () => {
    agentSelectionMock.assistants = [
      {
        id: 'bare-aionrs',
        source: 'generated',
        name: 'Aion CLI',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 10,
        preset_agent_type: 'aionrs',
        enabled_skills: ['stale-list-skill'],
        custom_skill_names: [],
        disabled_builtin_skills: ['stale-disabled-builtin'],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: [],
        agent_status: 'online',
        team_selectable: true,
        deletable: false,
      },
    ];
    swrMock.useSWRMock.mockReturnValue({ data: null });

    render(<GuidPage />);

    await vi.waitFor(() => {
      const latestDeps = capturedGuidSendDeps.at(-1);
      expect(latestDeps).toMatchObject({
        guidEnabledSkills: undefined,
        guidDisabledBuiltinSkills: undefined,
      });
    });
  });

  it('applies an aionrs assistant default model after provider models load', async () => {
    swrMock.useSWRMock.mockReturnValue({ data: assistantDetailFixture });
    resolveGuidAssistantDefaultsMock.mockReturnValue({
      modelId: 'gpt-4.1',
      disabledBuiltinSkillIds: [],
      skillIds: [],
      mcpIds: [],
    });

    const { rerender } = render(<GuidPage />);

    expect(modelSelectionMock.setCurrentModel).not.toHaveBeenCalled();

    modelSelectionMock.modelList = [
      {
        id: 'provider-openai',
        name: 'OpenAI',
        models: ['gpt-4.1'],
        use_model: 'gpt-4o',
        enabled: true,
      },
    ];

    rerender(<GuidPage />);

    await vi.waitFor(() => {
      expect(modelSelectionMock.setCurrentModel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'provider-openai',
          use_model: 'gpt-4.1',
        }),
        { persistPreference: false }
      );
    });
  });
});
