import { beforeEach, describe, expect, it } from 'vitest';

import type { DirRef, Entry, PeKey, TreeNode } from '@/renderer/pages/conversation/explorer/explorerModel';
import { peKey, refToKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import type { MonitorPort } from '@/renderer/pages/conversation/explorer/explorerStore';
import {
  applyMonitorNotification,
  configureExplorerStore,
  getExplorerInternalsForTest,
  getExplorerSnapshot,
  onReconnect,
  openProject,
  resetExplorerStoreForTest,
  reveal,
  select,
  setExpanded,
  setExpandedKeys,
} from '@/renderer/pages/conversation/explorer/explorerStore';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const dir = (name: string): Entry => ({ name, kind: 'dir' });
const file = (name: string): Entry => ({ name, kind: 'file' });

type PortHarness = {
  port: MonitorPort;
  subscribed: DirRef[][];
  unsubscribed: DirRef[][];
};

function makePort(snapshots: Record<PeKey, Entry[]> = {}): PortHarness {
  const subscribed: DirRef[][] = [];
  const unsubscribed: DirRef[][] = [];
  return {
    subscribed,
    unsubscribed,
    port: {
      subscribe: async (refs) => {
        subscribed.push(refs);
        return { snapshots: refs.map((r) => ({ target: r, entries: snapshots[refToKey(r)] ?? [] })) };
      },
      unsubscribe: (refs) => {
        unsubscribed.push(refs);
      },
    },
  };
}

type DeferredPortHarness = {
  port: MonitorPort;
  subscribed: DirRef[][];
  unsubscribed: DirRef[][];
  /** Resolve the oldest still-pending subscribe() call (FIFO). */
  resolveNext: () => void;
  pendingCount: () => number;
};

/**
 * Like makePort but subscribe() returns a promise that only settles when the
 * test calls resolveNext() — lets a test interleave state changes (e.g. a
 * collapse) *between* a subscribe going out and its snapshot coming back, to
 * exercise the in-flight `stillWant` guard in runReconcile's `.then`.
 */
function makeDeferredPort(snapshots: Record<PeKey, Entry[]> = {}): DeferredPortHarness {
  const subscribed: DirRef[][] = [];
  const unsubscribed: DirRef[][] = [];
  const resolvers: Array<() => void> = [];
  return {
    subscribed,
    unsubscribed,
    resolveNext: () => {
      const r = resolvers.shift();
      if (!r) throw new Error('resolveNext: no pending subscribe');
      r();
    },
    pendingCount: () => resolvers.length,
    port: {
      subscribe: (refs) =>
        new Promise((resolve) => {
          subscribed.push(refs);
          resolvers.push(() =>
            resolve({ snapshots: refs.map((r) => ({ target: r, entries: snapshots[refToKey(r)] ?? [] })) })
          );
        }),
      unsubscribe: (refs) => {
        unsubscribed.push(refs);
      },
    },
  };
}

const roots = [{ pe_id: 'pe1', title: 'app' }];
const childNames = (tree: TreeNode[], key: PeKey): string[] | undefined => {
  const find = (nodes: TreeNode[]): TreeNode | undefined => {
    for (const n of nodes) {
      if (n.key === key) return n;
      if (n.children) {
        const hit = find(n.children);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return find(tree)?.children?.map((c) => c.title);
};

beforeEach(() => {
  resetExplorerStoreForTest();
  localStorage.clear();
});

describe('openProject + reconcile', () => {
  it('subscribes the root and applies its snapshot into the tree', async () => {
    const h = makePort({ [peKey('pe1', '')]: [dir('src'), file('README.md')] });
    configureExplorerStore(h.port);

    openProject('proj1', roots);
    await flush();

    // One batched subscribe for the root.
    expect(h.subscribed).toEqual([[{ pe_id: 'pe1', relative_path: '' }]]);
    // Snapshot landed in the tree.
    expect(childNames(getExplorerSnapshot().treeData, peKey('pe1', ''))).toEqual(['src', 'README.md']);
  });
});

describe('reconcile batching (per-tick merge)', () => {
  it('merges multiple expands in one tick into a single subscribe batch', async () => {
    const h = makePort({
      [peKey('pe1', '')]: [dir('a')],
      [peKey('pe1', 'a')]: [dir('b')],
    });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    h.subscribed.length = 0; // ignore the initial root subscribe

    // Two expands in the same synchronous tick → one reconcile.
    setExpanded(peKey('pe1', 'a'), true);
    setExpanded(peKey('pe1', 'b'), true); // not visible yet (a's snapshot pending) but expanded
    await flush();

    expect(h.subscribed.length).toBe(1);
  });
});

describe('collapse keeps descendant marks but unsubscribes', () => {
  it('unsubscribes a collapsed dir; re-expand re-subscribes without re-expanding child', async () => {
    const h = makePort({
      [peKey('pe1', '')]: [dir('a')],
      [peKey('pe1', 'a')]: [dir('b')],
      [peKey('pe1', 'a/b')]: [file('deep.ts')],
    });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    setExpanded(peKey('pe1', 'a'), true);
    await flush();
    setExpanded(peKey('pe1', 'a/b'), true);
    await flush();
    h.unsubscribed.length = 0;
    h.subscribed.length = 0;

    // Collapse 'a': 'a' and 'a/b' both leave want (a/b no longer visible).
    setExpanded(peKey('pe1', 'a'), false);
    await flush();
    const removed = h.unsubscribed.flat().map(refToKey);
    expect(removed).toContain(peKey('pe1', 'a'));
    expect(removed).toContain(peKey('pe1', 'a/b'));

    // Re-expand 'a': 'a/b' mark was kept → both come back in one reconcile.
    setExpanded(peKey('pe1', 'a'), true);
    await flush();
    const readded = h.subscribed.flat().map(refToKey);
    expect(readded).toContain(peKey('pe1', 'a'));
    expect(readded).toContain(peKey('pe1', 'a/b'));
  });
});

describe('server delta application + guard', () => {
  it('applies fs/delta added into the cache', async () => {
    const h = makePort({ [peKey('pe1', '')]: [file('a.ts')] });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();

    applyMonitorNotification('fs/delta', {
      target: { pe_id: 'pe1', relative_path: '' },
      changes: [{ op: 'added', name: 'b.ts', kind: 'file' }],
    });
    expect(childNames(getExplorerSnapshot().treeData, peKey('pe1', ''))?.toSorted()).toEqual(['a.ts', 'b.ts']);
  });

  it('drops in-flight residue for a just-unsubscribed dir without touching the three structures (guard)', async () => {
    const h = makePort({ [peKey('pe1', '')]: [dir('a')], [peKey('pe1', 'a')]: [file('x.ts')] });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    setExpanded(peKey('pe1', 'a'), true);
    await flush();

    // Collapse 'a' → it leaves want → unsubscribe sent; 'a' drops from expanded + current.
    setExpanded(peKey('pe1', 'a'), false);
    await flush();
    const before = getExplorerInternalsForTest();
    expect(before.current).not.toContain(peKey('pe1', 'a')); // unsubscribed (current pruned)
    expect(before.expanded).not.toContain(peKey('pe1', 'a'));

    // A delta + snapshot for the just-unsubscribed 'a' arrive in flight (the
    // backend unwatched but a frame was already on the wire) → ∉ want → dropped.
    applyMonitorNotification('fs/delta', {
      target: { pe_id: 'pe1', relative_path: 'a' },
      changes: [{ op: 'added', name: 'sneaky.ts', kind: 'file' }],
    });
    applyMonitorNotification('fs/snapshot', {
      target: { pe_id: 'pe1', relative_path: 'a' },
      entries: [{ name: 'ghost.ts', kind: 'file' }],
    });

    // All three structures (cache / expanded / current) unchanged by the residue.
    const after = getExplorerInternalsForTest();
    expect(after).toEqual(before);
  });
});

describe('anti-stale: removed cascade (end-to-end, three structures)', () => {
  it('clears the removed dir subtree from cache + expanded + current, keeping siblings', async () => {
    const h = makePort({
      [peKey('pe1', '')]: [dir('a'), dir('keep')],
      [peKey('pe1', 'a')]: [dir('b')],
      [peKey('pe1', 'a/b')]: [file('deep.ts')],
      [peKey('pe1', 'keep')]: [],
    });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    setExpanded(peKey('pe1', 'a'), true);
    await flush();
    setExpanded(peKey('pe1', 'a/b'), true);
    await flush();
    setExpanded(peKey('pe1', 'keep'), true);
    await flush();

    // Precondition: the deep subtree is present in all three structures.
    const before = getExplorerInternalsForTest();
    expect(before.expanded).toEqual(expect.arrayContaining([peKey('pe1', 'a'), peKey('pe1', 'a/b')]));
    expect(before.current).toEqual(expect.arrayContaining([peKey('pe1', 'a'), peKey('pe1', 'a/b')]));
    expect(before.cacheKeys).toEqual(expect.arrayContaining([peKey('pe1', 'a'), peKey('pe1', 'a/b')]));

    // Root reports 'a' removed → cascade prunes the whole 'a' subtree.
    applyMonitorNotification('fs/delta', {
      target: { pe_id: 'pe1', relative_path: '' },
      changes: [{ op: 'removed', name: 'a' }],
    });
    await flush();

    const after = getExplorerInternalsForTest();
    // All three structures: 'a' and 'a/b' gone…
    for (const key of [peKey('pe1', 'a'), peKey('pe1', 'a/b')]) {
      expect(after.expanded).not.toContain(key);
      expect(after.current).not.toContain(key);
      expect(after.cacheKeys).not.toContain(key);
    }
    // …sibling 'keep' untouched in all three.
    expect(after.expanded).toContain(peKey('pe1', 'keep'));
    expect(after.current).toContain(peKey('pe1', 'keep'));
    expect(after.cacheKeys).toContain(peKey('pe1', 'keep'));
    // Cache-derived tree reflects the removal.
    expect(childNames(getExplorerSnapshot().treeData, peKey('pe1', ''))).toEqual(['keep']);
  });
});

describe('anti-stale: renamed migration (end-to-end, three structures)', () => {
  it('migrates cache + expanded + current from old prefix to new, retaining subscription + expansion', async () => {
    const h = makePort({
      [peKey('pe1', '')]: [dir('a')],
      [peKey('pe1', 'a')]: [dir('b')],
      [peKey('pe1', 'a/b')]: [file('inner.ts')],
    });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    setExpanded(peKey('pe1', 'a'), true);
    await flush();
    setExpanded(peKey('pe1', 'a/b'), true);
    await flush();

    applyMonitorNotification('fs/delta', {
      target: { pe_id: 'pe1', relative_path: '' },
      changes: [{ op: 'renamed', from: 'a', to: 'z' }],
    });
    await flush();

    const after = getExplorerInternalsForTest();
    // Old-prefix keys gone, new-prefix keys present — in all three structures.
    for (const oldKey of [peKey('pe1', 'a'), peKey('pe1', 'a/b')]) {
      expect(after.expanded).not.toContain(oldKey);
      expect(after.current).not.toContain(oldKey);
      expect(after.cacheKeys).not.toContain(oldKey);
    }
    for (const newKey of [peKey('pe1', 'z'), peKey('pe1', 'z/b')]) {
      expect(after.expanded).toContain(newKey); // expansion retained
      expect(after.current).toContain(newKey); // subscription retained
      expect(after.cacheKeys).toContain(newKey); // cached listing retained
    }
    // Deep listing survived the migration under the new prefix.
    expect(childNames(getExplorerSnapshot().treeData, peKey('pe1', 'z/b'))).toEqual(['inner.ts']);
  });
});

describe('reconnect re-declares', () => {
  it('re-subscribes the whole want set after reconnect', async () => {
    const h = makePort({ [peKey('pe1', '')]: [dir('a')], [peKey('pe1', 'a')]: [] });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    setExpanded(peKey('pe1', 'a'), true);
    await flush();
    h.subscribed.length = 0;

    onReconnect();
    await flush();

    const resubscribed = h.subscribed.flat().map(refToKey).toSorted();
    expect(resubscribed).toEqual([peKey('pe1', ''), peKey('pe1', 'a')].toSorted());
  });
});

describe('per-project persistence', () => {
  it('restores expanded state from localStorage on reopen', async () => {
    const h = makePort({ [peKey('pe1', '')]: [dir('a')], [peKey('pe1', 'a')]: [] });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    setExpanded(peKey('pe1', 'a'), true);
    await flush();

    // Reopen the same project → expanded 'a' restored, so it re-subscribes.
    resetExplorerStoreForTest();
    const h2 = makePort({ [peKey('pe1', '')]: [dir('a')], [peKey('pe1', 'a')]: [] });
    configureExplorerStore(h2.port);
    openProject('proj1', roots);
    await flush();

    const subscribed = h2.subscribed.flat().map(refToKey);
    expect(subscribed).toContain(peKey('pe1', 'a'));
  });
});

describe('setExpandedKeys (controlled arco expand → store mirror)', () => {
  it('replaces the expanded set wholesale and reconciles subscriptions + exposes it on the view', async () => {
    const h = makePort({ [peKey('pe1', '')]: [dir('a')], [peKey('pe1', 'a')]: [file('x.ts')] });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    h.subscribed.length = 0;

    // arco reports the full expanded list (root + 'a').
    setExpandedKeys([peKey('pe1', ''), peKey('pe1', 'a')]);
    await flush();

    // Store mirrors it (view.expanded drives arco's controlled expandedKeys)…
    expect(getExplorerSnapshot().expanded.toSorted()).toEqual([peKey('pe1', ''), peKey('pe1', 'a')].toSorted());
    // …and reconcile subscribed the newly-expanded 'a'.
    expect(h.subscribed.flat().map(refToKey)).toContain(peKey('pe1', 'a'));
  });

  it('collapsing (a shorter key list) unsubscribes the dropped dirs', async () => {
    const h = makePort({ [peKey('pe1', '')]: [dir('a')], [peKey('pe1', 'a')]: [] });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    setExpandedKeys([peKey('pe1', ''), peKey('pe1', 'a')]);
    await flush();
    h.unsubscribed.length = 0;

    setExpandedKeys([peKey('pe1', '')]); // collapse 'a'
    await flush();

    expect(h.unsubscribed.flat().map(refToKey)).toContain(peKey('pe1', 'a'));
    expect(getExplorerSnapshot().expanded).toEqual([peKey('pe1', '')]);
  });
});

describe('reveal (deep path)', () => {
  it('expands the whole ancestor chain and subscribes the full chain', async () => {
    const h = makePort({
      [peKey('pe1', '')]: [dir('a')],
      [peKey('pe1', 'a')]: [dir('b')],
      [peKey('pe1', 'a/b')]: [dir('c')],
      [peKey('pe1', 'a/b/c')]: [file('x.ts')],
    });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    h.subscribed.length = 0; // ignore initial root subscribe

    reveal({ pe_id: 'pe1', relative_path: 'a/b/c' });
    await flush();

    const expanded = getExplorerInternalsForTest().expanded;
    // Whole ancestor chain (root → a → a/b → a/b/c) is expanded.
    expect(expanded).toEqual(
      expect.arrayContaining([peKey('pe1', ''), peKey('pe1', 'a'), peKey('pe1', 'a/b'), peKey('pe1', 'a/b/c')])
    );
    // want/subscribe covers the whole freshly-revealed (previously unsubscribed) chain.
    const subscribed = h.subscribed.flat().map(refToKey);
    expect(subscribed).toEqual(expect.arrayContaining([peKey('pe1', 'a'), peKey('pe1', 'a/b'), peKey('pe1', 'a/b/c')]));
    // The deep listing landed in the tree.
    expect(childNames(getExplorerSnapshot().treeData, peKey('pe1', 'a/b/c'))).toEqual(['x.ts']);
  });
});

describe('collapse while subscribe is in flight (runReconcile .then guard)', () => {
  it('drops a snapshot that resolves after the dir was collapsed out of want', async () => {
    const h = makeDeferredPort({
      [peKey('pe1', '')]: [dir('a')],
      [peKey('pe1', 'a')]: [file('x.ts')],
    });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    h.resolveNext(); // resolve the root subscribe
    await flush();

    // Expand 'a' → its subscribe goes out but stays pending (deferred).
    setExpanded(peKey('pe1', 'a'), true);
    await flush();
    expect(h.pendingCount()).toBe(1);

    // Collapse 'a' before its snapshot returns → 'a' leaves want, current pruned.
    setExpanded(peKey('pe1', 'a'), false);
    await flush();
    expect(getExplorerInternalsForTest().current).not.toContain(peKey('pe1', 'a'));

    // Now the in-flight 'a' subscribe resolves. The `.then` stillWant guard must
    // drop it — 'a' is no longer wanted — so the cache never gains 'a'.
    h.resolveNext();
    await flush();
    expect(getExplorerInternalsForTest().cacheKeys).not.toContain(peKey('pe1', 'a'));
    expect(childNames(getExplorerSnapshot().treeData, peKey('pe1', ''))).toEqual(['a']);
  });
});

describe('subscribe rejection (offline) path', () => {
  it('rolls a rejected subscribe back out of current so it is not stranded as falsely-declared', async () => {
    const rejecting: MonitorPort = {
      subscribe: async () => {
        throw new Error('offline');
      },
      unsubscribe: () => {},
    };
    configureExplorerStore(rejecting);
    openProject('proj1', roots);
    await flush();

    // The rejected root subscribe must NOT leave the root sitting in `current`.
    // If it did, reconcileDiff would treat the root as already-declared and never
    // re-add it — the dir would go silently stale. Rolled back, it is eligible to
    // retry. (The cache is empty because no snapshot came back.)
    expect(getExplorerInternalsForTest().current).not.toContain(peKey('pe1', ''));
    expect(getExplorerInternalsForTest().cacheKeys).toEqual([]);
  });

  it('retries a rejected subscribe on the very next reconcile — no reconnect needed', async () => {
    const rejecting: MonitorPort = {
      subscribe: async () => {
        throw new Error('offline');
      },
      unsubscribe: () => {},
    };
    configureExplorerStore(rejecting);
    openProject('proj1', roots);
    await flush();
    expect(getExplorerInternalsForTest().current).not.toContain(peKey('pe1', ''));

    // Socket healthy again, but NO reconnect event fires. A plain user action
    // (expanding a dir) triggers a reconcile; because the root was rolled back out
    // of `current`, it re-enters `toAdd` and is re-subscribed. This is the whole
    // point of the fix: recovery no longer depends solely on the reconnect path.
    const good = makePort({ [peKey('pe1', '')]: [dir('a')] });
    configureExplorerStore(good.port);
    setExpanded(peKey('pe1', ''), true); // root already expanded → benign, just reconciles
    await flush();

    expect(good.subscribed.flat().map(refToKey)).toContain(peKey('pe1', ''));
    expect(getExplorerInternalsForTest().current).toContain(peKey('pe1', ''));
    expect(childNames(getExplorerSnapshot().treeData, peKey('pe1', ''))).toEqual(['a']);
  });

  it('reconnect still re-declares the whole want set after an offline gap', async () => {
    const rejecting: MonitorPort = {
      subscribe: async () => {
        throw new Error('offline');
      },
      unsubscribe: () => {},
    };
    configureExplorerStore(rejecting);
    openProject('proj1', roots);
    await flush();

    // Reconnect: current resets to ∅ and the whole want set is re-declared. This
    // time the port answers, filling the gap left by the earlier rejection.
    const good = makePort({ [peKey('pe1', '')]: [dir('a')] });
    configureExplorerStore(good.port);
    onReconnect();
    await flush();

    expect(good.subscribed.flat().map(refToKey)).toContain(peKey('pe1', ''));
    expect(childNames(getExplorerSnapshot().treeData, peKey('pe1', ''))).toEqual(['a']);
  });
});

describe('multi-root reconcile', () => {
  const twoRoots = [
    { pe_id: 'pe1', title: 'app' },
    { pe_id: 'pe2', title: 'lib' },
  ];

  it('subscribes each pe root independently and projects both trees', async () => {
    const h = makePort({
      [peKey('pe1', '')]: [dir('a')],
      [peKey('pe2', '')]: [dir('x')],
    });
    configureExplorerStore(h.port);
    openProject('proj-multi', twoRoots);
    await flush();

    const subscribed = h.subscribed.flat().map(refToKey);
    expect(subscribed).toEqual(expect.arrayContaining([peKey('pe1', ''), peKey('pe2', '')]));
    expect(childNames(getExplorerSnapshot().treeData, peKey('pe1', ''))).toEqual(['a']);
    expect(childNames(getExplorerSnapshot().treeData, peKey('pe2', ''))).toEqual(['x']);
  });

  it('expands one root without subscribing under the other', async () => {
    const h = makePort({
      [peKey('pe1', '')]: [dir('a')],
      [peKey('pe1', 'a')]: [file('y.ts')],
      [peKey('pe2', '')]: [dir('x')],
    });
    configureExplorerStore(h.port);
    openProject('proj-multi', twoRoots);
    await flush();
    h.subscribed.length = 0;

    setExpanded(peKey('pe1', 'a'), true);
    await flush();

    const subscribed = h.subscribed.flat().map(refToKey);
    expect(subscribed).toContain(peKey('pe1', 'a'));
    expect(subscribed).not.toContain(peKey('pe2', 'x'));
  });
});

describe('switch project (openProject A → B without reset)', () => {
  it('drops project A state so no stale key leaks into project B', async () => {
    const hA = makePort({ [peKey('pe1', '')]: [dir('a')], [peKey('pe1', 'a')]: [] });
    configureExplorerStore(hA.port);
    openProject('projA', [{ pe_id: 'pe1', title: 'app' }]);
    await flush();
    setExpanded(peKey('pe1', 'a'), true);
    await flush();

    // Switch to project B (same store instance, NO resetExplorerStoreForTest).
    const hB = makePort({ [peKey('pe2', '')]: [dir('x')] });
    configureExplorerStore(hB.port);
    openProject('projB', [{ pe_id: 'pe2', title: 'lib' }]);
    await flush();

    const internals = getExplorerInternalsForTest();
    // No pe1 key survives in any of the three structures.
    for (const struct of [internals.cacheKeys, internals.current, internals.expanded]) {
      expect(struct.some((k) => k.startsWith('pe1'))).toBe(false);
    }
    // Project B is live + scoped to B.
    expect(getExplorerSnapshot().projectId).toBe('projB');
    expect(childNames(getExplorerSnapshot().treeData, peKey('pe2', ''))).toEqual(['x']);
  });
});

describe('openProject same-project guard (zero-flicker remount)', () => {
  it('re-opening the same project with the same roots is a no-op: no re-subscribe, live state intact', async () => {
    const h = makePort({ [peKey('pe1', '')]: [dir('a')], [peKey('pe1', 'a')]: [file('x.ts')] });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    setExpanded(peKey('pe1', 'a'), true);
    await flush();

    const subscribesBefore = h.subscribed.length;
    const internalsBefore = getExplorerInternalsForTest();

    // Simulate a conversation-switch remount: same id, a *new* roots array with
    // the same pe_id. Guard must treat it as a remount, not a switch.
    openProject('proj1', [{ pe_id: 'pe1', title: 'app' }]);
    await flush();

    expect(h.subscribed.length).toBe(subscribesBefore); // no new subscribe
    // Live fact cache / current / expanded untouched (no wipe → no flicker).
    expect(getExplorerInternalsForTest()).toEqual(internalsBefore);
    expect(getExplorerInternalsForTest().cacheKeys).toContain(peKey('pe1', 'a'));
  });

  it('re-opening the same project with a CHANGED root set (attach) falls through to a full reset', async () => {
    const h = makePort({
      [peKey('pe1', '')]: [dir('a')],
      [peKey('pe1', 'a')]: [file('x.ts')],
      [peKey('pe2', '')]: [dir('y')],
    });
    configureExplorerStore(h.port);
    openProject('proj1', [{ pe_id: 'pe1', title: 'app' }]);
    await flush();
    setExpanded(peKey('pe1', 'a'), true);
    await flush();
    h.subscribed.length = 0;

    // A folder was attached → roots changed → guard must NOT early-return.
    openProject('proj1', [
      { pe_id: 'pe1', title: 'app' },
      { pe_id: 'pe2', title: 'lib' },
    ]);
    await flush();

    // Proof the reset path ran (guard would have left `subscribed` empty): the
    // full want set was re-declared from a cleared `current`.
    const subscribed = h.subscribed.flat().map(refToKey);
    expect(subscribed.length).toBeGreaterThan(0);
    expect(subscribed).toContain(peKey('pe1', ''));
    // The newly attached root is now a top-level node. It is collapsed by default
    // (attached folders are not auto-expanded, so not subscribed until opened).
    expect(getExplorerSnapshot().treeData.map((n) => n.key)).toContain(peKey('pe2', ''));
  });

  it('opening a DIFFERENT project id always fully resets (guard never fires across projects)', async () => {
    const h = makePort({ [peKey('pe1', '')]: [dir('a')], [peKey('pe2', '')]: [dir('y')] });
    configureExplorerStore(h.port);
    openProject('projA', [{ pe_id: 'pe1', title: 'app' }]);
    await flush();
    h.subscribed.length = 0;

    openProject('projB', [{ pe_id: 'pe2', title: 'lib' }]);
    await flush();

    expect(h.subscribed.flat().map(refToKey)).toContain(peKey('pe2', ''));
    expect(getExplorerInternalsForTest().current.some((k) => k.startsWith('pe1'))).toBe(false);
    expect(getExplorerSnapshot().projectId).toBe('projB');
  });

  it('refreshes root titles on same-project remount without touching the cache', async () => {
    const h = makePort({ [peKey('pe1', '')]: [dir('a')] });
    configureExplorerStore(h.port);
    openProject('proj1', [{ pe_id: 'pe1', title: 'app' }]);
    await flush();
    const subscribesBefore = h.subscribed.length;

    // Same pe_id, changed title (e.g. display_name updated) → guarded path still
    // refreshes the projected title, but does not re-subscribe.
    openProject('proj1', [{ pe_id: 'pe1', title: 'Application' }]);
    await flush();

    expect(getExplorerSnapshot().treeData[0]?.title).toBe('Application');
    expect(h.subscribed.length).toBe(subscribesBefore);
  });

  it('same project + SAME-LENGTH but different pe_id set (swap) fully resets — identity is the pe set, not the count', async () => {
    const h = makePort({
      [peKey('pe1', '')]: [dir('a')],
      [peKey('pe1', 'a')]: [file('x.ts')],
      [peKey('pe2', '')]: [dir('m')],
      [peKey('pe3', '')]: [dir('n')],
    });
    configureExplorerStore(h.port);
    openProject('proj1', [
      { pe_id: 'pe1', title: 'app' },
      { pe_id: 'pe2', title: 'lib' },
    ]);
    await flush();
    setExpanded(peKey('pe1', 'a'), true);
    await flush();
    h.subscribed.length = 0;

    // Swap pe1 → pe3: same id, same length (2), different pe set. A length-only
    // identity would wrongly guard-skip and keep pe1's stale cache/subscriptions.
    openProject('proj1', [
      { pe_id: 'pe3', title: 'app' },
      { pe_id: 'pe2', title: 'lib' },
    ]);
    await flush();

    const internals = getExplorerInternalsForTest();
    // pe1 fully gone from every structure; the reset re-declared want.
    expect(internals.current.some((k) => k.startsWith('pe1'))).toBe(false);
    expect(internals.cacheKeys.some((k) => k.startsWith('pe1'))).toBe(false);
    expect(internals.expanded.some((k) => k.startsWith('pe1'))).toBe(false);
    expect(h.subscribed.flat().map(refToKey).length).toBeGreaterThan(0);
    // pe3 is now a top-level node.
    expect(getExplorerSnapshot().treeData.map((n) => n.key)).toContain(peKey('pe3', ''));
  });

  it('prunes orphaned expanded + selected state of a removed pe on reset', async () => {
    const h1 = makePort({
      [peKey('pe1', '')]: [dir('a')],
      [peKey('pe1', 'a')]: [file('f.ts')],
      [peKey('pe2', '')]: [],
    });
    configureExplorerStore(h1.port);
    openProject('proj1', [
      { pe_id: 'pe1', title: 'app' },
      { pe_id: 'pe2', title: 'lib' },
    ]);
    await flush();
    setExpanded(peKey('pe1', 'a'), true);
    await flush();
    select(peKey('pe1', 'a')); // selection lives under pe1

    // Remove pe1 (roots set shrinks) → reset → orphaned pe1 UI state must be pruned,
    // not restored from localStorage.
    const h2 = makePort({ [peKey('pe2', '')]: [] });
    configureExplorerStore(h2.port);
    openProject('proj1', [{ pe_id: 'pe2', title: 'lib' }]);
    await flush();

    const internals = getExplorerInternalsForTest();
    expect(internals.expanded.some((k) => k.startsWith('pe1'))).toBe(false);
    expect(internals.current.some((k) => k.startsWith('pe1'))).toBe(false);
    expect(getExplorerSnapshot().selected).toBeNull(); // pe1 selection dropped
  });

  it('same project + same pe set, only ORDER changed → guarded (reorder does not reset; locks sorted identity)', async () => {
    const h = makePort({ [peKey('pe1', '')]: [dir('a')], [peKey('pe1', 'a')]: [file('x.ts')], [peKey('pe2', '')]: [] });
    configureExplorerStore(h.port);
    openProject('proj1', [
      { pe_id: 'pe1', title: 'app' },
      { pe_id: 'pe2', title: 'lib' },
    ]);
    await flush();
    setExpanded(peKey('pe1', 'a'), true);
    await flush();
    const subscribesBefore = h.subscribed.length;
    const internalsBefore = getExplorerInternalsForTest();

    // Same id, same pe set, reversed order. Sorted identity → guarded (no reset).
    // Tripwire: an order-sensitive identity would treat this as a change and reset
    // (new subscribes + wiped/rebuilt structures), failing the assertions below.
    openProject('proj1', [
      { pe_id: 'pe2', title: 'lib' },
      { pe_id: 'pe1', title: 'app' },
    ]);
    await flush();

    expect(h.subscribed.length).toBe(subscribesBefore); // no re-subscribe
    expect(getExplorerInternalsForTest()).toEqual(internalsBefore); // cache/current/expanded intact
  });

  it('remounting an empty-roots project does not crash (smoke: empty roots make guard vs reset indistinguishable)', async () => {
    // NOTE: with empty roots the guarded and reset paths produce the same result,
    // so this only guards "no crash", not the guard behavior itself (the non-empty
    // remount test above locks that).
    const h = makePort();
    configureExplorerStore(h.port);
    openProject('proj-empty', []);
    await flush();
    openProject('proj-empty', []);
    await flush();

    expect(getExplorerSnapshot().treeData).toEqual([]);
    expect(h.subscribed).toEqual([]);
  });
});

describe('selection + misc edge paths', () => {
  it('restores the persisted selection when the project is reopened', async () => {
    const h = makePort({ [peKey('pe1', '')]: [file('a.ts')] });
    configureExplorerStore(h.port);
    openProject('proj-sel', roots);
    await flush();
    select(peKey('pe1', 'a.ts'));

    resetExplorerStoreForTest();
    const h2 = makePort({ [peKey('pe1', '')]: [file('a.ts')] });
    configureExplorerStore(h2.port);
    openProject('proj-sel', roots);
    await flush();

    expect(getExplorerSnapshot().selected).toBe(peKey('pe1', 'a.ts'));
  });

  it('opens a project with no roots without crashing or subscribing', async () => {
    const h = makePort();
    configureExplorerStore(h.port);
    openProject('proj-empty', []);
    await flush();

    expect(getExplorerSnapshot().treeData).toEqual([]);
    expect(h.subscribed).toEqual([]);
  });

  it('ignores an unknown monitor notification method', async () => {
    const h = makePort({ [peKey('pe1', '')]: [file('a.ts')] });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();
    const before = getExplorerInternalsForTest();

    applyMonitorNotification('fs/bogus', { target: { pe_id: 'pe1', relative_path: '' }, whatever: true });

    expect(getExplorerInternalsForTest()).toEqual(before);
  });
});
