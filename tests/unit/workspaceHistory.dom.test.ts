import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getWorkspaceHistoryRecords, getWorkspaceUpdateTime, updateWorkspaceTime } from '@/renderer/utils/workspaceHistory';

describe('workspaceHistory', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('normalizes workspace paths and keeps the latest timestamp for the same folder', () => {
    updateWorkspaceTime('C:/Projects/AionUi///');

    vi.setSystemTime(new Date('2026-03-16T00:05:00.000Z'));
    updateWorkspaceTime('c:/projects/aionui');

    const records = getWorkspaceHistoryRecords();

    expect(records).toHaveLength(1);
    expect(records[0]?.workspace).toBe('c:/projects/aionui');
    expect(records[0]?.updatedAt).toBe(new Date('2026-03-16T00:05:00.000Z').getTime());
    expect(getWorkspaceUpdateTime('C:/Projects/AionUi/')).toBe(records[0]?.updatedAt);
  });

  it('sorts newer workspaces ahead of older ones', () => {
    updateWorkspaceTime('C:/Projects/older');

    vi.setSystemTime(new Date('2026-03-16T00:10:00.000Z'));
    updateWorkspaceTime('C:/Projects/newer');

    expect(getWorkspaceHistoryRecords().map((record) => record.workspace)).toEqual(['C:/Projects/newer', 'C:/Projects/older']);
  });

  it('ignores empty workspace paths', () => {
    updateWorkspaceTime('   ');

    expect(getWorkspaceHistoryRecords()).toEqual([]);
    expect(getWorkspaceUpdateTime('')).toBe(0);
  });
});
