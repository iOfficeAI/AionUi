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
vi.mock('@/renderer/pages/conversation/Preview/context/previewWatchStore', () => ({
  configurePreviewWatch: vi.fn(),
  notifyPreviewWatchChange: vi.fn(),
}));

import { applyMonitorNotification } from '@/renderer/pages/conversation/explorer/explorerStore';
import { dispatchMonitorNotification } from '@/renderer/pages/conversation/explorer/monitorTransport';
import { applySearchMatch } from '@/renderer/pages/conversation/explorer/search/searchStore';
import { notifyPreviewWatchChange } from '@/renderer/pages/conversation/Preview/context/previewWatchStore';

describe('dispatchMonitorNotification (real routing)', () => {
  beforeEach(() => {
    vi.mocked(applySearchMatch).mockClear();
    vi.mocked(applyMonitorNotification).mockClear();
    vi.mocked(notifyPreviewWatchChange).mockClear();
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

  // The preview panel watches the directories holding its open files, which the
  // explorer may not have expanded. One backend watch serves both, so the same delta
  // has to reach both consumers over this single connection.
  it('also hands a fs/delta to the preview panel', () => {
    const delta = { target: { pe_id: 'p', relative_path: 'src' }, changes: [] };
    dispatchMonitorNotification('fs/delta', delta);

    expect(notifyPreviewWatchChange).toHaveBeenCalledWith('p\u0000src');
    // The explorer still gets it — this is a fan-out, not a redirect.
    expect(applyMonitorNotification).toHaveBeenCalledWith('fs/delta', delta);
  });

  // A snapshot is the initial listing returned when subscribing, not a change; the
  // panel treating it as one would flag "this file changed" the moment it opened.
  it('does not treat fs/snapshot as a change for the preview panel', () => {
    dispatchMonitorNotification('fs/snapshot', { target: { pe_id: 'p', relative_path: 'src' }, entries: [] });
    expect(notifyPreviewWatchChange).not.toHaveBeenCalled();
  });

  it('does not involve the preview panel in search traffic', () => {
    dispatchMonitorNotification('fs/searchMatch', { search_id: 1, matches: [] });
    expect(notifyPreviewWatchChange).not.toHaveBeenCalled();
  });

  it('ignores a fs/delta with no target rather than throwing', () => {
    expect(() => dispatchMonitorNotification('fs/delta', {})).not.toThrow();
    expect(notifyPreviewWatchChange).not.toHaveBeenCalled();
  });

  it('does not leak an unknown method into the search store', () => {
    dispatchMonitorNotification('fs/somethingElse', {});
    expect(applySearchMatch).not.toHaveBeenCalled();
    expect(applyMonitorNotification).toHaveBeenCalledWith('fs/somethingElse', {});
  });
});
