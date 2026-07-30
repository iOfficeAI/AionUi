import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock both stores so the dispatcher's routing (search vs explorer isolation) is
// observable in isolation — no real WS, no real store state.
vi.mock('@/renderer/pages/conversation/explorer/explorerStore', () => ({
  applyMonitorNotification: vi.fn(),
  configureExplorerStore: vi.fn(),
  onReconnect: vi.fn(),
}));
vi.mock('@/renderer/pages/conversation/explorer/search/searchStore', () => ({
  applySearchMatch: vi.fn(),
  configureSearchStore: vi.fn(),
}));

import { applyMonitorNotification } from '@/renderer/pages/conversation/explorer/explorerStore';
import { dispatchMonitorNotification } from '@/renderer/pages/conversation/explorer/monitorTransport';
import { applySearchMatch } from '@/renderer/pages/conversation/explorer/search/searchStore';

describe('dispatchMonitorNotification (real routing)', () => {
  beforeEach(() => {
    vi.mocked(applySearchMatch).mockClear();
    vi.mocked(applyMonitorNotification).mockClear();
  });

  it('routes fs/searchMatch to the search store only', () => {
    const params = { search_id: 7, matches: [] };
    dispatchMonitorNotification('fs/searchMatch', params);
    expect(applySearchMatch).toHaveBeenCalledWith(params);
    expect(applyMonitorNotification).not.toHaveBeenCalled();
  });

  it('routes fs/snapshot and fs/delta to the explorer store only', () => {
    const snap = { target: { pe_id: 'p', relative_path: '' }, entries: [] };
    const delta = { target: { pe_id: 'p', relative_path: '' }, changes: [] };
    dispatchMonitorNotification('fs/snapshot', snap);
    dispatchMonitorNotification('fs/delta', delta);
    expect(applyMonitorNotification).toHaveBeenNthCalledWith(1, 'fs/snapshot', snap);
    expect(applyMonitorNotification).toHaveBeenNthCalledWith(2, 'fs/delta', delta);
    expect(applySearchMatch).not.toHaveBeenCalled();
  });

  it('does not leak an unknown method into the search store', () => {
    dispatchMonitorNotification('fs/somethingElse', {});
    expect(applySearchMatch).not.toHaveBeenCalled();
    expect(applyMonitorNotification).toHaveBeenCalledWith('fs/somethingElse', {});
  });
});
