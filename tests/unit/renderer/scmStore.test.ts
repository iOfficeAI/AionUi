/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RPC_ABANDONED,
  RPC_DISCONNECTED,
  RPC_MALFORMED_RESPONSE,
  RPC_RECONNECTED,
  RpcError,
} from '@/renderer/pages/conversation/explorer/monitorClient';
import { resourceKey } from '@/renderer/pages/conversation/SourceControl/scmModel';
import type {
  ScmActionFailure,
  ScmActionKind,
  ScmFileRef,
  ScmRepository,
  ScmResource,
  ScmStatus,
} from '@/renderer/pages/conversation/SourceControl/scmModel';
import type { ScmDiffResult, ScmPort } from '@/renderer/pages/conversation/SourceControl/scmStore';
import {
  applyScmNotification,
  beginScmAction,
  clearScmActionReport,
  closeScmProject,
  finishScmAction,
  getLastScmAction,
  configureScmStore,
  fetchScmDiff,
  getScmInternalsForTest,
  getScmSnapshot,
  onScmReconnect,
  openScmProject,
  refreshAllRepos,
  refreshRepo,
  resetScmStoreForTest,
  runScmAction,
  SCM_ERR_CAPABILITY_UNSUPPORTED,
  SCM_ERR_OPERATION_FAILED,
  SCM_ERR_RESOURCE_BLOCKED,
  selectScmResource,
  setSelectedRepo,
  subscribeScm,
} from '@/renderer/pages/conversation/SourceControl/scmStore';

const repo = (over: Partial<ScmRepository> = {}): ScmRepository => ({
  repo_id: 'scm:pe1',
  provider_id: 'git',
  root: { pe_id: 'pe1', relative_path: '' },
  label: 'aion',
  head: { name: 'main' },
  capabilities: { staging: true, local_branches: true, history_graph: false, remote_ops: false },
  state: 'idle',
  ...over,
});

const resource = (path: string, over: Partial<ScmResource> = {}): ScmResource => ({
  file: { pe_id: 'pe1', relative_path: path },
  repo_relative_path: path,
  state: 'modified',
  staged: false,
  ...over,
});

const status = (repoId: string, seq: number, resources: ScmResource[], over: Partial<ScmStatus> = {}): ScmStatus => ({
  repository: { repo_id: repoId },
  resources,
  seq,
  ...over,
});

type Harness = {
  port: ScmPort;
  listCalls: string[];
  subscribeCalls: string[][];
  unsubscribeCalls: string[][];
  statusCalls: string[];
  diffCalls: unknown[];
  actCalls: Array<{ action: ScmActionKind; params: { repository: string; files: ScmFileRef[] } }>;
  /** Repos returned by `listRepositories`. */
  setRepos: (repos: ScmRepository[]) => void;
  /** First frames returned by `scm/subscribe`, keyed by repo_id. */
  setFirstFrames: (frames: Record<string, ScmStatus>) => void;
  /** Frame returned by an explicit `scm/status` pull, keyed by repo_id. */
  setPullFrames: (frames: Record<string, ScmStatus>) => void;
  failList: (message: string) => void;
  failSubscribe: (message: string) => void;
  failStatus: (message: string) => void;
  /** `failed[]` the next action responds with (empty =全成功). */
  setActFailures: (failures: ScmActionFailure[]) => void;
  /** Make the next action reject with a **protocol** error of this code. */
  failAct: (code: number) => void;
  /**
   * Make the next action reject with a **transport-level** error, exactly as
   * `MonitorClient` constructs it (`transport: true`). Kept separate from
   * `failAct` because the whole point of the fix is that these two are not
   * interchangeable — a harness that blurred them would test nothing.
   */
  failActTransport: (code: number) => void;
};

function makeHarness(): Harness {
  let repos: ScmRepository[] = [];
  let firstFrames: Record<string, ScmStatus> = {};
  let pullFrames: Record<string, ScmStatus> = {};
  let listError: string | null = null;
  let subscribeError: string | null = null;
  let statusError: string | null = null;
  let actFailures: ScmActionFailure[] = [];
  let actErrorCode: number | null = null;
  let actErrorTransport = false;
  const h: Harness = {
    listCalls: [],
    subscribeCalls: [],
    unsubscribeCalls: [],
    statusCalls: [],
    diffCalls: [],
    actCalls: [],
    port: {
      listRepositories: async (projectId) => {
        h.listCalls.push(projectId);
        if (listError) throw new Error(listError);
        return { repositories: repos };
      },
      subscribe: async (repoIds) => {
        h.subscribeCalls.push([...repoIds]);
        if (subscribeError) throw new Error(subscribeError);
        return { statuses: repoIds.map((id) => firstFrames[id]).filter((s): s is ScmStatus => Boolean(s)) };
      },
      unsubscribe: (repoIds) => {
        h.unsubscribeCalls.push([...repoIds]);
      },
      status: async (repoId) => {
        h.statusCalls.push(repoId);
        if (statusError) throw new Error(statusError);
        const frame = pullFrames[repoId];
        if (!frame) throw new Error(`no pull frame for ${repoId}`);
        return frame;
      },
      act: async (action, params) => {
        h.actCalls.push({ action, params });
        if (actErrorCode !== null) {
          throw new RpcError({ code: actErrorCode, message: 'rejected', transport: actErrorTransport });
        }
        return actFailures.length > 0 ? { failed: actFailures } : {};
      },
      diff: async (params) => {
        h.diffCalls.push(params);
        return { patch: 'diff --git a b' } satisfies ScmDiffResult;
      },
    },
    setRepos: (next) => {
      repos = next;
    },
    setFirstFrames: (next) => {
      firstFrames = next;
    },
    setPullFrames: (next) => {
      pullFrames = next;
    },
    setActFailures: (failures) => {
      actFailures = failures;
    },
    failAct: (code) => {
      actErrorCode = code;
      actErrorTransport = false;
    },
    failActTransport: (code) => {
      actErrorCode = code;
      actErrorTransport = true;
    },
    failList: (m) => {
      listError = m;
    },
    failSubscribe: (m) => {
      subscribeError = m;
    },
    failStatus: (m) => {
      statusError = m;
    },
  };
  return h;
}

let h: Harness;

beforeEach(() => {
  resetScmStoreForTest();
  h = makeHarness();
  configureScmStore(h.port);
});

afterEach(() => {
  resetScmStoreForTest();
});

describe('openScmProject', () => {
  it('lists the project repos and subscribes to all of them', async () => {
    h.setRepos([repo(), repo({ repo_id: 'scm:pe2', root: { pe_id: 'pe2', relative_path: '' } })]);
    await openScmProject('p1');

    expect(h.listCalls).toEqual(['p1']);
    expect(h.subscribeCalls).toEqual([['scm:pe1', 'scm:pe2']]);
    expect(getScmSnapshot().repositories.map((r) => r.repo_id)).toEqual(['scm:pe1', 'scm:pe2']);
    expect(getScmSnapshot().loadState).toBe('ready');
  });

  it('applies the first status frames returned by subscribe', async () => {
    h.setRepos([repo()]);
    h.setFirstFrames({ 'scm:pe1': status('scm:pe1', 1, [resource('src/a.ts')]) });
    await openScmProject('p1');

    expect(getScmSnapshot().statuses['scm:pe1'].seq).toBe(1);
    expect(getScmSnapshot().statuses['scm:pe1'].resources).toHaveLength(1);
  });

  it('reports an empty repo list without error when no pe root is a repository', async () => {
    h.setRepos([]);
    await openScmProject('p1');

    expect(getScmSnapshot().repositories).toEqual([]);
    expect(getScmSnapshot().loadState).toBe('ready');
    expect(h.subscribeCalls).toEqual([]); // nothing to subscribe
  });

  it('surfaces a listRepositories failure as an error state', async () => {
    h.failList('backend down');
    await openScmProject('p1');

    expect(getScmSnapshot().loadState).toBe('error');
    expect(getScmSnapshot().error).toBe('backend down');
  });

  it('keeps the panel usable when subscribe fails (list already applied)', async () => {
    h.setRepos([repo()]);
    h.failSubscribe('socket closed');
    await openScmProject('p1');

    expect(getScmSnapshot().loadState).toBe('ready');
    expect(getScmSnapshot().statuses).toEqual({});
  });

  it('is a no-op when re-opening the SAME project (container remount must not re-subscribe)', async () => {
    h.setRepos([repo()]);
    h.setFirstFrames({ 'scm:pe1': status('scm:pe1', 5, [resource('src/a.ts')]) });
    await openScmProject('p1');
    await openScmProject('p1');

    expect(h.listCalls).toEqual(['p1']); // not listed twice
    expect(h.subscribeCalls).toHaveLength(1); // not re-subscribed
    expect(getScmSnapshot().statuses['scm:pe1'].seq).toBe(5); // warm status survived
  });

  it('releases the previous project subscriptions when switching project', async () => {
    h.setRepos([repo()]);
    await openScmProject('p1');
    h.setRepos([repo({ repo_id: 'scm:pe9', root: { pe_id: 'pe9', relative_path: '' } })]);
    await openScmProject('p2');

    expect(h.unsubscribeCalls).toEqual([['scm:pe1']]);
    expect(getScmInternalsForTest().subscribed).toEqual(['scm:pe9']);
  });

  it('errors when no port is configured', async () => {
    resetScmStoreForTest();
    await openScmProject('p1');
    expect(getScmSnapshot().loadState).toBe('error');
  });
});

describe('seq guard (out-of-order refresh protection)', () => {
  beforeEach(async () => {
    h.setRepos([repo()]);
    h.setFirstFrames({ 'scm:pe1': status('scm:pe1', 2, [resource('src/a.ts')]) });
    await openScmProject('p1');
  });

  it('applies a NEWER frame', () => {
    applyScmNotification('scm/statusChanged', status('scm:pe1', 3, [resource('src/b.ts')]));

    expect(getScmSnapshot().statuses['scm:pe1'].seq).toBe(3);
    expect(getScmSnapshot().statuses['scm:pe1'].resources[0].repo_relative_path).toBe('src/b.ts');
  });

  it('DISCARDS an older frame instead of repainting the panel back to stale truth', () => {
    // The action-triggered refresh (seq 2) and the watch-triggered refresh are two
    // async sources; a late seq-1 frame must not overwrite seq 2.
    applyScmNotification('scm/statusChanged', status('scm:pe1', 1, [resource('stale.ts')]));

    expect(getScmSnapshot().statuses['scm:pe1'].seq).toBe(2);
    expect(getScmSnapshot().statuses['scm:pe1'].resources[0].repo_relative_path).toBe('src/a.ts');
  });

  it('DISCARDS a duplicate frame with the same seq', () => {
    applyScmNotification('scm/statusChanged', status('scm:pe1', 2, [resource('duplicate.ts')]));

    expect(getScmSnapshot().statuses['scm:pe1'].resources[0].repo_relative_path).toBe('src/a.ts');
  });

  it('does not notify subscribers for a discarded frame', () => {
    const listener = vi.fn();
    subscribeScm(listener);
    applyScmNotification('scm/statusChanged', status('scm:pe1', 1, []));
    expect(listener).not.toHaveBeenCalled();
  });

  it('tracks seq per repo (a high seq on one repo does not block another)', async () => {
    h.setRepos([repo(), repo({ repo_id: 'scm:pe2', root: { pe_id: 'pe2', relative_path: '' } })]);
    h.setFirstFrames({
      'scm:pe1': status('scm:pe1', 100, []),
      'scm:pe2': status('scm:pe2', 1, []),
    });
    await openScmProject('p2');

    applyScmNotification('scm/statusChanged', status('scm:pe2', 2, [resource('x.ts')]));
    expect(getScmSnapshot().statuses['scm:pe2'].seq).toBe(2);
    expect(getScmInternalsForTest().appliedSeq).toEqual({ 'scm:pe1': 100, 'scm:pe2': 2 });
  });

  it('drops a push for a repo this connection is not subscribed to', () => {
    applyScmNotification('scm/statusChanged', status('scm:other', 9, [resource('leak.ts')]));
    expect(getScmSnapshot().statuses['scm:other']).toBeUndefined();
  });

  it('ignores a malformed push with no repository', () => {
    expect(() => applyScmNotification('scm/statusChanged', { seq: 9, resources: [] })).not.toThrow();
    expect(getScmSnapshot().statuses['scm:pe1'].seq).toBe(2);
  });

  it('ignores an unknown notification method', () => {
    expect(() => applyScmNotification('scm/somethingNew', { anything: true })).not.toThrow();
  });
});

describe('degraded / truncated frames are carried through untouched', () => {
  it('exposes degraded and truncated so the panel can warn without treating it as an error', async () => {
    h.setRepos([repo()]);
    h.setFirstFrames({
      'scm:pe1': status('scm:pe1', 1, [resource('a.ts')], { degraded: true, truncated: true }),
    });
    await openScmProject('p1');

    const applied = getScmSnapshot().statuses['scm:pe1'];
    expect(applied.degraded).toBe(true);
    expect(applied.truncated).toBe(true);
    expect(getScmSnapshot().loadState).toBe('ready'); // degraded is NOT an error
  });
});

describe('scm/repositoriesChanged', () => {
  beforeEach(async () => {
    h.setRepos([repo()]);
    await openScmProject('p1');
  });

  it('adds a new repo and subscribes to it', async () => {
    const added = repo({ repo_id: 'scm:pe2', root: { pe_id: 'pe2', relative_path: '' } });
    applyScmNotification('scm/repositoriesChanged', { project_id: 'p1', added: [added] });
    await vi.waitFor(() => expect(h.subscribeCalls).toHaveLength(2));

    expect(getScmSnapshot().repositories.map((r) => r.repo_id)).toEqual(['scm:pe1', 'scm:pe2']);
    expect(h.subscribeCalls[1]).toEqual(['scm:pe2']);
  });

  it('removes a repo along with its status and seq high-water mark', () => {
    applyScmNotification('scm/statusChanged', status('scm:pe1', 7, [resource('a.ts')]));
    applyScmNotification('scm/repositoriesChanged', { project_id: 'p1', removed: ['scm:pe1'] });

    expect(getScmSnapshot().repositories).toEqual([]);
    expect(getScmSnapshot().statuses['scm:pe1']).toBeUndefined();
    // Clearing the seq matters: a re-added repo restarts its seq at 1, and a
    // leftover high-water mark would discard every fresh frame forever.
    expect(getScmInternalsForTest().appliedSeq['scm:pe1']).toBeUndefined();
    expect(getScmInternalsForTest().subscribed).not.toContain('scm:pe1');
  });

  it('updates head/state metadata for a changed repo', () => {
    applyScmNotification('scm/repositoriesChanged', {
      project_id: 'p1',
      changed: [repo({ head: { name: 'feature' }, state: 'refreshing' })],
    });

    expect(getScmSnapshot().repositories[0].head?.name).toBe('feature');
    expect(getScmSnapshot().repositories[0].state).toBe('refreshing');
  });

  it('does not resurrect a repo that is only in `changed` and not currently listed', () => {
    applyScmNotification('scm/repositoriesChanged', {
      project_id: 'p1',
      changed: [repo({ repo_id: 'scm:ghost', root: { pe_id: 'ghost', relative_path: '' } })],
    });
    expect(getScmSnapshot().repositories.map((r) => r.repo_id)).toEqual(['scm:pe1']);
  });

  it('ignores an undefined payload', () => {
    expect(() => applyScmNotification('scm/repositoriesChanged', undefined)).not.toThrow();
  });

  it('drops a frame addressed to a different project without touching the store (Design-Z guard)', () => {
    // A multi-project session shares one notification stream while this store holds a
    // single project. A frame carrying another project's `project_id` must be dropped
    // before any mutation, or its added/removed would corrupt the current view.
    applyScmNotification('scm/statusChanged', status('scm:pe1', 5, [resource('a.ts')]));
    setSelectedRepo('scm:pe1');
    const beforeRepos = getScmSnapshot().repositories.map((r) => r.repo_id);
    const beforeStatus = getScmSnapshot().statuses['scm:pe1'];
    h.subscribeCalls.length = 0;

    // Maximal would-be corruption: this frame both ADDS scm:pe2 and REMOVES the
    // currently-shown scm:pe1. Because `project_id` is not the open project, the guard
    // drops it and none of that happens.
    applyScmNotification('scm/repositoriesChanged', {
      project_id: 'other-project',
      added: [repo({ repo_id: 'scm:pe2', root: { pe_id: 'pe2', relative_path: '' } })],
      removed: ['scm:pe1'],
    });

    expect(getScmSnapshot().repositories.map((r) => r.repo_id)).toEqual(beforeRepos); // still ['scm:pe1']
    expect(getScmSnapshot().statuses['scm:pe1']).toBe(beforeStatus); // status not dropped
    expect(getScmSnapshot().selectedRepoId).toBe('scm:pe1'); // selection not reset by the foreign removal
    expect(h.subscribeCalls).toEqual([]); // the foreign added repo was never subscribed
  });
});

describe('head enrichment carried on a status frame (terminal checkout branch sync)', () => {
  beforeEach(async () => {
    h.setRepos([repo()]); // head: { name: 'main' }
    h.setFirstFrames({ 'scm:pe1': status('scm:pe1', 1, [resource('a.ts')]) });
    await openScmProject('p1');
  });

  it("mirrors a status frame's head onto the repository so the branch display updates", () => {
    // A terminal `git checkout feature` triggers only a status push (no repositoriesChanged
    // frame). The branch display reads repo.head off `repositories`, so the store must copy
    // the frame's head there or the panel would keep showing the stale branch.
    applyScmNotification('scm/statusChanged', status('scm:pe1', 2, [resource('a.ts')], { head: { name: 'feature' } }));

    expect(getScmSnapshot().repositories[0].head?.name).toBe('feature');
  });

  it('leaves the known head untouched when the frame omits head (open-set optional)', () => {
    applyScmNotification('scm/statusChanged', status('scm:pe1', 2, [resource('a.ts')]));

    expect(getScmSnapshot().repositories[0].head?.name).toBe('main');
  });

  it('does not resurrect head for an unknown repo (no matching repositories entry)', () => {
    // A head enrichment for a repo the store never learned about must be a no-op, not
    // create a phantom repositories entry.
    applyScmNotification('scm/statusChanged', status('scm:ghost', 1, [], { head: { name: 'x' } }));

    expect(getScmSnapshot().repositories.map((r) => r.repo_id)).toEqual(['scm:pe1']);
  });

  it('ignores a stale-seq frame before it can mutate head (seq guard runs first)', () => {
    applyScmNotification('scm/statusChanged', status('scm:pe1', 5, [resource('a.ts')], { head: { name: 'feature' } }));
    // Late, lower-seq frame carrying a different head must be dropped whole — head included.
    applyScmNotification('scm/statusChanged', status('scm:pe1', 3, [resource('a.ts')], { head: { name: 'stale' } }));

    expect(getScmSnapshot().repositories[0].head?.name).toBe('feature');
  });
});

describe('manual / focus refresh (scm/status)', () => {
  beforeEach(async () => {
    h.setRepos([repo()]);
    h.setFirstFrames({ 'scm:pe1': status('scm:pe1', 1, [resource('a.ts')]) });
    await openScmProject('p1');
  });

  it('applies a pulled frame under the same seq guard', async () => {
    h.setPullFrames({ 'scm:pe1': status('scm:pe1', 4, [resource('fresh.ts')]) });
    await refreshRepo('scm:pe1');

    expect(h.statusCalls).toEqual(['scm:pe1']);
    expect(getScmSnapshot().statuses['scm:pe1'].resources[0].repo_relative_path).toBe('fresh.ts');
  });

  it('discards a pulled frame that is older than what is applied', async () => {
    applyScmNotification('scm/statusChanged', status('scm:pe1', 10, [resource('newest.ts')]));
    h.setPullFrames({ 'scm:pe1': status('scm:pe1', 3, [resource('older.ts')]) });
    await refreshRepo('scm:pe1');

    expect(getScmSnapshot().statuses['scm:pe1'].resources[0].repo_relative_path).toBe('newest.ts');
  });

  it('keeps the last good frame on screen when the pull fails', async () => {
    h.failStatus('index.lock held');
    await refreshRepo('scm:pe1');

    expect(getScmSnapshot().statuses['scm:pe1'].resources[0].repo_relative_path).toBe('a.ts');
  });

  it('refreshes every subscribed repo on a focus refresh', async () => {
    h.setRepos([repo(), repo({ repo_id: 'scm:pe2', root: { pe_id: 'pe2', relative_path: '' } })]);
    await openScmProject('p2');
    h.statusCalls.length = 0;
    h.setPullFrames({ 'scm:pe1': status('scm:pe1', 1, []), 'scm:pe2': status('scm:pe2', 1, []) });
    await refreshAllRepos();

    expect(h.statusCalls.toSorted()).toEqual(['scm:pe1', 'scm:pe2']);
  });
});

describe('subscription lifetime is project-scoped, not tab-scoped', () => {
  it('keeps the subscription and cache when the Changes tab is hidden and shown again', async () => {
    h.setRepos([repo()]);
    h.setFirstFrames({ 'scm:pe1': status('scm:pe1', 3, [resource('a.ts')]) });
    await openScmProject('p1');

    // Switching tabs is purely a render concern — no store call happens. What must
    // hold is that nothing was released and, on switching back, the panel's mount
    // effect (openScmProject with the same id) neither unsubscribes nor refetches.
    await openScmProject('p1');

    expect(h.unsubscribeCalls).toEqual([]);
    expect(getScmInternalsForTest().subscribed).toEqual(['scm:pe1']);
    expect(getScmSnapshot().statuses['scm:pe1'].seq).toBe(3);
  });

  it('releases everything on closeScmProject (project closed)', async () => {
    h.setRepos([repo()]);
    h.setFirstFrames({ 'scm:pe1': status('scm:pe1', 3, []) });
    await openScmProject('p1');
    closeScmProject();

    expect(h.unsubscribeCalls).toEqual([['scm:pe1']]);
    expect(getScmSnapshot().statuses).toEqual({});
    expect(getScmSnapshot().repositories).toEqual([]);
    expect(getScmInternalsForTest().subscribed).toEqual([]);
  });
});

describe('reconnect', () => {
  it('re-declares subscriptions for the known repos', async () => {
    h.setRepos([repo()]);
    await openScmProject('p1');
    h.subscribeCalls.length = 0;

    onScmReconnect();
    await vi.waitFor(() => expect(h.subscribeCalls).toEqual([['scm:pe1']]));
  });

  it('clears the seq high-water mark so a restarted backend is not permanently stale', async () => {
    h.setRepos([repo()]);
    h.setFirstFrames({ 'scm:pe1': status('scm:pe1', 42, [resource('old.ts')]) });
    await openScmProject('p1');

    // A restarted backend restarts seq at 1. Keeping 42 would discard every frame.
    h.setFirstFrames({ 'scm:pe1': status('scm:pe1', 1, [resource('after-restart.ts')]) });
    onScmReconnect();
    await vi.waitFor(() =>
      expect(getScmSnapshot().statuses['scm:pe1'].resources[0].repo_relative_path).toBe('after-restart.ts')
    );
  });

  it('does nothing when no project is open', () => {
    expect(() => onScmReconnect()).not.toThrow();
    expect(h.subscribeCalls).toEqual([]);
  });
});

describe('resource selection + diff', () => {
  it('tracks the selected row key', () => {
    selectScmResource('pe1\0src/a.ts\0u');
    expect(getScmSnapshot().selectedResource).toBe('pe1\0src/a.ts\0u');
    selectScmResource(null);
    expect(getScmSnapshot().selectedResource).toBeNull();
  });

  it('passes diff params through to the port verbatim', async () => {
    const params = {
      repository: 'scm:pe1',
      file: { pe_id: 'pe1', relative_path: 'src/a.ts' },
      from: 'committed' as const,
      to: 'working' as const,
    };
    await expect(fetchScmDiff(params)).resolves.toEqual({ patch: 'diff --git a b' });
    expect(h.diffCalls).toEqual([params]);
  });

  it('rejects a diff request when no port is configured', async () => {
    resetScmStoreForTest();
    await expect(
      fetchScmDiff({
        repository: 'scm:pe1',
        file: { pe_id: 'pe1', relative_path: 'a.ts' },
        from: 'committed',
        to: 'working',
      })
    ).rejects.toThrow(/not configured/);
  });
});

describe('setSelectedRepo (front-end repo switch, D2丙)', () => {
  const twoRepos = async (): Promise<void> => {
    h.setRepos([repo(), repo({ repo_id: 'scm:pe2', root: { pe_id: 'pe2', relative_path: '' } })]);
    await openScmProject('p1');
  };

  it('defaults selectedRepoId to null on open (the view resolves that to the first repo)', async () => {
    await twoRepos();
    expect(getScmSnapshot().selectedRepoId).toBeNull();
  });

  it('records the chosen repo', async () => {
    await twoRepos();
    setSelectedRepo('scm:pe2');
    expect(getScmSnapshot().selectedRepoId).toBe('scm:pe2');
  });

  it('clears the open diff on an actual switch — the selection belonged to the other repo', async () => {
    await twoRepos();
    selectScmResource('pe1\0src/a.ts\0u');
    setSelectedRepo('scm:pe2');
    expect(getScmSnapshot().selectedResource).toBeNull();
  });

  it('is a no-op for the same id (does not clear a selection made within the same repo)', async () => {
    await twoRepos();
    setSelectedRepo('scm:pe2');
    selectScmResource('pe2\0b.ts\0u');
    setSelectedRepo('scm:pe2'); // same repo again
    expect(getScmSnapshot().selectedResource).toBe('pe2\0b.ts\0u');
  });

  it('resets selectedRepoId to null when the SELECTED repo is removed (no stale id, no resurrection)', async () => {
    await twoRepos();
    setSelectedRepo('scm:pe2');
    applyScmNotification('scm/repositoriesChanged', { project_id: 'p1', removed: ['scm:pe2'] });
    // Not left pointing at the removed repo — so a later re-add of scm:pe2 will not
    // silently jump the view back to it.
    expect(getScmSnapshot().selectedRepoId).toBeNull();
    expect(getScmSnapshot().selectedResource).toBeNull();
  });

  it('leaves the selection untouched when a DIFFERENT repo is removed', async () => {
    await twoRepos();
    setSelectedRepo('scm:pe2');
    applyScmNotification('scm/repositoriesChanged', { project_id: 'p1', removed: ['scm:pe1'] });
    expect(getScmSnapshot().selectedRepoId).toBe('scm:pe2');
  });
});

describe('runScmAction', () => {
  const unstagedRow = resource('src/a.ts', { staged: false });
  const stagedRow = resource('src/a.ts', { staged: true });

  it('sends the wire params the backend expects and reports ok when nothing failed', async () => {
    const outcome = await runScmAction('stage', 'scm:pe1', [unstagedRow]);

    expect(h.actCalls).toEqual([
      { action: 'stage', params: { repository: 'scm:pe1', files: [{ pe_id: 'pe1', relative_path: 'src/a.ts' }] } },
    ]);
    expect(outcome).toEqual({ kind: 'ok', action: 'stage', total: 1 });
  });

  it('treats an omitted `failed` as complete success (old-shape response)', async () => {
    h.setActFailures([]);
    await expect(runScmAction('unstage', 'scm:pe1', [stagedRow])).resolves.toMatchObject({ kind: 'ok' });
  });

  it('reports PARTIAL — not failure — when some files failed', async () => {
    // The files NOT listed were really changed. Calling this a failure would invite
    // a retry that re-applies the action to files already done.
    h.setActFailures([{ file: { pe_id: 'pe1', relative_path: 'src/a.ts' }, reason: 'move to trash failed: x' }]);
    const outcome = await runScmAction('discard', 'scm:pe1', [unstagedRow, resource('src/b.ts', { staged: false })]);

    expect(outcome.kind).toBe('partial');
    if (outcome.kind !== 'partial') throw new Error('expected partial');
    expect(outcome.total).toBe(2);
    expect(outcome.failed).toHaveLength(1);
  });

  it('attributes a partial failure to the row on the action’s side', async () => {
    // Both sides of one path are in the store; discard acts on the unstaged side.
    h.setActFailures([{ file: { pe_id: 'pe1', relative_path: 'src/a.ts' }, reason: 'io' }]);
    const outcome = await runScmAction('discard', 'scm:pe1', [stagedRow, unstagedRow]);

    if (outcome.kind !== 'partial') throw new Error('expected partial');
    expect(outcome.failedRowKeys).toEqual([resourceKey(unstagedRow)]);
    expect(outcome.failedRowKeys).not.toContain(resourceKey(stagedRow));
  });

  it('marks a -32051 rejection as retryable (it ran and broke)', async () => {
    h.failAct(SCM_ERR_OPERATION_FAILED);
    const outcome = await runScmAction('stage', 'scm:pe1', [unstagedRow]);

    expect(outcome).toMatchObject({ kind: 'rejected', code: SCM_ERR_OPERATION_FAILED, retryable: true });
  });

  it('marks a -32053 rejection as NOT retryable (blocked until the user resolves it)', async () => {
    // Retrying a blocked resource can never succeed — offering a retry would lie.
    h.failAct(SCM_ERR_RESOURCE_BLOCKED);
    const outcome = await runScmAction('discard', 'scm:pe1', [unstagedRow]);

    expect(outcome).toMatchObject({ kind: 'rejected', code: SCM_ERR_RESOURCE_BLOCKED, retryable: false });
  });

  it('marks a -32052 rejection as NOT retryable (static provider property)', async () => {
    h.failAct(SCM_ERR_CAPABILITY_UNSUPPORTED);
    const outcome = await runScmAction('stage', 'scm:pe1', [unstagedRow]);

    expect(outcome).toMatchObject({ kind: 'rejected', retryable: false });
  });

  it('does not mutate the store — the pushed statusChanged frame stays the only truth', async () => {
    h.setRepos([repo()]);
    h.setFirstFrames({ 'scm:pe1': status('scm:pe1', 1, [unstagedRow]) });
    await openScmProject('p1');
    const before = getScmSnapshot().statuses['scm:pe1'];

    await runScmAction('stage', 'scm:pe1', [unstagedRow]);
    expect(getScmSnapshot().statuses['scm:pe1']).toBe(before); // identical reference

    // The refresh the backend pushes after the action is what updates the panel.
    applyScmNotification('scm/statusChanged', status('scm:pe1', 2, [stagedRow]));
    expect(getScmSnapshot().statuses['scm:pe1'].resources[0].staged).toBe(true);
  });

  it('rejects without a port instead of throwing', async () => {
    resetScmStoreForTest();
    await expect(runScmAction('stage', 'scm:pe1', [unstagedRow])).resolves.toMatchObject({
      kind: 'rejected',
      retryable: false,
    });
  });
});

describe('transport failures are NOT reported as rejections', () => {
  const row = resource('src/a.ts', { staged: false });

  it('classifies RPC_RECONNECTED as `unknown`/no-answer — the action may have run', async () => {
    // The request went out and the connection reset before the reply. The front end
    // CANNOT know whether the backend executed it, so it must not claim "rejected"
    // (which the UI words as "nothing happened" and invites a redo — for a discard
    // that is a second irreversible destruction).
    h.failActTransport(RPC_RECONNECTED);
    const outcome = await runScmAction('discard', 'scm:pe1', [row]);

    expect(outcome).toEqual({ kind: 'unknown', action: 'discard', total: 1, reason: 'no-answer' });
  });

  it('classifies RPC_DISCONNECTED as `unknown`/not-sent — nothing ran', async () => {
    // The frame never reached the socket, so "nothing happened" IS accurate here.
    h.failActTransport(RPC_DISCONNECTED);
    const outcome = await runScmAction('stage', 'scm:pe1', [row]);

    expect(outcome).toEqual({ kind: 'unknown', action: 'stage', total: 1, reason: 'not-sent' });
  });

  it('classifies a malformed response as `unknown`/no-answer', async () => {
    h.failActTransport(RPC_MALFORMED_RESPONSE);
    const outcome = await runScmAction('discard', 'scm:pe1', [row]);
    expect(outcome).toMatchObject({ kind: 'unknown', reason: 'no-answer' });
  });

  it('still reports a genuine protocol error as `rejected`', async () => {
    // The discriminator is the `transport` flag, not the numeric range — a protocol
    // code must keep its rejected/retryable semantics.
    h.failAct(SCM_ERR_OPERATION_FAILED);
    const outcome = await runScmAction('stage', 'scm:pe1', [row]);
    expect(outcome).toMatchObject({ kind: 'rejected', retryable: true });
  });

  it('does not mistake a transport pseudo-code for a protocol code by its sign', async () => {
    // -1..-4 and -32051.. share one `code` field. Guessing by range would break the
    // moment either side adds a code; the flag is authoritative.
    h.failActTransport(RPC_ABANDONED);
    const outcome = await runScmAction('unstage', 'scm:pe1', [row]);
    expect(outcome.kind).toBe('unknown');
  });
});

describe('store-level action state survives the panel unmounting', () => {
  it('keeps the report until explicitly cleared', async () => {
    h.setActFailures([{ file: { pe_id: 'pe1', relative_path: 'a.ts' }, reason: 'io' }]);
    beginScmAction('stage', 'scm:pe1', [resource('a.ts', { staged: false })]);
    expect(getScmSnapshot().actionBusy).toBe(true);

    finishScmAction({ tone: 'warning', message: 'partial', failedRowKeys: [], retryable: false });
    expect(getScmSnapshot().actionBusy).toBe(false);
    expect(getScmSnapshot().actionReport?.message).toBe('partial');

    clearScmActionReport();
    expect(getScmSnapshot().actionReport).toBeNull();
  });

  it('remembers the last action so retry works after a remount', () => {
    const rows = [resource('a.ts', { staged: false })];
    beginScmAction('discard', 'scm:pe1', rows);
    expect(getLastScmAction()).toEqual({ action: 'discard', repoId: 'scm:pe1', resources: rows });
  });

  it('drops the report when switching project (never shown against another project)', async () => {
    h.setRepos([repo()]);
    await openScmProject('p1');
    finishScmAction({ tone: 'warning', message: 'p1 partial', failedRowKeys: [], retryable: false });

    h.setRepos([]);
    await openScmProject('p2');
    expect(getScmSnapshot().actionReport).toBeNull();
    expect(getLastScmAction()).toBeNull();
  });

  it('drops the report on closeScmProject', async () => {
    h.setRepos([repo()]);
    await openScmProject('p1');
    finishScmAction({ tone: 'error', message: 'x', failedRowKeys: [], retryable: false });
    closeScmProject();
    expect(getScmSnapshot().actionReport).toBeNull();
  });
});

describe('A-1: a self-contradictory repositoriesChanged frame', () => {
  const other = repo({ repo_id: 'scm:pe2', root: { pe_id: 'pe2', relative_path: '' } });

  beforeEach(async () => {
    h.setRepos([repo()]);
    h.setFirstFrames({ 'scm:pe1': status('scm:pe1', 3, [resource('a.ts')]) });
    await openScmProject('p1');
  });

  it('lets removal win when the same repo is both removed and re-added', () => {
    // Honouring both is impossible: whichever order won, part of the bookkeeping
    // (status / seq / subscription) would disagree with `repositories`, leaving a
    // repo on screen that has no status and no subscription — a panel that looks
    // fine but never populates.
    applyScmNotification('scm/repositoriesChanged', { project_id: 'p1', removed: ['scm:pe1'], added: [repo()] });

    expect(getScmSnapshot().repositories).toEqual([]);
    expect(getScmSnapshot().statuses['scm:pe1']).toBeUndefined();
    expect(getScmInternalsForTest().appliedSeq['scm:pe1']).toBeUndefined();
    expect(getScmInternalsForTest().subscribed).not.toContain('scm:pe1');
  });

  it('does NOT re-subscribe a repo it just removed', () => {
    // `missing` is computed from the post-removal list; computing it before the
    // removal would re-declare a repo the backend has just released.
    h.subscribeCalls.length = 0;
    applyScmNotification('scm/repositoriesChanged', { project_id: 'p1', removed: ['scm:pe1'], added: [repo()] });

    expect(h.subscribeCalls).toEqual([]);
  });

  it('warns about the contradiction instead of resolving it silently', () => {
    // Without this, the only symptom is a repo that never loads and nothing in the
    // log to explain why.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    applyScmNotification('scm/repositoriesChanged', { project_id: 'p1', removed: ['scm:pe1'], changed: [repo()] });

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('both removed and added/changed');
    warn.mockRestore();
  });

  it('does not warn for an ordinary frame', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    applyScmNotification('scm/repositoriesChanged', { project_id: 'p1', added: [other] });
    applyScmNotification('scm/repositoriesChanged', { project_id: 'p1', removed: ['scm:pe2'] });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('still subscribes a genuinely new repo in the same frame as an unrelated removal', async () => {
    // The contradiction guard must not block the normal add path.
    h.subscribeCalls.length = 0;
    applyScmNotification('scm/repositoriesChanged', { project_id: 'p1', removed: ['scm:pe1'], added: [other] });

    await vi.waitFor(() => expect(h.subscribeCalls).toEqual([['scm:pe2']]));
    expect(getScmSnapshot().repositories.map((r) => r.repo_id)).toEqual(['scm:pe2']);
  });
});
