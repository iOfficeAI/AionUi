/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import {
  actionableResources,
  actionSide,
  classifyResourceState,
  diffAnchors,
  failedRowKeys,
  groupResources,
  isActionable,
  resourceDir,
  resourceKey,
  resourceName,
  splitDiscardRisk,
  type ScmResource,
} from '@/renderer/pages/conversation/SourceControl/scmModel';

const res = (over: Partial<ScmResource> = {}): ScmResource => ({
  file: { pe_id: 'pe1', relative_path: 'src/a.ts' },
  repo_relative_path: 'src/a.ts',
  state: 'modified',
  ...over,
});

describe('classifyResourceState (open set / forward compatibility)', () => {
  it('classifies the three regular states as regular', () => {
    expect(classifyResourceState('created')).toBe('regular');
    expect(classifyResourceState('modified')).toBe('regular');
    expect(classifyResourceState('deleted')).toBe('regular');
  });

  it('keeps renamed and conflicted as their own kinds (never folded into regular)', () => {
    expect(classifyResourceState('renamed')).toBe('renamed');
    expect(classifyResourceState('conflicted')).toBe('conflicted');
  });

  it('treats an unknown wire state as opaque, NOT as modified', () => {
    // protocol.md: ScmResourceState is an open set — a future backend may send
    // 'merge'. Reading it as a regular state would offer actions on something we
    // do not understand.
    expect(classifyResourceState('merge')).toBe('opaque');
    expect(classifyResourceState('some_future_state')).toBe('opaque');
    expect(classifyResourceState('')).toBe('opaque');
  });
});

describe('isActionable (action gating)', () => {
  it('allows actions on regular and renamed resources', () => {
    expect(isActionable(res({ state: 'modified' }))).toBe(true);
    expect(isActionable(res({ state: 'created' }))).toBe(true);
    expect(isActionable(res({ state: 'deleted' }))).toBe(true);
    expect(isActionable(res({ state: 'renamed', rename_from: 'src/old.ts' }))).toBe(true);
  });

  it('blocks actions on conflicted (stage 1 data-safety rule)', () => {
    expect(isActionable(res({ state: 'conflicted' }))).toBe(false);
  });

  it('blocks actions on an unknown state', () => {
    expect(isActionable(res({ state: 'merge' }))).toBe(false);
  });
});

describe('resourceKey (row identity)', () => {
  it('distinguishes the staged and unstaged entries of the SAME file', () => {
    // git reports one file twice when it has both staged and unstaged changes
    // (source-control.md §变更清单) — pe_id + path alone would collide.
    const staged = res({ staged: true });
    const unstaged = res({ staged: false });
    expect(resourceKey(staged)).not.toBe(resourceKey(unstaged));
  });

  it('distinguishes the same relative path across different pe roots', () => {
    const a = res({ file: { pe_id: 'pe1', relative_path: 'src/a.ts' } });
    const b = res({ file: { pe_id: 'pe2', relative_path: 'src/a.ts' } });
    expect(resourceKey(a)).not.toBe(resourceKey(b));
  });

  it('distinguishes a FLAGLESS row from an unstaged row for the same path', () => {
    // A flagless row (opaque state, no staging side) and a genuine unstaged row can
    // both exist for one path. Collapsing them to one key would make React treat
    // two different rows as one — selecting the conflicted row could highlight the
    // unstaged one.
    const flagless = res({ state: 'conflicted', staged: undefined });
    const unstaged = res({ staged: false });
    expect(resourceKey(flagless)).not.toBe(resourceKey(unstaged));
  });

  it('gives all three flag states distinct keys', () => {
    const keys = [res({ staged: true }), res({ staged: false }), res({ staged: undefined })].map(resourceKey);
    expect(new Set(keys).size).toBe(3);
  });
});

describe('groupResources (display-layer derivation from capabilities)', () => {
  it('splits into staged and unstaged when the provider has a staging area', () => {
    const groups = groupResources([res({ staged: true }), res({ staged: false })], true);
    expect(groups.map((g) => g.id)).toEqual(['staged', 'unstaged']);
    expect(groups[0].resources).toHaveLength(1);
    expect(groups[1].resources).toHaveLength(1);
  });

  it('produces ONE undifferentiated group when the provider has no staging area', () => {
    // A provider without an index must show no staging concept at all.
    const groups = groupResources([res(), res({ file: { pe_id: 'pe1', relative_path: 'b.ts' } })], false);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('changes');
    expect(groups[0].resources).toHaveLength(2);
  });

  it('drops empty groups instead of rendering an empty header', () => {
    expect(groupResources([res({ staged: false })], true).map((g) => g.id)).toEqual(['unstaged']);
    expect(groupResources([res({ staged: true })], true).map((g) => g.id)).toEqual(['staged']);
    expect(groupResources([], true)).toEqual([]);
    expect(groupResources([], false)).toEqual([]);
  });

  it('puts a staging-provider resource with NO staged flag in its own `blocked` group', () => {
    // protocol.md v10: a staging provider also omits `staged` for opaque states
    // (conflicted has no "which side"). Such a row must be "unassignable to a
    // group, with no staging action" — defaulting it into unstaged would keep it
    // visible but also hand it a stage button the backend rejects with -32053.
    const groups = groupResources([res({ state: 'conflicted', staged: undefined })], true);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('blocked');
    expect(groups[0].resources).toHaveLength(1);
  });

  it('never lets a flagless resource leak into the staged or unstaged group', () => {
    const groups = groupResources(
      [res({ staged: true }), res({ staged: false }), res({ state: 'conflicted', staged: undefined })],
      true
    );
    const staging = groups.filter((g) => g.id === 'staged' || g.id === 'unstaged');
    expect(staging.flatMap((g) => g.resources).every((r) => r.staged !== undefined)).toBe(true);
    expect(groups.map((g) => g.id)).toEqual(['staged', 'unstaged', 'blocked']);
  });

  it('keeps the flagless row visible (never silently dropped from the change list)', () => {
    // Dropping it would make the change list incomplete — worse than mis-grouping.
    const groups = groupResources([res({ state: 'conflicted', staged: undefined })], true);
    expect(groups.flatMap((g) => g.resources)).toHaveLength(1);
  });
});

describe('diffAnchors (neutral ContentRef pairs)', () => {
  it('diffs a staged row against the last commit', () => {
    expect(diffAnchors(res({ staged: true }), true)).toEqual({ from: 'committed', to: 'staged' });
  });

  it('diffs an unstaged row against the index when there is a staging area', () => {
    expect(diffAnchors(res({ staged: false }), true)).toEqual({ from: 'staged', to: 'working' });
  });

  it('never asks for the staged anchor when the provider has no staging area', () => {
    // Passing ContentRef 'staged' to a provider without staging is a
    // capability_unsupported (-32052) error — it must not be requested at all.
    const anchors = diffAnchors(res({ staged: undefined }), false);
    expect(anchors).toEqual({ from: 'committed', to: 'working' });
    expect(Object.values(anchors)).not.toContain('staged');
  });

  it('never asks for the staged anchor for a flagless row on a staging provider', () => {
    // protocol.md v11: a conflicted file's index has only the three conflict sides
    // and no resolved version at stage 0, so the `staged` anchor is NOT rejected —
    // it returns EMPTY CONTENT. Rendering that would claim "this file is empty",
    // which is worse than an error because it looks like a valid result.
    const anchors = diffAnchors(res({ state: 'conflicted', staged: undefined }), true);
    expect(anchors).toEqual({ from: 'committed', to: 'working' });
    expect(Object.values(anchors)).not.toContain('staged');
  });

  it('never asks for the staged anchor for ANY flagless row, whatever its state', () => {
    // The rule keys off the missing flag, not off `state === 'conflicted'` — a
    // future opaque state would omit the flag the same way.
    for (const state of ['conflicted', 'merge', 'some_future_state']) {
      const anchors = diffAnchors(res({ state, staged: undefined }), true);
      expect(Object.values(anchors)).not.toContain('staged');
    }
  });
});

describe('resourceName / resourceDir (row labels)', () => {
  it('splits a nested repo-relative path into basename and parent dir', () => {
    const r = res({ repo_relative_path: 'src/components/Button.tsx' });
    expect(resourceName(r)).toBe('Button.tsx');
    expect(resourceDir(r)).toBe('src/components');
  });

  it('reports an empty parent dir for a repo-root file', () => {
    const r = res({ repo_relative_path: 'README.md' });
    expect(resourceName(r)).toBe('README.md');
    expect(resourceDir(r)).toBe('');
  });

  it('falls back to the pe-relative path when repo_relative_path is empty', () => {
    const r = res({ repo_relative_path: '', file: { pe_id: 'pe1', relative_path: 'deep/x.ts' } });
    expect(resourceName(r)).toBe('x.ts');
    expect(resourceDir(r)).toBe('deep');
  });
});

describe('actionSide / failedRowKeys (attributing an action failure to a row)', () => {
  const staged = res({ staged: true });
  const unstaged = res({ staged: false });

  it('fixes the operated side from the action alone', () => {
    // A request names exactly one method, so the side needs no per-failure flag.
    expect(actionSide('unstage')).toBe(true); // acts on the staged side
    expect(actionSide('stage')).toBe(false); // acts on the unstaged side
    expect(actionSide('discard')).toBe(false); // acts on the unstaged side
  });

  it('marks the unstaged row — not the staged one — when a discard fails', () => {
    // Both sides of one path exist. `failed[].file` carries no side, so the side
    // comes from the action: discard operates on the unstaged row.
    const keys = failedRowKeys(
      [{ file: { pe_id: 'pe1', relative_path: 'src/a.ts' }, reason: 'move to trash failed: x' }],
      [staged, unstaged],
      'discard'
    );
    expect(keys).toEqual([resourceKey(unstaged)]);
    expect(keys).not.toContain(resourceKey(staged));
  });

  it('marks the staged row when an unstage fails on the same path', () => {
    const keys = failedRowKeys(
      [{ file: { pe_id: 'pe1', relative_path: 'src/a.ts' }, reason: 'index write failed' }],
      [staged, unstaged],
      'unstage'
    );
    expect(keys).toEqual([resourceKey(staged)]);
  });

  it('returns nothing for a failure whose row is gone (never a wrong row)', () => {
    // The status frame may have moved on. Reporting no row is correct; the caller
    // still lists the path in the summary, so it is not silently dropped.
    const keys = failedRowKeys(
      [{ file: { pe_id: 'pe1', relative_path: 'vanished.ts' }, reason: 'io error' }],
      [staged, unstaged],
      'discard'
    );
    expect(keys).toEqual([]);
  });

  it('never attributes a failure to a flagless (conflicted) row', () => {
    // Conflicted rows are rejected up front with -32053, so they can never appear
    // in a `failed[]`; matching one would mean marking a row the action never touched.
    const flagless = res({ state: 'conflicted', staged: undefined });
    const keys = failedRowKeys(
      [{ file: { pe_id: 'pe1', relative_path: 'src/a.ts' }, reason: 'io error' }],
      [flagless],
      'discard'
    );
    expect(keys).toEqual([]);
  });

  it('returns an empty list for an all-succeeded response', () => {
    expect(failedRowKeys([], [staged, unstaged], 'stage')).toEqual([]);
  });
});

describe('splitDiscardRisk (the two irreversibilities are not the same)', () => {
  it('classifies an unstaged new file as untracked (goes to the trash, recoverable)', () => {
    const { tracked, untracked } = splitDiscardRisk([res({ state: 'created', staged: false })]);
    expect(untracked).toHaveLength(1);
    expect(tracked).toHaveLength(0);
  });

  it('classifies an edited file as tracked (edit is overwritten, NOT recoverable)', () => {
    const { tracked, untracked } = splitDiscardRisk([res({ state: 'modified', staged: false })]);
    expect(tracked).toHaveLength(1);
    expect(untracked).toHaveLength(0);
  });

  it('classifies a STAGED new file as tracked, not untracked', () => {
    // It exists in the index, so discarding restores from there rather than
    // trashing the file — the confirmation must not promise the trash.
    const { tracked, untracked } = splitDiscardRisk([res({ state: 'created', staged: true })]);
    expect(tracked).toHaveLength(1);
    expect(untracked).toHaveLength(0);
  });

  it('splits a mixed selection without losing or duplicating rows', () => {
    const rows = [
      res({ state: 'created', staged: false, file: { pe_id: 'pe1', relative_path: 'new.ts' } }),
      res({ state: 'modified', staged: false, file: { pe_id: 'pe1', relative_path: 'edited.ts' } }),
      res({ state: 'deleted', staged: false, file: { pe_id: 'pe1', relative_path: 'gone.ts' } }),
    ];
    const { tracked, untracked } = splitDiscardRisk(rows);
    expect(untracked).toHaveLength(1);
    expect(tracked).toHaveLength(2);
    expect(tracked.length + untracked.length).toBe(rows.length);
  });
});

describe('actionableResources (never send a row the backend would refuse)', () => {
  it('drops conflicted rows from a selection', () => {
    // One conflicted file makes the backend refuse the WHOLE request (-32053),
    // which would silently turn "stage these three" into "nothing happened".
    const rows = [res({ state: 'modified' }), res({ state: 'conflicted' }), res({ state: 'created' })];
    const targets = actionableResources(rows);
    expect(targets).toHaveLength(2);
    expect(targets.some((r) => r.state === 'conflicted')).toBe(false);
  });

  it('drops rows whose state this build does not recognise', () => {
    expect(actionableResources([res({ state: 'merge' })])).toEqual([]);
  });

  it('returns an empty selection when every row is blocked', () => {
    expect(actionableResources([res({ state: 'conflicted' })])).toEqual([]);
  });
});
