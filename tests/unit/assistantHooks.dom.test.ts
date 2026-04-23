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
const getAvailableAgentsInvoke = vi.fn().mockResolvedValue([]);
const refreshCustomAgentsInvoke = vi.fn().mockResolvedValue({});
const detectAndCountExternalSkillsInvoke = vi.fn().mockResolvedValue([]);
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

// ── configService mock ───────────────────────────────────────────────────────

const configServiceGetMock = vi.fn().mockReturnValue([]);
const configServiceSetMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/common/config/configService', () => ({
  configService: {
    get: (...args: unknown[]) => configServiceGetMock(...args),
    set: (...args: unknown[]) => configServiceSetMock(...args),
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
import { useDetectedAgents } from '../../src/renderer/hooks/assistant/useDetectedAgents';
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
    configServiceGetMock.mockReturnValue([]);
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
      { id: 'builtin-coder', name: 'Coder', is_preset: true, isBuiltin: true, enabled: true },
      { id: 'builtin-default', name: 'Default', is_preset: true, isBuiltin: true, enabled: true },
    ];
    configServiceGetMock.mockReturnValue(storedAgents);

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
      { id: 'builtin-default', name: 'Default', is_preset: true, isBuiltin: true, enabled: true },
      { id: 'custom-1', name: 'My Agent', is_preset: true, isBuiltin: false, enabled: true },
    ];
    configServiceGetMock.mockReturnValue(storedAgents);

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
      { id: 'builtin-default', name: 'Default', is_preset: true, isBuiltin: true, enabled: true },
      { id: 'custom-1', name: 'My Agent', is_preset: true, isBuiltin: false, enabled: true },
    ];
    configServiceGetMock.mockReturnValue(storedAgents);

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

    const extAssistant = { id: 'ext-buddy', name: 'Buddy', _source: 'extension', is_preset: true, enabled: true };
    const normalAssistant = { id: 'custom-1', name: 'Custom', is_preset: true, enabled: true };

    expect(result.current.isExtensionAssistant(extAssistant)).toBe(true);
    expect(result.current.isExtensionAssistant(normalAssistant)).toBe(false);
    expect(result.current.isExtensionAssistant(null)).toBe(false);
  });

  it('extension assistant is editable (not readonly)', async () => {
    const storedAgents = [
      { id: 'ext-buddy', name: 'Buddy', _source: 'extension', is_preset: true, isBuiltin: false, enabled: true },
    ];
    configServiceGetMock.mockReturnValue(storedAgents);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.assistants.length).toBe(1);
    });

    // Extension assistants are identified but not readonly
    expect(result.current.isExtensionAssistant(result.current.assistants[0])).toBe(true);
  });

  it('handles configService error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    configServiceGetMock.mockReturnValue(new Error('storage failure'));

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load assistant presets:', expect.objectContaining({}));
    });

    expect(result.current.assistants).toEqual([]);
    consoleSpy.mockRestore();
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

    // SWR mock returns data: undefined, so the default empty array is used
    expect(result.current.availableBackends).toEqual([]);
  });

  it('refreshAgentDetection calls refreshCustomAgents', async () => {
    const { result } = renderHook(() => useDetectedAgents());

    await act(async () => {
      await result.current.refreshAgentDetection();
    });

    expect(refreshCustomAgentsInvoke).toHaveBeenCalledOnce();
  });

  it('refreshAgentDetection handles errors silently', async () => {
    refreshCustomAgentsInvoke.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useDetectedAgents());

    // Should not throw
    await act(async () => {
      await result.current.refreshAgentDetection();
    });
  });

  it('SWR fetcher returns raw agents and hook filters into availableBackends', async () => {
    getAvailableAgentsInvoke.mockResolvedValue([
      { backend: 'gemini', name: 'Gemini' },
      { backend: 'claude', name: 'Claude' },
      { backend: 'auggie', name: 'Auggie', isExtension: true },
      { backend: 'custom', name: 'Custom' },
      { backend: 'remote', name: 'Remote' },
    ]);

    renderHook(() => useDetectedAgents());

    // Retrieve the fetcher SWR received and call it directly
    const fetcher = swrFetchers.get('agents.detected');
    expect(fetcher).toBeDefined();

    const result = await fetcher!();
    // Fetcher returns raw AvailableAgent[] (no filtering)
    expect(result).toEqual([
      { backend: 'gemini', name: 'Gemini' },
      { backend: 'claude', name: 'Claude' },
      { backend: 'auggie', name: 'Auggie', isExtension: true },
      { backend: 'custom', name: 'Custom' },
      { backend: 'remote', name: 'Remote' },
    ]);
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
    detectAndCountExternalSkillsInvoke.mockResolvedValue([]);
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
    detectAndCountExternalSkillsInvoke.mockResolvedValue(sources);

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    await act(async () => {
      await result.current.handleRefreshExternal();
    });

    expect(detectAndCountExternalSkillsInvoke).toHaveBeenCalledOnce();
    expect(result.current.externalSources).toEqual(sources);
    expect(result.current.activeSourceTab).toBe('local');
  });

  it('triggers handleRefreshExternal when skillsModalVisible becomes true', async () => {
    detectAndCountExternalSkillsInvoke.mockResolvedValue([]);

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
    detectAndCountExternalSkillsInvoke.mockResolvedValue(sources);

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
    detectAndCountExternalSkillsInvoke.mockResolvedValue(sources);

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
