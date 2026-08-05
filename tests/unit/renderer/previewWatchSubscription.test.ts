/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// What the preview panel asks to have watched, and that asking twice changes nothing.
//
// Two properties carry real weight here:
//
//   1. The wanted set is DERIVED FROM TAB STATE, so a ref that becomes a project ref
//      later (the upgrade is an async round trip) is picked up on the next pass. The
//      tempting alternative — decide when a tab opens — silently never revisits that
//      decision, and the case it breaks is the one the feature exists for: a project
//      file opened from a chat link would never receive a signal, with no error.
//   2. Reconciliation is idempotent. Required for React's double-invocation, and
//      required again because ANY write to tab metadata produces a new tabs array and
//      triggers another pass — including writes from unrelated features.
//
// ⚠️ These assert the SUBSCRIPTION SET, not whether an event arrived. Unsubscribing
// leaves the backend node warm for five minutes, so "did a change still reach us?"
// answers yes long after a correct unsubscribe and would read as success.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { peKey, reconcileDiff } from '@/renderer/pages/conversation/explorer/explorerModel';
import { deriveWatchTargets } from '@/renderer/pages/conversation/Preview/context/previewWatchTargets';
import {
  configurePreviewWatch,
  currentPreviewWatchTargets,
  notifyPreviewWatchChange,
  onPreviewWatchChange,
  reconcilePreviewWatch,
  resetPreviewWatch,
} from '@/renderer/pages/conversation/Preview/context/previewWatchStore';

const projectTab = (peId: string, relativePath: string) => ({
  metadata: { fileRef: { kind: 'project' as const, pe_id: peId, relative_path: relativePath } },
});
const localTab = (path: string) => ({ metadata: { fileRef: { kind: 'local' as const, path } } });
const uploadTab = (path: string) => ({ metadata: { fileRef: { kind: 'upload' as const, path } } });
const reflessTab = () => ({ metadata: {} });

describe('deriveWatchTargets', () => {
  it('watches the directory holding a project file, not the file', () => {
    expect([...deriveWatchTargets([projectTab('peA', 'src/deep/a.ts')])]).toEqual([peKey('peA', 'src/deep')]);
  });

  // A file directly under a root has no parent segment; the root itself is the
  // target, exactly as the explorer subscribes to it.
  it('watches the root for a file sitting directly under it', () => {
    expect([...deriveWatchTargets([projectTab('peA', 'a.ts')])]).toEqual([peKey('peA', '')]);
  });

  it('collapses several files in one directory into a single target', () => {
    const targets = deriveWatchTargets([
      projectTab('peA', 'src/a.ts'),
      projectTab('peA', 'src/b.ts'),
      projectTab('peA', 'src/c.ts'),
    ]);
    expect(targets.size).toBe(1);
  });

  it('keeps directories from different projects apart', () => {
    const targets = deriveWatchTargets([projectTab('peA', 'src/a.ts'), projectTab('peB', 'src/a.ts')]);
    expect(targets.size).toBe(2);
  });

  // These have no watchable location — they keep a manual refresh instead.
  it.each([
    ['local', localTab('/somewhere/on/disk/a.ts')],
    ['upload', uploadTab('/managed/uploads/a.ts')],
    ['ref-less', reflessTab()],
  ])('does not watch anything for a %s tab', (_label, tab) => {
    expect(deriveWatchTargets([tab]).size).toBe(0);
  });

  it('watches only the project tabs in a mixed set', () => {
    const targets = deriveWatchTargets([projectTab('peA', 'src/a.ts'), localTab('/elsewhere/b.ts'), reflessTab()]);
    expect([...targets]).toEqual([peKey('peA', 'src')]);
  });

  it('wants nothing when no tabs are open', () => {
    expect(deriveWatchTargets([]).size).toBe(0);
  });

  // The heart of the trigger model: the same tab, before and after its ref is
  // upgraded, yields different answers — so recomputing is what picks the signal up.
  it('starts watching once a local ref has been upgraded to a project ref', () => {
    const before = deriveWatchTargets([localTab('/ws/proj/src/a.ts')]);
    expect(before.size).toBe(0);

    const after = deriveWatchTargets([projectTab('peA', 'src/a.ts')]);
    expect([...after]).toEqual([peKey('peA', 'src')]);
  });
});

describe('reconcilePreviewWatch', () => {
  const port = { subscribe: vi.fn(async () => ({ snapshots: [] })), unsubscribe: vi.fn() };

  beforeEach(() => {
    port.subscribe.mockClear();
    port.unsubscribe.mockClear();
    configurePreviewWatch(port);
    resetPreviewWatch();
    port.unsubscribe.mockClear();
  });

  it('subscribes to the directory of a newly opened project file', () => {
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);

    expect(port.subscribe).toHaveBeenCalledTimes(1);
    expect(port.subscribe.mock.calls[0][0]).toEqual([{ pe_id: 'peA', relative_path: 'src' }]);
  });

  // Both the double-invocation case and the "someone else wrote to metadata" case.
  it('does nothing when reconciled again with the same tabs', () => {
    const tabs = [projectTab('peA', 'src/a.ts')];
    reconcilePreviewWatch(tabs);
    port.subscribe.mockClear();

    reconcilePreviewWatch(tabs);
    reconcilePreviewWatch(tabs);
    reconcilePreviewWatch([...tabs]); // new array, same content — as a metadata write produces

    expect(port.subscribe).not.toHaveBeenCalled();
    expect(port.unsubscribe).not.toHaveBeenCalled();
    expect(currentPreviewWatchTargets().size).toBe(1);
  });

  it('does not accumulate subscriptions across repeated passes', () => {
    const tabs = [projectTab('peA', 'src/a.ts'), projectTab('peA', 'src/b.ts')];
    for (let i = 0; i < 10; i++) reconcilePreviewWatch(tabs);

    expect(currentPreviewWatchTargets().size).toBe(1);
    expect(port.subscribe).toHaveBeenCalledTimes(1);
  });

  it('subscribes to a directory that appears when a ref is upgraded', () => {
    reconcilePreviewWatch([localTab('/ws/proj/src/a.ts')]);
    expect(port.subscribe).not.toHaveBeenCalled();

    // The upgrade wrote a project ref back onto the same tab.
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);

    expect(port.subscribe).toHaveBeenCalledTimes(1);
    expect(currentPreviewWatchTargets().has(peKey('peA', 'src'))).toBe(true);
  });

  // Reference counting, expressed as set membership.
  it('keeps a directory while another tab still needs it', () => {
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts'), projectTab('peA', 'src/b.ts')]);
    port.unsubscribe.mockClear();

    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);

    expect(port.unsubscribe).not.toHaveBeenCalled();
    expect(currentPreviewWatchTargets().size).toBe(1);
  });

  it('unsubscribes once the last tab in a directory closes', () => {
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);

    reconcilePreviewWatch([]);

    expect(port.unsubscribe).toHaveBeenCalledWith([{ pe_id: 'peA', relative_path: 'src' }]);
    expect(currentPreviewWatchTargets().size).toBe(0);
  });

  it('swaps subscriptions when the open file moves to another directory', () => {
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);
    port.subscribe.mockClear();

    reconcilePreviewWatch([projectTab('peA', 'lib/b.ts')]);

    expect(port.unsubscribe).toHaveBeenCalledWith([{ pe_id: 'peA', relative_path: 'src' }]);
    expect(port.subscribe.mock.calls[0][0]).toEqual([{ pe_id: 'peA', relative_path: 'lib' }]);
  });

  it('drops everything on reset, as when the panel scope goes away', () => {
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts'), projectTab('peB', 'x/b.ts')]);

    resetPreviewWatch();

    expect(port.unsubscribe).toHaveBeenCalled();
    expect(currentPreviewWatchTargets().size).toBe(0);
  });

  it('survives a subscribe that rejects, since a lost signal is not fatal', async () => {
    port.subscribe.mockRejectedValueOnce(new Error('socket closed'));

    expect(() => reconcilePreviewWatch([projectTab('peA', 'src/a.ts')])).not.toThrow();
    await Promise.resolve();
  });

  it('does nothing at all before a port is configured', () => {
    configurePreviewWatch(null);
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);
    expect(currentPreviewWatchTargets().size).toBe(0);
  });
});

describe('change notifications', () => {
  const port = { subscribe: vi.fn(async () => ({ snapshots: [] })), unsubscribe: vi.fn() };

  beforeEach(() => {
    configurePreviewWatch(port);
    resetPreviewWatch();
  });

  it('reports a change in a watched directory', () => {
    const seen: string[] = [];
    const stop = onPreviewWatchChange((key) => seen.push(key));
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);

    notifyPreviewWatchChange(peKey('peA', 'src'), { kind: 'files', names: ['a.ts'] });

    expect(seen).toEqual([peKey('peA', 'src')]);
    stop();
  });

  // The connection is shared with the explorer, which watches its own directories.
  it('ignores changes for directories the panel does not watch', () => {
    const seen: string[] = [];
    const stop = onPreviewWatchChange((key) => seen.push(key));
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);

    notifyPreviewWatchChange(peKey('peA', 'somewhere-else'), { kind: 'files', names: ['a.ts'] });

    expect(seen).toEqual([]);
    stop();
  });

  it('stops reporting after the listener is removed', () => {
    const seen: string[] = [];
    const stop = onPreviewWatchChange((key) => seen.push(key));
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);
    stop();

    notifyPreviewWatchChange(peKey('peA', 'src'), { kind: 'files', names: ['a.ts'] });

    expect(seen).toEqual([]);
  });
});

// `reconcileDiff` was written for the explorer and now has a second caller. That
// change of status is itself worth a guard: the two features keep separate wanted
// sets, so the shared helper must answer purely from its arguments. If it ever
// started consulting the explorer's state, preview reconciliation would silently
// subscribe or unsubscribe on the explorer's behalf.
describe('the shared reconcile helper stays independent of its callers', () => {
  it('answers only from its arguments', () => {
    const a = new Set(['x', 'y']);
    const b = new Set(['y', 'z']);

    expect(reconcileDiff(a, b)).toEqual({ toAdd: ['x'], toRemove: ['z'] });
    // Same inputs, same answer, regardless of anything either store has done.
    expect(reconcileDiff(a, b)).toEqual({ toAdd: ['x'], toRemove: ['z'] });
  });

  it('does not mutate the sets it is given', () => {
    const want = new Set(['x']);
    const current = new Set(['y']);

    reconcileDiff(want, current);

    expect([...want]).toEqual(['x']);
    expect([...current]).toEqual(['y']);
  });

  it('leaves the preview subscription set alone when called directly', () => {
    configurePreviewWatch({ subscribe: async () => ({}), unsubscribe: () => {} });
    resetPreviewWatch();
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);
    const before = [...currentPreviewWatchTargets()];

    reconcileDiff(new Set(['unrelated']), new Set(['other']));

    expect([...currentPreviewWatchTargets()]).toEqual(before);
  });
});

// Switching project must leave the NEW project's directories subscribed.
//
// The order inside the scope switch is load-bearing: releasing the outgoing
// directories has to happen before the incoming tabs are applied. Reversed, the
// effect that follows would subscribe the new scope's directories first and the
// release would then drop everything currently held — including what it had just
// added — leaving the newly opened project with no signals at all until some
// unrelated tab change happened to reconcile again.
//
// Asserted as an END STATE rather than as "the release did not happen after": a
// "nothing occurred" assertion cannot tell a correct order from a broken one, which
// is the shape that already produced a false pass once in this work.
describe('switching scope leaves the incoming project subscribed', () => {
  const port = { subscribe: vi.fn(async () => ({ snapshots: [] })), unsubscribe: vi.fn() };

  beforeEach(() => {
    port.subscribe.mockClear();
    port.unsubscribe.mockClear();
    configurePreviewWatch(port);
    resetPreviewWatch();
  });

  it('holds the new scope directories and none of the old ones', () => {
    // Project A is open and watched.
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);
    expect(currentPreviewWatchTargets().has(peKey('peA', 'src'))).toBe(true);

    // The scope switch: release, then apply the incoming project's tabs.
    resetPreviewWatch();
    reconcilePreviewWatch([projectTab('peB', 'lib/b.ts')]);

    expect([...currentPreviewWatchTargets()]).toEqual([peKey('peB', 'lib')]);
  });

  it('ends up subscribed even when both projects use the same relative path', () => {
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);

    resetPreviewWatch();
    reconcilePreviewWatch([projectTab('peB', 'src/a.ts')]);

    // Same directory name, different project — the pe id keeps them distinct, so the
    // release must not have taken the incoming one with it.
    expect(currentPreviewWatchTargets().has(peKey('peB', 'src'))).toBe(true);
    expect(currentPreviewWatchTargets().has(peKey('peA', 'src'))).toBe(false);
  });

  it('actually issued a subscribe for the incoming project', () => {
    reconcilePreviewWatch([projectTab('peA', 'src/a.ts')]);
    port.subscribe.mockClear();

    resetPreviewWatch();
    reconcilePreviewWatch([projectTab('peB', 'lib/b.ts')]);

    expect(port.subscribe).toHaveBeenCalledWith([{ pe_id: 'peB', relative_path: 'lib' }]);
  });
});
