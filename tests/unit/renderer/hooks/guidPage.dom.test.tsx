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
  guidInputMock,
  capturedGuidActionRowProps,
  capturedAssistantSelectionAreaProps,
  capturedGuidInputCardProps,
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
    selectedAgent: 'custom',
    selectedAgentKey: 'custom:bare-aionrs',
    selectedAssistantId: 'bare-aionrs',
    selectedAgentInfo: {
      id: 'bare-aionrs',
      custom_agent_id: 'bare-aionrs',
      agent_type: 'aionrs',
      backend: 'aionrs',
      name: 'Aion CLI',
      is_preset: true,
    },
    is_presetAgent: true,
    availableAgents: [],
    assistants: [
      {
        id: 'bare-aionrs',
        source: 'bare',
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
        agent_status: 'available',
        team_selectable: true,
        deletable: false,
      },
    ],
    customAgents: [],
    selectedMode: 'default',
    setSelectedMode: vi.fn(),
    selectedAcpModel: null,
    setSelectedAcpModel: vi.fn(),
    currentAcpCachedModelInfo: null,
    currentEffectiveAgentInfo: {
      agent_type: 'aionrs',
      isFallback: false,
      originalType: 'aionrs',
      isAvailable: true,
    },
    getAgentKey: vi.fn(),
    findAgentByKey: vi.fn(),
    resolvePresetRulesAndSkills: vi.fn(),
    resolvePresetContext: vi.fn(),
    resolvePresetAgentType: vi.fn(() => 'aionrs'),
    resolveEnabledSkills: vi.fn(() => []),
    resolveDisabledBuiltinSkills: vi.fn(() => []),
    isMainAgentAvailable: vi.fn(() => true),
    getEffectiveAgentType: vi.fn(() => ({
      agent_type: 'aionrs',
      isFallback: false,
      originalType: 'aionrs',
      isAvailable: true,
    })),
    refreshCustomAgents: vi.fn(),
    customAgentAvatarMap: new Map(),
    defaultAgentKey: 'custom:bare-aionrs',
    setSelectedAgentKey: vi.fn(),
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
  capturedGuidActionRowProps: [] as Array<Record<string, unknown>>,
  capturedAssistantSelectionAreaProps: [] as Array<Record<string, unknown>>,
  capturedGuidInputCardProps: [] as Array<Record<string, unknown>>,
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
  useLocation: () => ({
    state: null,
    key: 'guid-location',
    pathname: '/guid',
    search: '',
    hash: '',
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listBuiltinAutoSkills: { invoke: vi.fn().mockResolvedValue([]) },
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

vi.mock('@/renderer/pages/guid/hooks/useGuidAgentSelection', () => ({
  useGuidAgentSelection: () => agentSelectionMock,
  resolveAssistantSelectionKey: vi.fn(),
  pickDefaultAssistantSelectionKey: vi.fn(),
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidInput', () => ({
  useGuidInput: () => guidInputMock,
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidSend', () => ({
  useGuidSend: () => sendMock,
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
  resolveGuidAssistantDefaults: () => ({
    disabledBuiltinSkillIds: [],
    skillIds: [],
    mcpIds: [],
  }),
}));

vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr');
  return {
    ...actual,
    default: () => ({ data: null }),
    mutate: vi.fn(),
  };
});

import GuidPage from '@/renderer/pages/guid/GuidPage';

describe('GuidPage', () => {
  beforeEach(() => {
    capturedGuidActionRowProps.length = 0;
    capturedAssistantSelectionAreaProps.length = 0;
    capturedGuidInputCardProps.length = 0;
    agentSelectionMock.assistants = [
      {
        id: 'bare-aionrs',
        source: 'bare',
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
        agent_status: 'available',
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
    expect(latestGuidActionRowProps).not.toHaveProperty('selectedAgentInfo');
    expect(latestGuidActionRowProps).not.toHaveProperty('onClosePresetTag');
    expect(capturedGuidInputCardProps.length).toBeGreaterThan(0);
    expect(latestGuidInputCardProps).not.toHaveProperty('mentionOpen');
    expect(latestGuidInputCardProps).not.toHaveProperty('mentionSelectorBadge');
    expect(latestGuidInputCardProps).not.toHaveProperty('mentionDropdown');
  });

  it('renders example prompts with wrapping text for long assistant suggestions', () => {
    agentSelectionMock.assistants = [
      {
        id: 'bare-aionrs',
        source: 'bare',
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
        agent_status: 'available',
        team_selectable: true,
        deletable: false,
      },
    ];

    render(<GuidPage />);

    const promptButton = screen.getByRole('button', {
      name: /Create a three-page financial dashboard with profit/i,
    });

    expect(promptButton.className).toContain('!whitespace-normal');
    expect(promptButton.className).toContain('!break-words');
  });
});
