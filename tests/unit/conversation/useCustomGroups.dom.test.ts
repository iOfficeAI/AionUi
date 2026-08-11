import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SidebarCustomGroup } from '@/common/types/sidebar';
import { configService } from '@/common/config/configService';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import { useCustomGroups } from '@/renderer/pages/conversation/GroupedHistory/hooks/useCustomGroups';

vi.mock('@/renderer/hooks/config/useConfig', () => ({
  useConfig: vi.fn(),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn(),
  },
}));

function group(id: string, name: string, itemIds: string[] = [], collapsed = false): SidebarCustomGroup {
  return { id, name, itemIds, collapsed };
}

describe('useCustomGroups', () => {
  let currentGroups: SidebarCustomGroup[];
  const setGroupsMock = vi.fn((next: SidebarCustomGroup[]) => {
    currentGroups = next;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    currentGroups = [];
    vi.mocked(useConfig).mockReturnValue([currentGroups, setGroupsMock]);
    vi.mocked(configService.get).mockImplementation(() => currentGroups);
  });

  it('exposes normalized groups and item lookups', () => {
    currentGroups = [group('a', 'Work', ['conversation:1'])];
    vi.mocked(useConfig).mockReturnValue([currentGroups, setGroupsMock]);

    const { result } = renderHook(() => useCustomGroups());

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.isGrouped('conversation', '1')).toBe(true);
    expect(result.current.isGrouped('conversation', '2')).toBe(false);
    expect(result.current.isGrouped('team', '1')).toBe(false);
    expect(result.current.groupOfItem('conversation', '1')).toBe('a');
    expect(result.current.groupOfItem('team', 'x')).toBeNull();
  });

  it('creates a group and persists it', () => {
    const { result } = renderHook(() => useCustomGroups());

    act(() => {
      result.current.createGroup('Work');
    });

    expect(currentGroups).toEqual([expect.objectContaining({ name: 'Work', itemIds: [] })]);
    expect(setGroupsMock).toHaveBeenCalledTimes(1);
  });

  it('renames, deletes and toggles groups', () => {
    currentGroups = [group('a', 'A'), group('b', 'B', ['conversation:1'])];
    vi.mocked(useConfig).mockReturnValue([currentGroups, setGroupsMock]);
    const { result } = renderHook(() => useCustomGroups());

    act(() => {
      result.current.renameGroup('a', 'Alpha');
    });
    expect(currentGroups.find((g) => g.id === 'a')?.name).toBe('Alpha');

    act(() => {
      result.current.toggleCollapsed('a');
    });
    expect(currentGroups.find((g) => g.id === 'a')?.collapsed).toBe(true);

    act(() => {
      result.current.deleteGroup('a');
    });
    expect(currentGroups.map((g) => g.id)).toEqual(['b']);
  });

  it('moves an item into a group, then out of all groups', () => {
    currentGroups = [group('a', 'A'), group('b', 'B')];
    vi.mocked(useConfig).mockReturnValue([currentGroups, setGroupsMock]);
    const { result } = renderHook(() => useCustomGroups());

    act(() => {
      result.current.moveItem('conversation', '1', 'a');
    });
    expect(currentGroups.find((g) => g.id === 'a')?.itemIds).toEqual(['conversation:1']);

    act(() => {
      result.current.moveItem('conversation', '1', null);
    });
    expect(currentGroups.find((g) => g.id === 'a')?.itemIds).toEqual([]);
  });

  it('moves an item at an exact index and reorders groups/items', () => {
    currentGroups = [group('a', 'A', ['conversation:1', 'conversation:2']), group('b', 'B')];
    vi.mocked(useConfig).mockReturnValue([currentGroups, setGroupsMock]);
    const { result } = renderHook(() => useCustomGroups());

    act(() => {
      result.current.moveItemAt('conversation', '1', 'b', 0);
    });
    expect(currentGroups.find((g) => g.id === 'a')?.itemIds).toEqual(['conversation:2']);
    expect(currentGroups.find((g) => g.id === 'b')?.itemIds).toEqual(['conversation:1']);

    act(() => {
      result.current.reorderItems('b', ['conversation:1', 'conversation:3']);
    });
    expect(currentGroups.find((g) => g.id === 'b')?.itemIds).toEqual(['conversation:1', 'conversation:3']);

    act(() => {
      result.current.reorderAll(['b', 'a']);
    });
    expect(currentGroups.map((g) => g.id)).toEqual(['b', 'a']);
  });
});
