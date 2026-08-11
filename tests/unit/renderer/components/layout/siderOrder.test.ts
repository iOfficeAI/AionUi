import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readStoredSiderOrder,
  reconcileStoredSiderOrder,
  reorderSiderIds,
  sortSiderItemsByStoredOrder,
} from '@/renderer/components/layout/Sider/siderOrder';

describe('siderOrder', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  it('falls back to an empty list when stored order is invalid', () => {
    localStorage.setItem('broken-order', '{');

    expect(readStoredSiderOrder('broken-order')).toEqual([]);
  });

  it('drops stale ids and appends new ids while preserving known order', () => {
    expect(reconcileStoredSiderOrder(['b', 'missing', 'a'], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('keeps group boundaries while honoring stored order inside each group', () => {
    const items = [
      { id: 'team-2', group: 'pinned' },
      { id: 'team-1', group: 'pinned' },
      { id: 'team-3', group: 'regular' },
      { id: 'team-4', group: 'regular' },
    ];

    const sorted = sortSiderItemsByStoredOrder({
      items,
      storedOrder: ['team-4', 'team-1', 'team-3', 'team-2'],
      getId: (item) => item.id,
      getGroupKey: (item) => item.group,
    });

    expect(sorted.map((item) => item.id)).toEqual(['team-1', 'team-2', 'team-4', 'team-3']);
  });

  it('reorders ids with the dragged item inserted at the drop position', () => {
    expect(reorderSiderIds(['job-1', 'job-2', 'job-3'], 'job-3', 'job-1')).toEqual(['job-3', 'job-1', 'job-2']);
  });
});
