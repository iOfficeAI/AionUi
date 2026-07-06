/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/hooks/assistant/useAssistantEditor.ts (A2 in N4a).
 * Tests useAssistantEditor hook: core form state management and save/create/delete flows.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock @/common
vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      get: { invoke: vi.fn() },
      create: { invoke: vi.fn() },
      update: { invoke: vi.fn() },
      delete: { invoke: vi.fn() },
      setState: { invoke: vi.fn() },
    },
    mcpService: {
      listServers: { invoke: vi.fn() },
    },
    fs: {
      readAssistantRule: { invoke: vi.fn() },
      listAvailableSkills: { invoke: vi.fn() },
      writeAssistantRule: { invoke: vi.fn() },
      deleteAssistantRule: { invoke: vi.fn() },
      importSkills: { invoke: vi.fn() },
    },
  },
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en' },
  }),
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('@/renderer/hooks/mcp/catalog', () => ({
  ensureBackendMcpCatalog: vi.fn(async () => ({
    userServers: [{ id: 'mcp-a', name: 'Server A', enabled: true }],
    builtinServers: [],
    allServers: [{ id: 'mcp-a', name: 'Server A', enabled: true }],
  })),
}));

import { useAssistantEditor } from '@/renderer/hooks/assistant/useAssistantEditor';
import { ipcBridge } from '@/common';
import type { AssistantListItem } from '@/renderer/pages/settings/AssistantSettings/types';
import { mutate as swrMutate } from 'swr';

describe('useAssistantEditor', () => {
  const mockAssistantDetail = {
    id: 'a1',
    source: 'user',
    profile: {
      name: 'TestAssistant',
      name_i18n: {},
      description: 'Test desc',
      description_i18n: {},
      avatar: '🤖',
    },
    state: {
      enabled: true,
      sort_order: 1,
    },
    engine: {
      agent_id: 'agent-claude',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
    },
    rules: {
      content: 'Rule content',
      storage_mode: 'user_file',
    },
    prompts: {
      recommended: ['Prompt one', 'Prompt two'],
      recommended_i18n: {},
    },
    defaults: {
      model: { mode: 'fixed', value: 'gemini-2.5-pro' },
      permission: { mode: 'fixed', value: 'acceptEdits' },
      thought_level: { mode: 'fixed', value: 'high' },
      skills: { mode: 'auto', value: ['skill-one'] },
      mcps: { mode: 'fixed', value: ['mcp-a'] },
    },
    capabilities: {
      default_skill_ids: ['skill-one'],
      custom_skill_names: [],
      default_disabled_builtin_skill_ids: [],
    },
    preferences: {
      last_model_id: undefined,
      last_permission_value: undefined,
      last_thought_level_value: undefined,
      last_skill_ids: [],
      last_disabled_builtin_skill_ids: [],
      last_mcp_ids: [],
    },
  } as const;

  const mockMessage = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  } as any;

  const defaultParams = {
    localeKey: 'en',
    activeAssistant: null,
    setActiveAssistantId: vi.fn(),
    loadAssistants: vi.fn(),
    message: mockMessage,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (ipcBridge.assistants.get.invoke as any).mockResolvedValue(mockAssistantDetail);
    (ipcBridge.fs.listAvailableSkills.invoke as any).mockResolvedValue([]);
    (ipcBridge.mcpService.listServers.invoke as any).mockResolvedValue([
      { id: 'mcp-a', name: 'Server A', enabled: true },
    ]);
    (ipcBridge.fs.writeAssistantRule.invoke as any).mockResolvedValue(true);
    (ipcBridge.fs.deleteAssistantRule.invoke as any).mockResolvedValue(true);
    (ipcBridge.fs.importSkills.invoke as any).mockResolvedValue(true);
  });

  it('initializes with default state (no active assistant)', () => {
    const { result } = renderHook(() => useAssistantEditor(defaultParams));

    expect(result.current.editVisible).toBe(false);
    expect(result.current.editName).toBe('');
    expect(result.current.isCreating).toBe(false);
    expect(result.current.defaultModelMode).toBe('auto');
    expect(result.current.defaultPermissionMode).toBe('auto');
    expect((result.current as any).defaultThoughtLevelMode).toBe('auto');
    expect(result.current.defaultMcpMode).toBe('auto');
  });

  it('handles handleEdit to populate form from active assistant', async () => {
    const assistant: AssistantListItem = {
      id: 'a1',
      name: 'TestAssistant',
      description: 'Test desc',
      avatar: '🤖',
      agent_id: 'agent-claude',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
      sort_order: 1,
      source: 'user',
      enabled: true,
    };

    const { result } = renderHook(() => useAssistantEditor(defaultParams));

    await act(async () => {
      await result.current.handleEdit(assistant);
    });

    await waitFor(() => expect(result.current.editVisible).toBe(true));

    expect(result.current.editName).toBe('TestAssistant');
    expect(result.current.editDescription).toBe('Test desc');
    expect(result.current.editAvatar).toBe('🤖');
    expect(result.current.editAgent).toBe('agent-claude');
    expect(result.current.editRecommendedPromptsText).toBe('Prompt one\nPrompt two');
    expect(result.current.defaultModelMode).toBe('fixed');
    expect(result.current.defaultModelValue).toBe('gemini-2.5-pro');
    expect(result.current.defaultPermissionMode).toBe('fixed');
    expect(result.current.defaultPermissionValue).toBe('acceptEdits');
    expect((result.current as any).defaultThoughtLevelMode).toBe('fixed');
    expect((result.current as any).defaultThoughtLevelValue).toBe('high');
    expect(result.current.defaultSkillsMode).toBe('auto');
    expect(result.current.defaultMcpMode).toBe('fixed');
    expect(result.current.selectedMcpIds).toEqual(['mcp-a']);
    expect(result.current.isCreating).toBe(false);
  });

  it('refreshes builtin localized detail when locale changes while editing', async () => {
    const builtinAssistant: AssistantListItem = {
      id: 'builtin-1',
      name: 'Academic Paper',
      name_i18n: { 'en-US': 'Academic Paper', 'zh-CN': '学术论文助手' },
      description: 'English description',
      description_i18n: { 'en-US': 'English description', 'zh-CN': '中文描述' },
      avatar: '📚',
      agent_id: 'agent-claude',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
      sort_order: 1,
      source: 'builtin',
      enabled: true,
    };

    (ipcBridge.assistants.get.invoke as any).mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve({
        ...mockAssistantDetail,
        id: 'builtin-1',
        source: 'builtin',
        profile:
          locale === 'zh-CN'
            ? {
                name: '学术论文助手',
                name_i18n: { 'en-US': 'Academic Paper', 'zh-CN': '学术论文助手' },
                description: '中文描述',
                description_i18n: { 'en-US': 'English description', 'zh-CN': '中文描述' },
                avatar: '📚',
              }
            : {
                name: 'Academic Paper',
                name_i18n: { 'en-US': 'Academic Paper', 'zh-CN': '学术论文助手' },
                description: 'English description',
                description_i18n: { 'en-US': 'English description', 'zh-CN': '中文描述' },
                avatar: '📚',
              },
        rules: {
          content: locale === 'zh-CN' ? '中文规则' : 'English rules',
          storage_mode: 'builtin_asset',
        },
        prompts: {
          recommended: ['English prompt'],
          recommended_i18n: {
            'en-US': ['English prompt'],
            'zh-CN': ['中文提示词'],
          },
        },
      })
    );

    const { result, rerender } = renderHook(
      ({ localeKey, activeAssistant }) =>
        useAssistantEditor({
          ...defaultParams,
          localeKey,
          activeAssistant,
        }),
      {
        initialProps: { localeKey: 'en-US', activeAssistant: builtinAssistant },
      }
    );

    await act(async () => {
      await result.current.handleEdit(builtinAssistant);
    });

    await waitFor(() => expect(result.current.editName).toBe('Academic Paper'));
    expect(result.current.editDescription).toBe('English description');
    expect(result.current.editContext).toBe('English rules');
    expect(result.current.editRecommendedPromptsText).toBe('English prompt');

    rerender({ localeKey: 'zh-CN', activeAssistant: builtinAssistant });

    await waitFor(() => expect(result.current.editName).toBe('学术论文助手'));
    expect(result.current.editDescription).toBe('中文描述');
    expect(result.current.editContext).toBe('中文规则');
    expect(result.current.editRecommendedPromptsText).toBe('中文提示词');
  });

  it('uses localized builtin profile fields when opening the editor', async () => {
    const builtinAssistant: AssistantListItem = {
      id: 'builtin-2',
      name: 'English Dashboard',
      name_i18n: { 'en-US': 'English Dashboard', 'zh-CN': '仪表板助手' },
      description: 'English description',
      description_i18n: { 'en-US': 'English description', 'zh-CN': '中文描述' },
      avatar: '📊',
      agent_id: 'agent-claude',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
      sort_order: 1,
      source: 'builtin',
      enabled: true,
    };

    (ipcBridge.assistants.get.invoke as any).mockResolvedValue({
      ...mockAssistantDetail,
      id: 'builtin-2',
      source: 'builtin',
      profile: {
        name: 'English Dashboard',
        name_i18n: { 'en-US': 'English Dashboard', 'zh-CN': '仪表板助手' },
        description: 'English description',
        description_i18n: { 'en-US': 'English description', 'zh-CN': '中文描述' },
        avatar: '📊',
      },
    });

    const { result } = renderHook(() =>
      useAssistantEditor({
        ...defaultParams,
        localeKey: 'zh-CN',
      })
    );

    await act(async () => {
      await result.current.handleEdit(builtinAssistant);
    });

    await waitFor(() => expect(result.current.editName).toBe('仪表板助手'));
    expect(result.current.editDescription).toBe('中文描述');
  });

  it('calls handleCreate and initializes empty form', async () => {
    const { result } = renderHook(() => useAssistantEditor(defaultParams));

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(result.current.isCreating).toBe(true);
    expect(result.current.editVisible).toBe(true);
    expect(result.current.editName).toBe('');
    expect(result.current.editDescription).toBe('');
    expect(result.current.defaultModelMode).toBe('auto');
    expect(result.current.defaultPermissionMode).toBe('auto');
    expect((result.current as any).defaultThoughtLevelMode).toBe('auto');
    expect(result.current.defaultMcpMode).toBe('auto');
  });

  it('calls handleSave for creating new assistant', async () => {
    (ipcBridge.assistants.create.invoke as any).mockResolvedValue({ id: 'new-id' });

    const loadAssistantsMock = vi.fn();
    const setActiveAssistantIdMock = vi.fn();

    const { result } = renderHook(() =>
      useAssistantEditor({
        ...defaultParams,
        loadAssistants: loadAssistantsMock,
        setActiveAssistantId: setActiveAssistantIdMock,
      })
    );

    act(() => {
      result.current.handleCreate();
      result.current.setEditName('NewAssistant');
      result.current.setEditRecommendedPromptsText('Prompt A\n\nPrompt B');
      result.current.setDefaultModelMode('fixed');
      result.current.setDefaultModelValue('gpt-4.1');
      result.current.setDefaultPermissionMode('fixed');
      result.current.setDefaultPermissionValue('plan');
      (result.current as any).setDefaultThoughtLevelMode('fixed');
      (result.current as any).setDefaultThoughtLevelValue('high');
      result.current.setDefaultSkillsMode('auto');
      result.current.setSelectedSkills(['skill-one']);
      result.current.setDefaultMcpMode('fixed');
      result.current.setSelectedMcpIds(['mcp-a']);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    await waitFor(() => expect(ipcBridge.assistants.create.invoke).toHaveBeenCalled());
    expect(ipcBridge.assistants.create.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        recommended_prompts: ['Prompt A', 'Prompt B'],
        defaults: {
          model: { mode: 'fixed', value: 'gpt-4.1' },
          permission: { mode: 'fixed', value: 'plan' },
          thought_level: { mode: 'fixed', value: 'high' },
          skills: { mode: 'auto', value: ['skill-one'] },
          mcps: { mode: 'fixed', value: ['mcp-a'] },
        },
      })
    );
    expect(mockMessage.success).toHaveBeenCalled();
    expect(loadAssistantsMock).toHaveBeenCalled();
    expect(setActiveAssistantIdMock).toHaveBeenCalledWith('new-id');
    expect(swrMutate).toHaveBeenCalledWith('assistants.list');
    expect(swrMutate).toHaveBeenCalledWith('assistants');
    expect(result.current.editVisible).toBe(false);
  });

  it('calls handleSave for updating existing assistant', async () => {
    const assistant: AssistantListItem = {
      id: 'a1',
      name: 'Existing',
      sort_order: 1,
      source: 'user',
      enabled: true,
    };

    (ipcBridge.assistants.update.invoke as any).mockResolvedValue({ id: 'a1' });

    const loadAssistantsMock = vi.fn();

    const { result } = renderHook(() =>
      useAssistantEditor({
        ...defaultParams,
        loadAssistants: loadAssistantsMock,
        activeAssistant: assistant,
      })
    );

    await act(async () => {
      await result.current.handleEdit(assistant);
    });

    act(() => {
      result.current.setEditName('UpdatedName');
    });

    await act(async () => {
      await result.current.handleSave();
    });

    await waitFor(() => expect(ipcBridge.assistants.update.invoke).toHaveBeenCalled());
    expect(mockMessage.success).toHaveBeenCalled();
    expect(loadAssistantsMock).toHaveBeenCalled();
    expect(swrMutate).toHaveBeenCalledWith('assistants.list');
    expect(swrMutate).toHaveBeenCalledWith('assistants');
    expect(swrMutate).toHaveBeenCalledWith('guid.assistant.detail.a1.en');
  });

  it('clears model and permission defaults when the main agent changes', async () => {
    const assistant: AssistantListItem = {
      id: 'a1',
      name: 'TestAssistant',
      description: 'Test desc',
      avatar: '🤖',
      agent_id: 'agent-claude',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
      sort_order: 1,
      source: 'user',
      enabled: true,
    };

    const { result } = renderHook(() => useAssistantEditor(defaultParams));

    await act(async () => {
      await result.current.handleEdit(assistant);
    });

    expect(result.current.defaultModelMode).toBe('fixed');
    expect(result.current.defaultModelValue).toBe('gemini-2.5-pro');
    expect(result.current.defaultPermissionMode).toBe('fixed');
    expect(result.current.defaultPermissionValue).toBe('acceptEdits');
    expect((result.current as any).defaultThoughtLevelMode).toBe('fixed');
    expect((result.current as any).defaultThoughtLevelValue).toBe('high');

    act(() => {
      result.current.setEditAgent('agent-gemini');
    });

    expect(result.current.editAgent).toBe('agent-gemini');
    expect(result.current.defaultModelMode).toBe('auto');
    expect(result.current.defaultModelValue).toBe('');
    expect(result.current.defaultPermissionMode).toBe('auto');
    expect(result.current.defaultPermissionValue).toBe('');
    expect((result.current as any).defaultThoughtLevelMode).toBe('auto');
    expect((result.current as any).defaultThoughtLevelValue).toBe('');
  });

  it('allows builtin assistants to persist main agent plus default model and permission', async () => {
    const builtinDetail = {
      ...mockAssistantDetail,
      source: 'builtin',
      prompts: {
        recommended: ['Builtin prompt'],
        recommended_i18n: {},
      },
      defaults: {
        model: { mode: 'auto' as const, value: undefined },
        permission: { mode: 'auto' as const, value: undefined },
        thought_level: { mode: 'auto' as const, value: undefined },
        skills: { mode: 'fixed' as const, value: ['skill-one'] },
        mcps: { mode: 'auto' as const, value: [] },
      },
    };
    (ipcBridge.assistants.get.invoke as any).mockResolvedValue(builtinDetail);
    (ipcBridge.assistants.update.invoke as any).mockResolvedValue({ id: 'builtin-1' });

    const assistant: AssistantListItem = {
      id: 'builtin-1',
      name: 'Builtin',
      sort_order: 1,
      source: 'builtin',
      enabled: true,
      agent_id: 'agent-claude',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
    };

    const { result } = renderHook(() =>
      useAssistantEditor({
        ...defaultParams,
        activeAssistant: assistant,
      })
    );

    await act(async () => {
      await result.current.handleEdit(assistant);
    });

    act(() => {
      result.current.setEditAgent('agent-gemini');
      result.current.setDefaultModelMode('fixed');
      result.current.setDefaultModelValue('gemini-2.5-pro');
      result.current.setDefaultPermissionMode('fixed');
      result.current.setDefaultPermissionValue('default');
      (result.current as any).setDefaultThoughtLevelMode('fixed');
      (result.current as any).setDefaultThoughtLevelValue('high');
      result.current.setEditRecommendedPromptsText('Should not be sent');
      result.current.setSelectedSkills(['skill-two']);
      result.current.setSelectedMcpIds(['mcp-b']);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(ipcBridge.assistants.update.invoke).toHaveBeenCalledWith({
      id: 'builtin-1',
      agent_id: 'agent-gemini',
      defaults: {
        model: { mode: 'fixed', value: 'gemini-2.5-pro' },
        permission: { mode: 'fixed', value: 'default' },
        thought_level: { mode: 'fixed', value: 'high' },
      },
    });
  });

  it('loads builtin auto defaults when no fixed values are configured', async () => {
    const builtinDetail = {
      ...mockAssistantDetail,
      source: 'builtin',
      defaults: {
        model: { mode: 'auto' as const, value: undefined },
        permission: { mode: 'auto' as const, value: undefined },
        thought_level: { mode: 'auto' as const, value: undefined },
        skills: { mode: 'fixed' as const, value: ['skill-one'] },
        mcps: { mode: 'auto' as const, value: [] },
      },
    };
    (ipcBridge.assistants.get.invoke as any).mockResolvedValue(builtinDetail);

    const assistant: AssistantListItem = {
      id: 'builtin-1',
      name: 'Builtin',
      sort_order: 1,
      source: 'builtin',
      enabled: true,
      agent_id: 'agent-claude',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
    };

    const { result } = renderHook(() =>
      useAssistantEditor({
        ...defaultParams,
        activeAssistant: assistant,
      })
    );

    await act(async () => {
      await result.current.handleEdit(assistant);
    });

    expect(result.current.defaultModelMode).toBe('auto');
    expect(result.current.defaultModelValue).toBe('');
    expect(result.current.defaultPermissionMode).toBe('auto');
    expect(result.current.defaultPermissionValue).toBe('');
    expect((result.current as any).defaultThoughtLevelMode).toBe('auto');
    expect((result.current as any).defaultThoughtLevelValue).toBe('');
    expect(result.current.defaultMcpMode).toBe('auto');
    expect(result.current.selectedMcpIds).toEqual([]);
  });

  it('optimistically updates and revalidates the shared assistant list when toggling enabled', async () => {
    const assistant: AssistantListItem = {
      id: 'builtin-1',
      name: 'Builtin',
      sort_order: 1,
      source: 'builtin',
      enabled: true,
    };
    (ipcBridge.assistants.setState.invoke as any).mockResolvedValue(undefined);

    const loadAssistantsMock = vi.fn();
    const { result } = renderHook(() =>
      useAssistantEditor({
        ...defaultParams,
        loadAssistants: loadAssistantsMock,
      })
    );

    await act(async () => {
      await result.current.handleToggleEnabled(assistant, false);
    });

    expect(swrMutate).toHaveBeenNthCalledWith(1, 'assistants.list', expect.any(Function), { revalidate: false });
    expect(ipcBridge.assistants.setState.invoke).toHaveBeenCalledWith({ id: 'builtin-1', enabled: false });
    expect(loadAssistantsMock).toHaveBeenCalled();
    expect(swrMutate).toHaveBeenCalledWith('assistants');
    expect(swrMutate).toHaveBeenCalledWith('guid.assistant.detail.builtin-1.en');
  });

  it('revalidates the shared assistant list if toggle enabled fails', async () => {
    const assistant: AssistantListItem = {
      id: 'builtin-1',
      name: 'Builtin',
      sort_order: 1,
      source: 'builtin',
      enabled: true,
    };
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (ipcBridge.assistants.setState.invoke as any).mockRejectedValue(new Error('toggle failed'));

    const { result } = renderHook(() => useAssistantEditor(defaultParams));

    await act(async () => {
      await result.current.handleToggleEnabled(assistant, false);
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(mockMessage.error).toHaveBeenCalled();
    expect(swrMutate).toHaveBeenNthCalledWith(1, 'assistants.list', expect.any(Function), { revalidate: false });
    expect(swrMutate).toHaveBeenCalledWith('assistants');

    consoleErrorSpy.mockRestore();
  });

  it('logs error when save fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (ipcBridge.assistants.create.invoke as any).mockRejectedValue(new Error('Backend error'));

    const { result } = renderHook(() => useAssistantEditor(defaultParams));

    act(() => {
      result.current.handleCreate();
      result.current.setEditName('NewAssistant');
    });

    await act(async () => {
      await result.current.handleSave();
    });

    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
    expect(mockMessage.error).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('shows backend skill import failure detail while saving pending skills', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (ipcBridge.fs.importSkills.invoke as any).mockRejectedValue(
      Object.assign(new Error('wrapped import failure'), {
        name: 'BackendHttpError',
        status: 400,
        code: 'SKILL_IMPORT_FILE_TOO_LARGE',
      })
    );

    const { result } = renderHook(() => useAssistantEditor(defaultParams));

    act(() => {
      result.current.handleCreate();
      result.current.setEditName('NewAssistant');
      result.current.setPendingSkills([{ name: 'huge-skill', path: '/tmp/huge-skill' }]);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(mockMessage.error).toHaveBeenCalledWith('settings.skillsHub.importErrors.SKILL_IMPORT_FILE_TOO_LARGE');
    expect(ipcBridge.assistants.create.invoke).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
