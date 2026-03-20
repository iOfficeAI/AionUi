/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── IPC bridge mock ──────────────────────────────────────────────────────────

const getAssistantsInvoke = vi.fn().mockResolvedValue([]);
const getAcpAdaptersInvoke = vi.fn().mockResolvedValue([]);
const getAvailableAgentsInvoke = vi.fn().mockResolvedValue({ success: true, data: [] });
const refreshCustomAgentsInvoke = vi.fn().mockResolvedValue({});
const detectAndCountExternalSkillsInvoke = vi.fn().mockResolvedValue({ success: true, data: [] });
const addCustomExternalPathInvoke = vi.fn().mockResolvedValue({ success: true });

vi.mock('../../src/common', () => ({
  ipcBridge: {
    extensions: {
      getAssistants: { invoke: (...args: unknown[]) => getAssistantsInvoke(...args) },
      getAcpAdapters: { invoke: (...args: unknown[]) => getAcpAdaptersInvoke(...args) },
    },
    acpConversation: {
      getAvailableAgents: { invoke: (...args: unknown[]) => getAvailableAgentsInvoke(...args) },
      refreshCustomAgents: { invoke: (...args: unknown[]) => refreshCustomAgentsInvoke(...args) },
    },
    fs: {
      detectAndCountExternalSkills: { invoke: (...args: unknown[]) => detectAndCountExternalSkillsInvoke(...args) },
      addCustomExternalPath: { invoke: (...args: unknown[]) => addCustomExternalPathInvoke(...args) },
    },
  },
}));

// ── ConfigStorage mock ───────────────────────────────────────────────────────

const configStorageGetMock = vi.fn().mockResolvedValue([]);
const configStorageSetMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/common/config/storage', () => ({
  ConfigStorage: {
    get: (...args: unknown[]) => configStorageGetMock(...args),
    set: (...args: unknown[]) => configStorageSetMock(...args),
  },
}));

// ── SWR mock ─────────────────────────────────────────────────────────────────

// Store fetcher functions so tests can trigger them
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

// ── react-i18next mock ───────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.defaultValue as string) ?? key,
    i18n: { language: 'en-US' },
  }),
}));

// ── Utility / preset mocks ──────────────────────────────────────────────────

vi.mock('../../src/common/utils', () => ({
  resolveLocaleKey: (lang: string) => lang,
}));

vi.mock('../../src/common/config/presets/assistantPresets', () => ({
  ASSISTANT_PRESETS: [
    { id: 'default', defaultEnabledSkills: [], skillFiles: {} },
    { id: 'coder', defaultEnabledSkills: ['code'], skillFiles: {} },
  ],
}));

vi.mock('../../src/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: (url: string) => url,
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { useAssistantList } from '../../src/renderer/hooks/assistant/useAssistantList';
import { useAssistantBackends } from '../../src/renderer/hooks/assistant/useAssistantBackends';
import { useAssistantSkills } from '../../src/renderer/hooks/assistant/useAssistantSkills';
import type {
  ExternalSource,
  PendingSkill,
  SkillInfo,
} from '../../src/renderer/pages/settings/AssistantManagement/types';

// ─────────────────────────────────────────────────────────────────────────────
// useAssistantList
// ─────────────────────────────────────────────────────────────────────────────

describe('useAssistantList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configStorageGetMock.mockResolvedValue([]);
  });

  it('returns empty assistants and null activeAssistantId initially', async () => {
    const { result } = renderHook(() => useAssistantList());

    // Before loadAssistants resolves, state should be empty
    expect(result.current.assistants).toEqual([]);
    expect(result.current.activeAssistantId).toBeNull();
    expect(result.current.activeAssistant).toBeNull();
  });

  it('loadAssistants fetches from ConfigStorage and populates the list', async () => {
    const storedAgents = [
      { id: 'builtin-coder', name: 'Coder', isPreset: true, isBuiltin: true, enabled: true },
      { id: 'builtin-default', name: 'Default', isPreset: true, isBuiltin: true, enabled: true },
    ];
    configStorageGetMock.mockResolvedValue(storedAgents);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.assistants.length).toBe(2);
    });

    // sortAssistants sorts by ASSISTANT_PRESETS order: default first, then coder
    expect(result.current.assistants[0].id).toBe('builtin-default');
    expect(result.current.assistants[1].id).toBe('builtin-coder');

    // activeAssistantId defaults to first sorted assistant
    expect(result.current.activeAssistantId).toBe('builtin-default');
  });

  it('activeAssistant is derived from activeAssistantId', async () => {
    const storedAgents = [
      { id: 'builtin-default', name: 'Default', isPreset: true, isBuiltin: true, enabled: true },
      { id: 'custom-1', name: 'My Agent', isPreset: true, isBuiltin: false, enabled: true },
    ];
    configStorageGetMock.mockResolvedValue(storedAgents);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.assistants.length).toBe(2);
    });

    // Set active to custom-1
    act(() => {
      result.current.setActiveAssistantId('custom-1');
    });

    expect(result.current.activeAssistant?.id).toBe('custom-1');
    expect(result.current.activeAssistant?.name).toBe('My Agent');
  });

  it('preserves activeAssistantId across reloads if it still exists', async () => {
    const storedAgents = [
      { id: 'builtin-default', name: 'Default', isPreset: true, isBuiltin: true, enabled: true },
      { id: 'custom-1', name: 'My Agent', isPreset: true, isBuiltin: false, enabled: true },
    ];
    configStorageGetMock.mockResolvedValue(storedAgents);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.assistants.length).toBe(2);
    });

    act(() => {
      result.current.setActiveAssistantId('custom-1');
    });

    // Reload with same agents
    await act(async () => {
      await result.current.loadAssistants();
    });

    // Should still be custom-1
    expect(result.current.activeAssistantId).toBe('custom-1');
  });

  it('isExtensionAssistant detects extension-sourced assistants', async () => {
    const { result } = renderHook(() => useAssistantList());

    const extAssistant = { id: 'ext-buddy', name: 'Buddy', _source: 'extension', isPreset: true, enabled: true };
    const normalAssistant = { id: 'custom-1', name: 'Custom', isPreset: true, enabled: true };

    expect(result.current.isExtensionAssistant(extAssistant)).toBe(true);
    expect(result.current.isExtensionAssistant(normalAssistant)).toBe(false);
    expect(result.current.isExtensionAssistant(null)).toBe(false);
  });

  it('isReadonlyAssistant is true when active assistant is from extension', async () => {
    const storedAgents = [
      { id: 'ext-buddy', name: 'Buddy', _source: 'extension', isPreset: true, isBuiltin: false, enabled: true },
    ];
    configStorageGetMock.mockResolvedValue(storedAgents);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.assistants.length).toBe(1);
    });

    expect(result.current.isReadonlyAssistant).toBe(true);
  });

  it('handles ConfigStorage error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    configStorageGetMock.mockRejectedValue(new Error('storage failure'));

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load assistant presets:', expect.objectContaining({}));
    });

    expect(result.current.assistants).toEqual([]);
    consoleSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useAssistantBackends
// ─────────────────────────────────────────────────────────────────────────────

describe('useAssistantBackends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAvailableAgentsInvoke.mockResolvedValue({ success: true, data: [] });
  });

  it('initializes with gemini in availableBackends', () => {
    const { result } = renderHook(() => useAssistantBackends());

    expect(result.current.availableBackends.has('gemini')).toBe(true);
    expect(result.current.availableBackends.size).toBe(1);
  });

  it('populates availableBackends from ipcBridge detection', async () => {
    getAvailableAgentsInvoke.mockResolvedValue({
      success: true,
      data: [{ backend: 'gemini' }, { backend: 'claude' }, { backend: 'qwen' }],
    });

    const { result } = renderHook(() => useAssistantBackends());

    await waitFor(() => {
      expect(result.current.availableBackends.size).toBe(3);
    });

    expect(result.current.availableBackends.has('gemini')).toBe(true);
    expect(result.current.availableBackends.has('claude')).toBe(true);
    expect(result.current.availableBackends.has('qwen')).toBe(true);
  });

  it('falls back to default when getAvailableAgents fails', async () => {
    getAvailableAgentsInvoke.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useAssistantBackends());

    // Should still have the default gemini
    await waitFor(() => {
      expect(result.current.availableBackends.has('gemini')).toBe(true);
    });
    expect(result.current.availableBackends.size).toBe(1);
  });

  it('refreshAgentDetection calls refreshCustomAgents', async () => {
    const { result } = renderHook(() => useAssistantBackends());

    await act(async () => {
      await result.current.refreshAgentDetection();
    });

    expect(refreshCustomAgentsInvoke).toHaveBeenCalledOnce();
  });

  it('refreshAgentDetection handles errors silently', async () => {
    refreshCustomAgentsInvoke.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useAssistantBackends());

    // Should not throw
    await act(async () => {
      await result.current.refreshAgentDetection();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useAssistantSkills
// ─────────────────────────────────────────────────────────────────────────────

describe('useAssistantSkills', () => {
  const mockMessage = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    normal: vi.fn(),
    clear: vi.fn(),
  };

  const defaultParams = {
    skillsModalVisible: false,
    customSkills: [] as string[],
    selectedSkills: [] as string[],
    pendingSkills: [] as PendingSkill[],
    availableSkills: [] as SkillInfo[],
    setPendingSkills: vi.fn(),
    setCustomSkills: vi.fn(),
    setSelectedSkills: vi.fn(),
    message: mockMessage as unknown as ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    detectAndCountExternalSkillsInvoke.mockResolvedValue({ success: true, data: [] });
  });

  it('initializes with empty external sources and no active tab', () => {
    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    expect(result.current.externalSources).toEqual([]);
    expect(result.current.activeSourceTab).toBe('');
    expect(result.current.searchExternalQuery).toBe('');
    expect(result.current.filteredExternalSkills).toEqual([]);
    expect(result.current.externalSkillsLoading).toBe(false);
  });

  it('handleRefreshExternal calls ipcBridge and updates sources', async () => {
    const sources: ExternalSource[] = [
      {
        name: 'Local',
        path: '/skills',
        source: 'local',
        skills: [{ name: 'web-search', description: 'Search the web', path: '/skills/web-search' }],
      },
    ];
    detectAndCountExternalSkillsInvoke.mockResolvedValue({ success: true, data: sources });

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    await act(async () => {
      await result.current.handleRefreshExternal();
    });

    expect(detectAndCountExternalSkillsInvoke).toHaveBeenCalledOnce();
    expect(result.current.externalSources).toEqual(sources);
    expect(result.current.activeSourceTab).toBe('local');
  });

  it('triggers handleRefreshExternal when skillsModalVisible becomes true', async () => {
    detectAndCountExternalSkillsInvoke.mockResolvedValue({ success: true, data: [] });

    const { rerender } = renderHook(
      (props: { visible: boolean }) => useAssistantSkills({ ...defaultParams, skillsModalVisible: props.visible }),
      { initialProps: { visible: false } }
    );

    // Modal opens
    rerender({ visible: true });

    await waitFor(() => {
      expect(detectAndCountExternalSkillsInvoke).toHaveBeenCalled();
    });
  });

  it('filteredExternalSkills filters by searchExternalQuery', async () => {
    const sources: ExternalSource[] = [
      {
        name: 'Local',
        path: '/skills',
        source: 'local',
        skills: [
          { name: 'web-search', description: 'Search the web', path: '/skills/web-search' },
          { name: 'file-reader', description: 'Read files', path: '/skills/file-reader' },
          { name: 'web-scraper', description: 'Scrape websites', path: '/skills/web-scraper' },
        ],
      },
    ];
    detectAndCountExternalSkillsInvoke.mockResolvedValue({ success: true, data: sources });

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    // Load sources first
    await act(async () => {
      await result.current.handleRefreshExternal();
    });

    // Verify all skills are shown without filter
    expect(result.current.filteredExternalSkills.length).toBe(3);

    // Set search query
    act(() => {
      result.current.setSearchExternalQuery('web');
    });

    // Should filter to skills containing "web" in name or description
    expect(result.current.filteredExternalSkills.length).toBe(2);
    expect(result.current.filteredExternalSkills.map((s) => s.name)).toEqual(['web-search', 'web-scraper']);
  });

  it('filteredExternalSkills matches description as well', async () => {
    const sources: ExternalSource[] = [
      {
        name: 'Local',
        path: '/skills',
        source: 'local',
        skills: [
          { name: 'alpha', description: 'Search the web', path: '/skills/alpha' },
          { name: 'beta', description: 'Read files', path: '/skills/beta' },
        ],
      },
    ];
    detectAndCountExternalSkillsInvoke.mockResolvedValue({ success: true, data: sources });

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    await act(async () => {
      await result.current.handleRefreshExternal();
    });

    act(() => {
      result.current.setSearchExternalQuery('files');
    });

    expect(result.current.filteredExternalSkills.length).toBe(1);
    expect(result.current.filteredExternalSkills[0].name).toBe('beta');
  });

  it('handleRefreshExternal handles errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    detectAndCountExternalSkillsInvoke.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    await act(async () => {
      await result.current.handleRefreshExternal();
    });

    expect(result.current.externalSkillsLoading).toBe(false);
    expect(result.current.refreshing).toBe(false);
    consoleSpy.mockRestore();
  });

  it('handleAddFoundSkills adds new skills and calls setPendingSkills', () => {
    const setPendingSkills = vi.fn();
    const setCustomSkills = vi.fn();
    const setSelectedSkills = vi.fn();

    const { result } = renderHook(() =>
      useAssistantSkills({
        ...defaultParams,
        setPendingSkills,
        setCustomSkills,
        setSelectedSkills,
        customSkills: ['existing-skill'],
        availableSkills: [],
        pendingSkills: [],
        selectedSkills: ['existing-skill'],
      })
    );

    act(() => {
      result.current.handleAddFoundSkills([
        { name: 'new-skill', description: 'A new skill', path: '/skills/new-skill' },
        { name: 'existing-skill', description: 'Already there', path: '/skills/existing-skill' },
      ]);
    });

    // Only the new skill should be added; existing-skill should be skipped
    expect(setPendingSkills).toHaveBeenCalledWith([
      { name: 'new-skill', description: 'A new skill', path: '/skills/new-skill' },
    ]);
    expect(setCustomSkills).toHaveBeenCalledWith(['existing-skill', 'new-skill']);
    expect(setSelectedSkills).toHaveBeenCalledWith(['existing-skill', 'new-skill']);
    expect(mockMessage.success).toHaveBeenCalled();
  });

  it('handleAddFoundSkills shows warning when all skills already exist', () => {
    const { result } = renderHook(() =>
      useAssistantSkills({
        ...defaultParams,
        customSkills: ['skill-a'],
      })
    );

    act(() => {
      result.current.handleAddFoundSkills([{ name: 'skill-a', description: 'Dup', path: '/p' }]);
    });

    expect(mockMessage.warning).toHaveBeenCalled();
  });
});
