/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { AcpBackendConfig } from '../../../../src/common/types/acpTypes';
import type { AvailableAgent } from '../../../../src/renderer/utils/model/agentTypes';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const configStorageMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn().mockResolvedValue(undefined),
}));

const ipcMock = vi.hoisted(() => ({
  getAvailableAgents: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/common', () => ({
  ipcBridge: {
    acpConversation: {
      getAvailableAgents: { invoke: ipcMock.getAvailableAgents },
    },
  },
}));

vi.mock('../../../../src/common/config/storage', () => ({
  ConfigStorage: configStorageMock,
}));

// SWR mock: uses React state to trigger re-renders when async data resolves.
// Each SWR key gets its own useState so the component tree re-renders properly.

const swrSubscribers = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  listeners: new Map<string, Set<(v: unknown) => void>>(),
  reset() {
    this.cache.clear();
    this.listeners.clear();
  },
}));

vi.mock('swr', async () => {
  const React = await import('react');
  return {
    default: (key: string, fetcher: () => Promise<unknown>) => {
      const [data, setData] = React.useState<unknown>(
        swrSubscribers.cache.has(key) ? swrSubscribers.cache.get(key) : undefined
      );
      const resolved = swrSubscribers.cache.has(key);

      React.useEffect(() => {
        if (!resolved) {
          fetcher()
            .then((result) => {
              swrSubscribers.cache.set(key, result);
              setData(result);
            })
            .catch(() => {});
        }
      }, [key, fetcher, resolved]);

      return {
        data,
        isLoading: data === undefined && !resolved,
        error: undefined,
        mutate: vi.fn(),
      };
    },
    mutate: vi.fn(),
  };
});

import { useConversationAgents } from '../../../../src/renderer/pages/conversation/hooks/useConversationAgents';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const CLI_AGENTS: AvailableAgent[] = [
  { backend: 'gemini', name: 'Gemini' },
  { backend: 'claude', name: 'Claude Code' },
];

function makePresetConfig(overrides: Partial<AcpBackendConfig> = {}): AcpBackendConfig {
  return {
    id: 'my-assistant',
    name: 'My Assistant',
    isPreset: true,
    enabled: true,
    ...overrides,
  } as AcpBackendConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMocks(presetConfigs: AcpBackendConfig[] = []) {
  ipcMock.getAvailableAgents.mockResolvedValue({ success: true, data: CLI_AGENTS });
  configStorageMock.get.mockImplementation(async (key: string) => {
    if (key === 'assistants') {
      return presetConfigs;
    }
    return null;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useConversationAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    swrSubscribers.reset();
  });

  // -- configToAvailableAgent mapping tests (tested via hook output) --

  describe('configToAvailableAgent mapping', () => {
    it('maps presetAgentType to backend field', async () => {
      setupMocks([makePresetConfig({ id: 'p1', name: 'Claude Preset', presetAgentType: 'claude' })]);

      const { result } = renderHook(() => useConversationAgents());

      await waitFor(() => {
        expect(result.current.presetAssistants.length).toBe(1);
      });

      expect(result.current.presetAssistants[0].backend).toBe('claude');
    });

    it('defaults backend to "gemini" when presetAgentType is undefined', async () => {
      setupMocks([makePresetConfig({ id: 'p2', name: 'Default Backend' })]);

      const { result } = renderHook(() => useConversationAgents());

      await waitFor(() => {
        expect(result.current.presetAssistants.length).toBe(1);
      });

      expect(result.current.presetAssistants[0].backend).toBe('gemini');
    });

    it('defaults backend to "gemini" when presetAgentType is empty string', async () => {
      setupMocks([makePresetConfig({ id: 'p3', name: 'Empty Type', presetAgentType: '' })]);

      const { result } = renderHook(() => useConversationAgents());

      await waitFor(() => {
        expect(result.current.presetAssistants.length).toBe(1);
      });

      // Empty string is falsy, so fallback to 'gemini'
      expect(result.current.presetAssistants[0].backend).toBe('gemini');
    });

    it('sets isPreset to true for all preset assistants', async () => {
      setupMocks([
        makePresetConfig({ id: 'a1', name: 'A1', presetAgentType: 'claude' }),
        makePresetConfig({ id: 'a2', name: 'A2', presetAgentType: 'codex' }),
      ]);

      const { result } = renderHook(() => useConversationAgents());

      await waitFor(() => {
        expect(result.current.presetAssistants.length).toBe(2);
      });

      for (const agent of result.current.presetAssistants) {
        expect(agent.isPreset).toBe(true);
      }
    });

    it('passes through customAgentId, name, avatar, and context', async () => {
      setupMocks([
        makePresetConfig({
          id: 'custom-1',
          name: 'Writer Bot',
          avatar: '🖊️',
          context: 'You are a creative writer.',
          presetAgentType: 'qwen',
        }),
      ]);

      const { result } = renderHook(() => useConversationAgents());

      await waitFor(() => {
        expect(result.current.presetAssistants.length).toBe(1);
      });

      const agent = result.current.presetAssistants[0];
      expect(agent.customAgentId).toBe('custom-1');
      expect(agent.name).toBe('Writer Bot');
      expect(agent.avatar).toBe('🖊️');
      expect(agent.context).toBe('You are a creative writer.');
      expect(agent.presetAgentType).toBe('qwen');
    });

    it('handles various presetAgentType values correctly', async () => {
      setupMocks([
        makePresetConfig({ id: 'c1', name: 'Codex', presetAgentType: 'codex' }),
        makePresetConfig({ id: 'c2', name: 'CodeBuddy', presetAgentType: 'codebuddy' }),
        makePresetConfig({ id: 'c3', name: 'Aionrs', presetAgentType: 'aionrs' }),
      ]);

      const { result } = renderHook(() => useConversationAgents());

      await waitFor(() => {
        expect(result.current.presetAssistants.length).toBe(3);
      });

      expect(result.current.presetAssistants[0].backend).toBe('codex');
      expect(result.current.presetAssistants[1].backend).toBe('codebuddy');
      expect(result.current.presetAssistants[2].backend).toBe('aionrs');
    });
  });

  // -- Hook data source tests --

  describe('hook data sources', () => {
    it('returns cliAgents from the SWR detection cache', async () => {
      setupMocks([]);

      const { result } = renderHook(() => useConversationAgents());

      await waitFor(() => {
        expect(result.current.cliAgents.length).toBe(2);
      });

      expect(result.current.cliAgents).toEqual(CLI_AGENTS);
    });

    it('returns presetAssistants derived from ConfigStorage("assistants")', async () => {
      const presets = [
        makePresetConfig({ id: 'p1', name: 'Assistant A', presetAgentType: 'claude' }),
        makePresetConfig({ id: 'p2', name: 'Assistant B', presetAgentType: 'gemini' }),
      ];
      setupMocks(presets);

      const { result } = renderHook(() => useConversationAgents());

      await waitFor(() => {
        expect(result.current.presetAssistants.length).toBe(2);
      });

      expect(result.current.presetAssistants[0].name).toBe('Assistant A');
      expect(result.current.presetAssistants[1].name).toBe('Assistant B');
    });

    it('filters out disabled presets (enabled === false)', async () => {
      setupMocks([
        makePresetConfig({ id: 'e1', name: 'Enabled', enabled: true }),
        makePresetConfig({ id: 'e2', name: 'Disabled', enabled: false }),
      ]);

      const { result } = renderHook(() => useConversationAgents());

      await waitFor(() => {
        expect(result.current.presetAssistants.length).toBe(1);
      });

      expect(result.current.presetAssistants[0].name).toBe('Enabled');
    });

    it('filters out non-preset configs (isPreset !== true)', async () => {
      const agents: AcpBackendConfig[] = [
        makePresetConfig({ id: 'preset', name: 'Preset One' }),
        { id: 'cli-agent', name: 'CLI Agent', enabled: true } as AcpBackendConfig,
      ];
      setupMocks(agents);

      const { result } = renderHook(() => useConversationAgents());

      await waitFor(() => {
        expect(result.current.presetAssistants.length).toBe(1);
      });

      expect(result.current.presetAssistants[0].customAgentId).toBe('preset');
    });

    it('returns empty arrays when ConfigStorage returns null', async () => {
      ipcMock.getAvailableAgents.mockResolvedValue({ success: true, data: [] });
      configStorageMock.get.mockResolvedValue(null);

      const { result } = renderHook(() => useConversationAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.cliAgents).toEqual([]);
      expect(result.current.presetAssistants).toEqual([]);
    });
  });
});
