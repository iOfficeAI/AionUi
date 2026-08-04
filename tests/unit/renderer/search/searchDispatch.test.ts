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
    const delta = {
      target: { pe_id: 'p', relative_path: 'src' },
      changes: [{ op: 'modified', name: 'a.ts' }],
    };
    dispatchMonitorNotification('fs/delta', delta);

    expect(notifyPreviewWatchChange).toHaveBeenCalledWith('p\u0000src', { kind: 'files', names: ['a.ts'] });
    // The explorer still gets it — this is a fan-out, not a redirect.
    expect(applyMonitorNotification).toHaveBeenCalledWith('fs/delta', delta);
  });

  // The panel needs to know WHICH file changed, not just that its directory did:
  // several tabs usually share a directory, and flagging all of them would send the
  // user to re-read files that never changed.
  it('passes along the names reported as modified', () => {
    dispatchMonitorNotification('fs/delta', {
      target: { pe_id: 'p', relative_path: 'src' },
      changes: [
        { op: 'modified', name: 'a.ts' },
        { op: 'modified', name: 'b.ts' },
      ],
    });

    expect(notifyPreviewWatchChange).toHaveBeenCalledWith('p\u0000src', { kind: 'files', names: ['a.ts', 'b.ts'] });
  });

  // Listing changes are the explorer's business; none of them means an open document
  // is now stale. Saying nothing rather than reporting an empty list: an empty report
  // would have to mean both "nothing concerns you" and "cannot tell you what changed",
  // and it was the second meaning that silently lost.
  it('says nothing to the panel about added, removed or renamed entries', () => {
    dispatchMonitorNotification('fs/delta', {
      target: { pe_id: 'p', relative_path: 'src' },
      changes: [
        { op: 'added', name: 'new.ts', kind: 'file' },
        { op: 'removed', name: 'gone.ts' },
        { op: 'renamed', from: 'old.ts', to: 'renamed.ts' },
      ],
    });

    expect(notifyPreviewWatchChange).not.toHaveBeenCalled();
  });

  // A delta op this build does not know may be the one meaning "contents changed", so
  // it must not be filtered out as irrelevant. Reporting the whole directory costs some
  // unnecessary re-reads; dropping it costs a document that is stale on screen with
  // nothing saying so.
  it('falls back to the whole directory for an op it does not recognise', () => {
    dispatchMonitorNotification('fs/delta', {
      target: { pe_id: 'p', relative_path: 'src' },
      changes: [{ op: 'somethingNewer', name: 'a.ts' }],
    });

    expect(notifyPreviewWatchChange).toHaveBeenCalledWith('p\u0000src', { kind: 'directory', reason: 'unknown-op' });
  });

  // Even mixed with ops it does understand: the recognised names are not the whole
  // story, so narrowing to them would drop whatever the unknown op was reporting.
  it('does not narrow to the recognised names when an unknown op is present', () => {
    dispatchMonitorNotification('fs/delta', {
      target: { pe_id: 'p', relative_path: 'src' },
      changes: [
        { op: 'modified', name: 'a.ts' },
        { op: 'somethingNewer', name: 'b.ts' },
      ],
    });

    expect(notifyPreviewWatchChange).toHaveBeenCalledWith('p\u0000src', { kind: 'directory', reason: 'unknown-op' });
  });

  // A `fs/snapshot` NOTIFICATION is not the initial listing — that comes back in the
  // subscribe response and never reaches this dispatcher. It appears only after the
  // kernel dropped events and the backend rescanned, and that rescan REPLACES the
  // per-file deltas for its window, so ignoring it loses those changes outright rather
  // than delaying them.
  it('treats a fs/snapshot notification as a whole-directory change', () => {
    dispatchMonitorNotification('fs/snapshot', { target: { pe_id: 'p', relative_path: 'src' }, entries: [] });
    expect(notifyPreviewWatchChange).toHaveBeenCalledWith('p\u0000src', { kind: 'directory', reason: 'overflow' });
  });

  // The backend marks those snapshots (`reason: 'overflow'`), but the marker is
  // confirmation rather than the test: a snapshot can only reach this fan-out from an
  // overflow rescan. Requiring the field would make an older backend fail silently,
  // which is the failure mode this change exists to remove.
  it('does not require the backend marker to react', () => {
    dispatchMonitorNotification('fs/snapshot', {
      target: { pe_id: 'p', relative_path: 'src' },
      entries: [],
      reason: 'overflow',
    });
    expect(notifyPreviewWatchChange).toHaveBeenCalledWith('p\u0000src', { kind: 'directory', reason: 'overflow' });
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
