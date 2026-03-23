/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { TimelineSection } from '../../src/renderer/pages/conversation/GroupedHistory/types';

// ── localStorage mock ────────────────────────────────────────────────────────

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  get length() {
    return storageMap.size;
  },
  key: vi.fn((_index: number) => null),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true, configurable: true });

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockInvoke = vi.fn().mockResolvedValue([]);

vi.mock('../../src/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    },
    conversation: {
      listChanged: { on: vi.fn() },
      responseStream: { on: vi.fn() },
      turnCompleted: { on: vi.fn() },
    },
  },
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({}),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Shared ref so the hoisted mock factory can read the latest value
const testState = { sections: [] as TimelineSection[] };

vi.mock('../../src/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers', () => ({
  buildGroupedHistory: () => ({
    pinnedConversations: [],
    timelineSections: testState.sections,
  }),
}));

vi.mock('../../src/renderer/utils/emitter', () => ({
  addEventListener: () => () => {},
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'aionui_workspace_expansion';

const makeWorkspaceSection = (workspaces: string[]): TimelineSection[] => [
  {
    timeline: 'conversation.history.today',
    items: workspaces.map((ws) => ({
      type: 'workspace' as const,
      time: Date.now(),
      workspaceGroup: {
        workspace: ws,
        displayName: ws.split('/').pop()!,
        conversations: [],
      },
    })),
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────

// Import the hook statically since mocks are hoisted
import { useConversations } from '../../src/renderer/pages/conversation/GroupedHistory/hooks/useConversations';

describe('useConversations - workspace expansion', () => {
  beforeEach(() => {
    storageMap.clear();
    testState.sections = [];
    mockInvoke.mockResolvedValue([]);
  });

  it('should auto-expand all workspaces on first load when localStorage is empty', async () => {
    testState.sections = makeWorkspaceSection(['/ws/a', '/ws/b']);

    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    expect(result.current.expandedWorkspaces).toEqual(expect.arrayContaining(['/ws/a', '/ws/b']));
    expect(result.current.expandedWorkspaces).toHaveLength(2);
  });

  it('should restore expansion state from localStorage', async () => {
    storageMap.set(STORAGE_KEY, JSON.stringify(['/ws/a']));
    testState.sections = makeWorkspaceSection(['/ws/a', '/ws/b']);

    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    // Should keep only the stored value, not auto-expand all
    expect(result.current.expandedWorkspaces).toEqual(['/ws/a']);
  });

  it('should toggle workspace expansion on handleToggleWorkspace', async () => {
    testState.sections = makeWorkspaceSection(['/ws/a', '/ws/b']);

    const { result } = renderHook(() => useConversations());
    await act(async () => {});
    expect(result.current.expandedWorkspaces).toContain('/ws/a');

    // Collapse /ws/a
    act(() => {
      result.current.handleToggleWorkspace('/ws/a');
    });
    expect(result.current.expandedWorkspaces).not.toContain('/ws/a');
    expect(result.current.expandedWorkspaces).toContain('/ws/b');

    // Expand /ws/a again
    act(() => {
      result.current.handleToggleWorkspace('/ws/a');
    });
    expect(result.current.expandedWorkspaces).toContain('/ws/a');
  });

  it('should persist expansion state to localStorage', async () => {
    testState.sections = makeWorkspaceSection(['/ws/a', '/ws/b']);

    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    act(() => {
      result.current.handleToggleWorkspace('/ws/a');
    });

    const stored = JSON.parse(storageMap.get(STORAGE_KEY)!);
    expect(stored).toEqual(['/ws/b']);
  });

  it('should remove stale workspace entries from expandedWorkspaces', async () => {
    // localStorage has a workspace that no longer exists in data
    storageMap.set(STORAGE_KEY, JSON.stringify(['/ws/a', '/ws/stale']));
    testState.sections = makeWorkspaceSection(['/ws/a', '/ws/b']);

    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    expect(result.current.expandedWorkspaces).not.toContain('/ws/stale');
    expect(result.current.expandedWorkspaces).toContain('/ws/a');
  });

  it('should not re-expand workspaces after user manually collapses all (#1156)', async () => {
    testState.sections = makeWorkspaceSection(['/ws/a']);

    const { result } = renderHook(() => useConversations());
    await act(async () => {});
    expect(result.current.expandedWorkspaces).toEqual(['/ws/a']);

    // User collapses the only workspace
    act(() => {
      result.current.handleToggleWorkspace('/ws/a');
    });

    // Should stay collapsed, not re-expand
    expect(result.current.expandedWorkspaces).toEqual([]);
  });
});
