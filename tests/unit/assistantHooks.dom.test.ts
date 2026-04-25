/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '../../src/common/types/assistantTypes';

// ─────────────────────────────────────────────────────────────────────────────
// ipcBridge mock — exposes `assistants.*`, `fs.*`, and `acpConversation.*`
// needed by the hooks under test.
// ─────────────────────────────────────────────────────────────────────────────

const assistantsListInvoke = vi.fn<() => Promise<Assistant[]>>().mockResolvedValue([]);
const assistantsCreateInvoke = vi.fn();
const assistantsUpdateInvoke = vi.fn();
const assistantsDeleteInvoke = vi.fn();
const assistantsSetStateInvoke = vi.fn();
const assistantsImportInvoke = vi.fn();

const readAssistantRuleInvoke = vi.fn().mockResolvedValue('');
const readAssistantSkillInvoke = vi.fn().mockResolvedValue('');
const writeAssistantRuleInvoke = vi.fn().mockResolvedValue(true);
const listAvailableSkillsInvoke = vi.fn().mockResolvedValue([]);
const listBuiltinAutoSkillsInvoke = vi.fn().mockResolvedValue([]);
const detectAndCountExternalSkillsInvoke = vi.fn().mockResolvedValue([]);
const addCustomExternalPathInvoke = vi.fn().mockResolvedValue(undefined);

const getAvailableAgentsInvoke = vi.fn().mockResolvedValue([]);
const refreshCustomAgentsInvoke = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/common', () => ({
  ipcBridge: {
    assistants: {
      list: { invoke: (...args: unknown[]) => assistantsListInvoke(...(args as [])) },
      create: { invoke: (...args: unknown[]) => assistantsCreateInvoke(...args) },
      update: { invoke: (...args: unknown[]) => assistantsUpdateInvoke(...args) },
      delete: { invoke: (...args: unknown[]) => assistantsDeleteInvoke(...args) },
      setState: { invoke: (...args: unknown[]) => assistantsSetStateInvoke(...args) },
      import: { invoke: (...args: unknown[]) => assistantsImportInvoke(...args) },
    },
    fs: {
      readAssistantRule: { invoke: (...args: unknown[]) => readAssistantRuleInvoke(...args) },
      readAssistantSkill: { invoke: (...args: unknown[]) => readAssistantSkillInvoke(...args) },
      writeAssistantRule: { invoke: (...args: unknown[]) => writeAssistantRuleInvoke(...args) },
      listAvailableSkills: { invoke: (...args: unknown[]) => listAvailableSkillsInvoke(...args) },
      listBuiltinAutoSkills: { invoke: (...args: unknown[]) => listBuiltinAutoSkillsInvoke(...args) },
      detectAndCountExternalSkills: {
        invoke: (...args: unknown[]) => detectAndCountExternalSkillsInvoke(...args),
      },
      addCustomExternalPath: { invoke: (...args: unknown[]) => addCustomExternalPathInvoke(...args) },
    },
    acpConversation: {
      getAvailableAgents: { invoke: (...args: unknown[]) => getAvailableAgentsInvoke(...args) },
      refreshCustomAgents: { invoke: (...args: unknown[]) => refreshCustomAgentsInvoke(...args) },
    },
  },
}));

// SWR stub — captures fetchers so specific tests can invoke them directly.
const swrFetchers = new Map<string, () => unknown>();

vi.mock('swr', () => {
  const swrDefault = vi.fn((key: string, fetcher: () => unknown) => {
    swrFetchers.set(key, fetcher);
    return { data: undefined, error: undefined, isLoading: false };
  });
  return {
    default: swrDefault,
    __esModule: true,
    mutate: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.defaultValue as string) ?? key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('../../src/common/utils', () => ({
  resolveLocaleKey: (lang: string) => lang,
}));

vi.mock('../../src/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: (url: string) => url,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import { useAssistantList } from '../../src/renderer/hooks/assistant/useAssistantList';
import { useDetectedAgents } from '../../src/renderer/hooks/assistant/useDetectedAgents';
import { useAssistantEditor } from '../../src/renderer/hooks/assistant/useAssistantEditor';
import { useAssistantSkills } from '../../src/renderer/hooks/assistant/useAssistantSkills';
import type {
  ExternalSource,
  PendingSkill,
  SkillInfo,
} from '../../src/renderer/pages/settings/AssistantSettings/types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeAssistant(overrides: Partial<Assistant> & { id: string; name: string }): Assistant {
  return {
    id: overrides.id,
    name: overrides.name,
    source: 'user',
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    preset_agent_type: 'gemini',
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    ...overrides,
  };
}

function makeMessage() {
  return {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    normal: vi.fn(),
    clear: vi.fn(),
  };
}

const extensionCheck = (a: Assistant | null | undefined): boolean => a?.source === 'extension';

// ─────────────────────────────────────────────────────────────────────────────
// useAssistantList
// ─────────────────────────────────────────────────────────────────────────────

describe('useAssistantList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assistantsListInvoke.mockResolvedValue([]);
  });

  it('loads from ipcBridge.assistants.list and populates the list sorted by sort_order', async () => {
    assistantsListInvoke.mockResolvedValue([
      makeAssistant({ id: 'b', name: 'B', sort_order: 2 }),
      makeAssistant({ id: 'a', name: 'A', sort_order: 0, source: 'builtin' }),
      makeAssistant({ id: 'c', name: 'C', sort_order: 1 }),
    ]);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.assistants.length).toBe(3);
    });

    expect(result.current.assistants.map((a) => a.id)).toEqual(['a', 'c', 'b']);
    expect(assistantsListInvoke).toHaveBeenCalledTimes(1);
  });

  it('defaults activeAssistantId to the first assistant after load', async () => {
    assistantsListInvoke.mockResolvedValue([
      makeAssistant({ id: 'first', name: 'First', sort_order: 0 }),
      makeAssistant({ id: 'second', name: 'Second', sort_order: 1 }),
    ]);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.activeAssistantId).toBe('first');
    });
    expect(result.current.activeAssistant?.id).toBe('first');
  });

  it('preserves activeAssistantId across reloads when the id still exists', async () => {
    assistantsListInvoke.mockResolvedValue([
      makeAssistant({ id: 'one', name: 'One', sort_order: 0 }),
      makeAssistant({ id: 'two', name: 'Two', sort_order: 1 }),
    ]);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.assistants.length).toBe(2);
    });

    act(() => {
      result.current.setActiveAssistantId('two');
    });

    await act(async () => {
      await result.current.loadAssistants();
    });

    expect(result.current.activeAssistantId).toBe('two');
  });

  it('falls back to the first assistant when the active id disappears on reload', async () => {
    assistantsListInvoke.mockResolvedValueOnce([makeAssistant({ id: 'old', name: 'Old', sort_order: 0 })]);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.activeAssistantId).toBe('old');
    });

    // Second load returns a different set.
    assistantsListInvoke.mockResolvedValueOnce([makeAssistant({ id: 'fresh', name: 'Fresh', sort_order: 0 })]);
    await act(async () => {
      await result.current.loadAssistants();
    });

    expect(result.current.activeAssistantId).toBe('fresh');
  });

  it('identifies extension-sourced assistants via isExtensionAssistant', async () => {
    const { result } = renderHook(() => useAssistantList());

    expect(result.current.isExtensionAssistant(makeAssistant({ id: 'ext', name: 'Ext', source: 'extension' }))).toBe(
      true
    );
    expect(result.current.isExtensionAssistant(makeAssistant({ id: 'custom', name: 'C', source: 'user' }))).toBe(false);
    expect(result.current.isExtensionAssistant(makeAssistant({ id: 'b', name: 'B', source: 'builtin' }))).toBe(false);
    expect(result.current.isExtensionAssistant(null)).toBe(false);
    expect(result.current.isExtensionAssistant(undefined)).toBe(false);
  });

  it('logs and keeps an empty list when the backend call fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    assistantsListInvoke.mockRejectedValue(new Error('backend down'));

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    expect(result.current.assistants).toEqual([]);
    expect(result.current.activeAssistantId).toBeNull();
    consoleSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useAssistantEditor — CRUD + source-based gating
// ─────────────────────────────────────────────────────────────────────────────

describe('useAssistantEditor', () => {
  const setActiveAssistantId = vi.fn();
  const loadAssistants = vi.fn().mockResolvedValue(undefined);
  const refreshAgentDetection = vi.fn().mockResolvedValue(undefined);

  function baseParams(activeAssistant: Assistant | null) {
    return {
      localeKey: 'en-US',
      activeAssistant,
      isExtensionAssistant: extensionCheck,
      setActiveAssistantId,
      loadAssistants,
      refreshAgentDetection,
      message: makeMessage() as unknown as Parameters<typeof useAssistantEditor>[0]['message'],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    listAvailableSkillsInvoke.mockResolvedValue([]);
    listBuiltinAutoSkillsInvoke.mockResolvedValue([]);
    readAssistantRuleInvoke.mockResolvedValue('');
    readAssistantSkillInvoke.mockResolvedValue('');
    writeAssistantRuleInvoke.mockResolvedValue(true);
  });

  it('handleCreate prefills empty edit state and opens the drawer', async () => {
    const { result } = renderHook(() => useAssistantEditor(baseParams(null)));

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(result.current.isCreating).toBe(true);
    expect(result.current.editVisible).toBe(true);
    expect(result.current.editName).toBe('');
    expect(result.current.editAgent).toBe('gemini');
    expect(listAvailableSkillsInvoke).toHaveBeenCalled();
    expect(listBuiltinAutoSkillsInvoke).toHaveBeenCalled();
  });

  it('handleSave in create mode calls assistants.create and reloads the list', async () => {
    const params = baseParams(null);
    const { result } = renderHook(() => useAssistantEditor(params));

    await act(async () => {
      await result.current.handleCreate();
    });

    act(() => {
      result.current.setEditName('My Helper');
      result.current.setEditDescription('test');
      result.current.setEditContext('rule body');
    });

    assistantsCreateInvoke.mockResolvedValue(makeAssistant({ id: 'new-assistant', name: 'My Helper' }));

    await act(async () => {
      await result.current.handleSave();
    });

    expect(assistantsCreateInvoke).toHaveBeenCalledTimes(1);
    expect(assistantsCreateInvoke.mock.calls[0][0]).toMatchObject({
      name: 'My Helper',
      description: 'test',
      preset_agent_type: 'gemini',
    });
    expect(writeAssistantRuleInvoke).toHaveBeenCalledWith({
      assistant_id: 'new-assistant',
      locale: 'en-US',
      content: 'rule body',
    });
    expect(loadAssistants).toHaveBeenCalled();
    expect(refreshAgentDetection).toHaveBeenCalled();
    expect(setActiveAssistantId).toHaveBeenLastCalledWith('new-assistant');
  });

  it('handleSave without a name shows a validation error and skips the backend call', async () => {
    const message = makeMessage();
    const params = {
      ...baseParams(null),
      message: message as unknown as Parameters<typeof useAssistantEditor>[0]['message'],
    };
    const { result } = renderHook(() => useAssistantEditor(params));

    await act(async () => {
      await result.current.handleCreate();
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(assistantsCreateInvoke).not.toHaveBeenCalled();
    expect(message.error).toHaveBeenCalled();
  });

  it('handleSave in update mode calls assistants.update with activeAssistant id', async () => {
    const active = makeAssistant({ id: 'custom-1', name: 'Orig', source: 'user' });
    const { result } = renderHook(() => useAssistantEditor(baseParams(active)));

    // Simulate the editor opening with the active assistant.
    await act(async () => {
      await result.current.handleEdit(active);
    });

    act(() => {
      result.current.setEditName('Renamed');
    });

    assistantsUpdateInvoke.mockResolvedValue(makeAssistant({ id: 'custom-1', name: 'Renamed' }));

    await act(async () => {
      await result.current.handleSave();
    });

    expect(assistantsUpdateInvoke).toHaveBeenCalledTimes(1);
    expect(assistantsUpdateInvoke.mock.calls[0][0]).toMatchObject({
      id: 'custom-1',
      name: 'Renamed',
    });
    expect(assistantsCreateInvoke).not.toHaveBeenCalled();
  });

  it('handleDeleteClick on a user assistant opens the confirmation dialog', () => {
    const active = makeAssistant({ id: 'custom-1', name: 'C', source: 'user' });
    const { result } = renderHook(() => useAssistantEditor(baseParams(active)));

    act(() => {
      result.current.handleDeleteClick();
    });

    expect(result.current.deleteConfirmVisible).toBe(true);
  });

  it('handleDeleteClick on a builtin assistant warns and does not open the dialog', () => {
    const active = makeAssistant({ id: 'builtin-office', name: 'Office', source: 'builtin' });
    const message = makeMessage();
    const params = {
      ...baseParams(active),
      message: message as unknown as Parameters<typeof useAssistantEditor>[0]['message'],
    };
    const { result } = renderHook(() => useAssistantEditor(params));

    act(() => {
      result.current.handleDeleteClick();
    });

    expect(result.current.deleteConfirmVisible).toBe(false);
    expect(message.warning).toHaveBeenCalled();
  });

  it('handleDeleteClick on an extension assistant warns and does not open the dialog', () => {
    const active = makeAssistant({ id: 'ext-buddy', name: 'Buddy', source: 'extension' });
    const message = makeMessage();
    const params = {
      ...baseParams(active),
      message: message as unknown as Parameters<typeof useAssistantEditor>[0]['message'],
    };
    const { result } = renderHook(() => useAssistantEditor(params));

    act(() => {
      result.current.handleDeleteClick();
    });

    expect(result.current.deleteConfirmVisible).toBe(false);
    expect(message.warning).toHaveBeenCalled();
  });

  it('handleDeleteConfirm calls assistants.delete and reloads the list', async () => {
    const active = makeAssistant({ id: 'custom-1', name: 'C', source: 'user' });
    assistantsDeleteInvoke.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAssistantEditor(baseParams(active)));

    await act(async () => {
      await result.current.handleDeleteConfirm();
    });

    expect(assistantsDeleteInvoke).toHaveBeenCalledWith({ id: 'custom-1' });
    expect(loadAssistants).toHaveBeenCalled();
    expect(refreshAgentDetection).toHaveBeenCalled();
    expect(result.current.deleteConfirmVisible).toBe(false);
  });

  it('handleToggleEnabled on a user assistant calls assistants.setState', async () => {
    const active = makeAssistant({ id: 'custom-1', name: 'C', source: 'user' });
    assistantsSetStateInvoke.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAssistantEditor(baseParams(active)));

    await act(async () => {
      await result.current.handleToggleEnabled(active, false);
    });

    expect(assistantsSetStateInvoke).toHaveBeenCalledWith({ id: 'custom-1', enabled: false });
    expect(loadAssistants).toHaveBeenCalled();
  });

  it('handleToggleEnabled on a builtin assistant still calls assistants.setState (override path)', async () => {
    const active = makeAssistant({ id: 'builtin-office', name: 'O', source: 'builtin' });
    assistantsSetStateInvoke.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAssistantEditor(baseParams(active)));

    await act(async () => {
      await result.current.handleToggleEnabled(active, false);
    });

    expect(assistantsSetStateInvoke).toHaveBeenCalledWith({ id: 'builtin-office', enabled: false });
  });

  it('handleToggleEnabled on an extension assistant skips the backend call and warns', async () => {
    const active = makeAssistant({ id: 'ext-buddy', name: 'B', source: 'extension' });
    const message = makeMessage();
    const params = {
      ...baseParams(active),
      message: message as unknown as Parameters<typeof useAssistantEditor>[0]['message'],
    };
    const { result } = renderHook(() => useAssistantEditor(params));

    await act(async () => {
      await result.current.handleToggleEnabled(active, false);
    });

    expect(assistantsSetStateInvoke).not.toHaveBeenCalled();
    expect(message.warning).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useDetectedAgents
// ─────────────────────────────────────────────────────────────────────────────

describe('useDetectedAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAvailableAgentsInvoke.mockResolvedValue([]);
  });

  it('initializes with empty availableBackends before SWR resolves', () => {
    const { result } = renderHook(() => useDetectedAgents());
    expect(result.current.availableBackends).toEqual([]);
  });

  it('refreshAgentDetection calls ipcBridge.acpConversation.refreshCustomAgents', async () => {
    const { result } = renderHook(() => useDetectedAgents());

    await act(async () => {
      await result.current.refreshAgentDetection();
    });

    expect(refreshCustomAgentsInvoke).toHaveBeenCalledOnce();
  });

  it('refreshAgentDetection swallows errors silently', async () => {
    refreshCustomAgentsInvoke.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useDetectedAgents());

    await act(async () => {
      await result.current.refreshAgentDetection();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useAssistantSkills (kept from prior coverage — validates ipcBridge.fs usage)
// ─────────────────────────────────────────────────────────────────────────────

describe('useAssistantSkills', () => {
  const message = makeMessage();

  const defaultParams = {
    skillsModalVisible: false,
    customSkills: [] as string[],
    selectedSkills: [] as string[],
    pendingSkills: [] as PendingSkill[],
    availableSkills: [] as SkillInfo[],
    setPendingSkills: vi.fn(),
    setCustomSkills: vi.fn(),
    setSelectedSkills: vi.fn(),
    message: message as unknown as ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    detectAndCountExternalSkillsInvoke.mockResolvedValue([]);
  });

  it('initializes with empty external sources and no active tab', () => {
    const { result } = renderHook(() => useAssistantSkills(defaultParams));
    expect(result.current.externalSources).toEqual([]);
    expect(result.current.activeSourceTab).toBe('');
  });

  it('handleRefreshExternal loads sources and picks the first tab', async () => {
    const sources: ExternalSource[] = [
      {
        name: 'Local',
        path: '/skills',
        source: 'local',
        skills: [{ name: 'web-search', description: 'Search the web', path: '/skills/web-search' }],
      },
    ];
    detectAndCountExternalSkillsInvoke.mockResolvedValue(sources);

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    await act(async () => {
      await result.current.handleRefreshExternal();
    });

    expect(result.current.externalSources).toEqual(sources);
    expect(result.current.activeSourceTab).toBe('local');
  });

  it('filters external skills by search query against name and description', async () => {
    const sources: ExternalSource[] = [
      {
        name: 'Local',
        path: '/skills',
        source: 'local',
        skills: [
          { name: 'web-search', description: 'Search the web', path: '/skills/web-search' },
          { name: 'file-reader', description: 'Read files', path: '/skills/file-reader' },
        ],
      },
    ];
    detectAndCountExternalSkillsInvoke.mockResolvedValue(sources);

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    await act(async () => {
      await result.current.handleRefreshExternal();
    });

    act(() => {
      result.current.setSearchExternalQuery('files');
    });

    expect(result.current.filteredExternalSkills).toEqual([
      { name: 'file-reader', description: 'Read files', path: '/skills/file-reader' },
    ]);
  });
});
