/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the split-editor (Epic C) logic in `EditorContext`.
 *
 * The split helpers (`normalizeGroups`, `addKeyToGroup`, `remapGroupKey`)
 * are module-private, so we exercise them through the public context
 * API: render an `EditorProvider` and a tiny ref-bridge consumer that
 * calls `useEditorContext()`. The bridge reassigns a module-level ref
 * on every render; tests re-read that ref after `act(...)` and assert.
 *
 * For untitled buffers the key format is `untitled:<n>`. The counter is
 * module-global and increments across tests, so we read actual keys from
 * `ctx.buffers` rather than hardcoding counters.
 */

import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import { EditorProvider, useEditorContext } from '@/renderer/pages/conversation/Editor/EditorContext';
import * as layoutModeStorage from '@/renderer/utils/layout/layoutModeStorage';
import { syncActiveLayoutMode } from '@/renderer/utils/layout/layoutModeStorage';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFileMetadata: { invoke: vi.fn() },
      readFile: { invoke: vi.fn() },
      writeFile: { invoke: vi.fn() },
    },
    dialog: {
      showOpen: { invoke: vi.fn() },
      showSave: { invoke: vi.fn() },
    },
  },
}));

// The provider guards open/split/activate on `isEditorAccessibleInLayoutMode()`.
// Mock it so the gate is open for every test in this file.
vi.spyOn(layoutModeStorage, 'isEditorAccessibleInLayoutMode').mockReturnValue(true);
// Touch the in-memory mode ref too — `syncActiveLayoutMode` is what other
// code paths call to set the active mode, so the test starts in the
// right state even if a previous test mutated it.
void syncActiveLayoutMode;
syncActiveLayoutMode('command-center');

type MockedIpcBridge = {
  fs: {
    getFileMetadata: { invoke: ReturnType<typeof vi.fn> };
    readFile: { invoke: ReturnType<typeof vi.fn> };
    writeFile: { invoke: ReturnType<typeof vi.fn> };
  };
  dialog: {
    showOpen: { invoke: ReturnType<typeof vi.fn> };
    showSave: { invoke: ReturnType<typeof vi.fn> };
  };
};

const mockedIpcBridge = ipcBridge as unknown as MockedIpcBridge;

type Ctx = ReturnType<typeof useEditorContext>;
type Group = Ctx['groups'][number];

// Ref-bridge consumer: reassigned on every render so tests can read the
// latest context value after `act(...)`.
let ctxRef: Ctx | undefined;
const Capture = (): null => {
  ctxRef = useEditorContext();
  return null;
};

const renderProvider = (): void => {
  render(
    <EditorProvider>
      <Capture />
    </EditorProvider>
  );
};

const current = (): Ctx => {
  if (!ctxRef) throw new Error('EditorProvider has not been rendered yet');
  return ctxRef;
};

const focusedGroup = (): Group => {
  const c = current();
  const g = c.groups.find((x) => x.id === c.activeGroupId);
  if (!g) throw new Error('No active group found');
  return g;
};

/** Look up a group by id or throw. */
const groupById = (id: string): Group => {
  const g = current().groups.find((x) => x.id === id);
  if (!g) throw new Error(`No group with id ${id}`);
  return g;
};

/**
 * `activeKey === groups[activeGroupId].activeKey` — the contract under
 * test. The provider normalises state so this must always hold, regardless
 * of which operation produced the current shape.
 */
const assertFocusInvariant = (): void => {
  const c = current();
  const g = c.groups.find((x) => x.id === c.activeGroupId);
  expect(g, 'activeGroupId must reference an existing group').toBeDefined();
  expect(c.groups.length, 'at least one group must always remain').toBeGreaterThanOrEqual(1);
  expect(c.activeKey, 'activeKey must mirror the focused group activeKey').toBe(g?.activeKey);
};

describe('EditorContext split editor (Epic C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncActiveLayoutMode('command-center');
    mockedIpcBridge.fs.getFileMetadata.invoke.mockResolvedValue({
      name: 'file.ts',
      path: '/workspace/file.ts',
      size: 100,
      type: 'file',
      lastModified: 10,
    });
    mockedIpcBridge.fs.readFile.invoke.mockResolvedValue('original');
    mockedIpcBridge.fs.writeFile.invoke.mockResolvedValue(true);
    mockedIpcBridge.dialog.showOpen.invoke.mockResolvedValue(['/workspace/file.ts']);
    mockedIpcBridge.dialog.showSave.invoke.mockResolvedValue('/workspace/saved.ts');
    ctxRef = undefined;
  });

  afterEach(() => {
    cleanup();
    ctxRef = undefined;
  });

  it('1. initial state: exactly one empty primary group, null active key', () => {
    renderProvider();
    const c = current();

    expect(c.groups).toHaveLength(1);
    expect(c.groups[0].id).toBe('g-primary');
    expect(c.groups[0].bufferKeys).toEqual([]);
    expect(c.groups[0].activeKey).toBeNull();
    expect(c.activeGroupId).toBe('g-primary');
    expect(c.activeKey).toBeNull();
    expect(c.isOpen).toBe(false);
    assertFocusInvariant();
  });

  it('2. openUntitledEditor appends buffers to the focused group and updates activeKey', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    act(() => current().openUntitledEditor());
    const c = current();
    const [keyA, keyB] = c.buffers.map((b) => b.key);

    expect(c.buffers).toHaveLength(2);
    expect(focusedGroup().bufferKeys).toEqual([keyA, keyB]);
    expect(focusedGroup().activeKey).toBe(keyB);
    expect(c.activeKey).toBe(keyB);
    expect(c.isOpen).toBe(true);
    assertFocusInvariant();
  });

  it('3. splitEditor seeds a second group with the focused group active key and refocuses it', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    act(() => current().openUntitledEditor());
    const [keyA, keyB] = current().buffers.map((b) => b.key);

    act(() => current().splitEditor('right'));
    const c = current();

    expect(c.groups).toHaveLength(2);
    const primary = groupById('g-primary');
    const other = c.groups.find((g) => g.id !== 'g-primary');
    expect(other).toBeDefined();
    expect(other?.bufferKeys).toEqual([keyB]);
    expect(other?.activeKey).toBe(keyB);
    expect(c.activeGroupId).toBe(other?.id);
    expect(c.activeKey).toBe(keyB);

    // Source group keeps its original tabs untouched.
    expect(primary.bufferKeys).toEqual([keyA, keyB]);
    expect(primary.activeKey).toBe(keyB);
    assertFocusInvariant();
  });

  it('4. splitEditor adds additional panes up to the cap (Phase 2: N>2)', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    act(() => current().splitEditor('right'));
    expect(current().groups).toHaveLength(2);
    act(() => current().splitEditor('right'));
    expect(current().groups).toHaveLength(3);
    act(() => current().splitEditor('right'));
    expect(current().groups).toHaveLength(4);
    // Cap reached (MAX_EDITOR_GROUPS = 4): further splits cycle focus instead
    // of stacking unusable panes.
    const beforeCap = current().activeGroupId;
    act(() => current().splitEditor('right'));
    const c = current();
    expect(c.groups).toHaveLength(4);
    expect(c.activeGroupId).not.toBe(beforeCap);
    assertFocusInvariant();
  });

  it('5. setActiveBufferInGroup updates only the targeted group; the other group is untouched', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    act(() => current().openUntitledEditor());
    act(() => current().splitEditor('right'));
    const c = current();
    const primary = groupById('g-primary');
    const second = c.groups.find((g) => g.id !== 'g-primary');
    expect(second).toBeDefined();
    const [keyA, keyB] = c.buffers.map((b) => b.key);
    const priorSecondActiveKey = second?.activeKey;
    const priorSecondBufferKeys = second ? [...second.bufferKeys] : [];

    act(() => current().setActiveBufferInGroup(primary.id, keyA));
    const after = current();

    // The target group is updated and becomes focused.
    expect(after.activeGroupId).toBe(primary.id);
    expect(after.activeKey).toBe(keyA);
    const primaryAfter = groupById(primary.id);
    expect(primaryAfter.activeKey).toBe(keyA);

    // The other group is unchanged.
    const secondAfter = groupById(second!.id);
    expect(secondAfter.activeKey).toBe(priorSecondActiveKey);
    expect(secondAfter.bufferKeys).toEqual(priorSecondBufferKeys);
    // Sanity: the second group was seeded with the last opened key.
    expect(priorSecondActiveKey).toBe(keyB);
    assertFocusInvariant();
  });

  it('6. focusGroup switches activeGroupId and mirrors activeKey to the focused group', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    act(() => current().openUntitledEditor());
    act(() => current().splitEditor('right'));
    const c = current();
    const primary = groupById('g-primary');
    const second = c.groups.find((g) => g.id !== 'g-primary');
    expect(second).toBeDefined();
    const [keyA, keyB] = c.buffers.map((b) => b.key);

    // Make primary's active key differ from second's so the mirror
    // change is observable. After the split second is focused and
    // seeded with keyB; primary still has keyB as well. Re-activate
    // keyA inside primary to create a divergence.
    act(() => current().setActiveBufferInGroup(primary.id, keyA));
    expect(current().activeKey).toBe(keyA);
    expect(current().activeGroupId).toBe(primary.id);

    // Focus second: activeKey should mirror second.activeKey (B).
    act(() => current().focusGroup(second!.id));
    const c1 = current();
    expect(c1.activeGroupId).toBe(second!.id);
    expect(c1.activeKey).toBe(c1.groups.find((g) => g.id === second!.id)?.activeKey);
    expect(c1.activeKey).toBe(keyB);
    expect(c1.activeKey).not.toBe(keyA);

    // Focus primary: activeKey should snap back to A.
    act(() => current().focusGroup(primary.id));
    const c2 = current();
    expect(c2.activeGroupId).toBe(primary.id);
    expect(c2.activeKey).toBe(keyA);
    assertFocusInvariant();
  });

  it('7. shared pool: closing a buffer in one group keeps it while another group still references it', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    act(() => current().openUntitledEditor());
    act(() => current().splitEditor('right'));
    const c = current();
    const second = c.groups.find((g) => g.id !== 'g-primary');
    expect(second).toBeDefined();
    const [, keyB] = c.buffers.map((b) => b.key);

    // group1 (second) is focused and contains only B. Closing B should
    // remove it from group1, drop the now-empty group, and leave B in
    // the pool because group0 (g-primary) still references it.
    act(() => current().requestCloseBufferInGroup(second!.id, keyB));
    const after = current();

    expect(after.buffers.some((b) => b.key === keyB)).toBe(true);
    expect(after.groups).toHaveLength(1);
    expect(after.activeGroupId).toBe('g-primary');
    expect(after.isOpen).toBe(true);
    assertFocusInvariant();
  });

  it('8. closeGroup on the only group closes the editor (isOpen=false)', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    expect(current().isOpen).toBe(true);

    act(() => current().closeGroup('g-primary'));
    const after = current();

    expect(after.isOpen).toBe(false);
    expect(after.groups).toHaveLength(1);
    expect(after.groups[0].id).toBe('g-primary');
    expect(after.groups[0].bufferKeys).toEqual([]);
    expect(after.groups[0].activeKey).toBeNull();
    expect(after.activeGroupId).toBe('g-primary');
  });

  it('9. setSplitLayout rebuilds groups from the provided keys, pruning keys not in the pool', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    act(() => current().openUntitledEditor());
    const [keyA, keyB] = current().buffers.map((b) => b.key);

    // 'stale:not-in-pool' is not in the buffer pool and should be pruned.
    act(() =>
      current().setSplitLayout([
        { bufferKeys: [keyA], activeKey: keyA },
        { bufferKeys: [keyB, 'stale:not-in-pool'], activeKey: keyB },
      ])
    );
    const after = current();

    expect(after.groups).toHaveLength(2);
    expect(after.groups[0].id).toBe('g-primary');
    expect(after.groups[0].bufferKeys).toEqual([keyA]);
    expect(after.groups[0].activeKey).toBe(keyA);
    expect(after.groups[1].bufferKeys).toEqual([keyB]);
    expect(after.groups[1].activeKey).toBe(keyB);
    expect(after.activeGroupId).toBe('g-primary');
    assertFocusInvariant();
  });

  it('10. invariant: activeKey mirrors the focused group activeKey after every operation', () => {
    renderProvider();
    const findFocused = (): Group | undefined => current().groups.find((g) => g.id === current().activeGroupId);

    expect(current().activeKey).toBe(findFocused()?.activeKey);

    act(() => current().openUntitledEditor());
    expect(current().activeKey).toBe(findFocused()?.activeKey);

    act(() => current().openUntitledEditor());
    expect(current().activeKey).toBe(findFocused()?.activeKey);

    act(() => current().splitEditor('right'));
    expect(current().activeKey).toBe(findFocused()?.activeKey);

    act(() => current().splitEditor('right'));
    expect(current().activeKey).toBe(findFocused()?.activeKey);

    const c = current();
    const primary = groupById('g-primary');
    const other = c.groups.find((g) => g.id !== 'g-primary');
    expect(other).toBeDefined();
    const [keyA] = c.buffers.map((b) => b.key);

    act(() => current().focusGroup(primary.id));
    expect(current().activeKey).toBe(findFocused()?.activeKey);

    act(() => current().focusGroup(other!.id));
    expect(current().activeKey).toBe(findFocused()?.activeKey);

    act(() => current().setActiveBufferInGroup(primary.id, keyA));
    expect(current().activeKey).toBe(findFocused()?.activeKey);

    act(() => current().setSplitLayout([{ bufferKeys: [keyA], activeKey: keyA }]));
    expect(current().activeKey).toBe(findFocused()?.activeKey);
  });

  // ---- Phase 2: moveBufferToGroup (cross-group drag-to-move) ----------------

  it('11. moveBufferToGroup moves a tab to another group, activates it there, and keeps the shared pool', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    act(() => current().openUntitledEditor());
    const [keyA, keyB] = current().buffers.map((b) => b.key);

    act(() => current().splitEditor('right'));
    const c = current();
    const primary = groupById('g-primary');
    const group2 = c.groups.find((g) => g.id !== 'g-primary');
    expect(group2).toBeDefined();
    // Setup: B was the active tab at split time, so it seeded group2 (and is
    // still in primary). group2 is now the focused group.
    expect(primary.bufferKeys).toEqual([keyA, keyB]);
    expect(group2!.bufferKeys).toEqual([keyB]);
    expect(c.activeGroupId).toBe(group2!.id);

    act(() => current().moveBufferToGroup(keyA, primary.id, group2!.id));
    const after = current();

    // No group was dropped: both still hold at least one tab.
    expect(after.groups).toHaveLength(2);
    const primaryAfter = groupById('g-primary');
    const group2After = groupById(group2!.id);

    // keyA is removed from the source and appended to the target (no index ⇒ end).
    expect(primaryAfter.bufferKeys).toEqual([keyB]);
    expect(group2After.bufferKeys).toEqual([keyB, keyA]);
    expect(group2After.activeKey).toBe(keyA);
    expect(after.activeGroupId).toBe(group2!.id);
    expect(after.activeKey).toBe(keyA);

    // Shared pool is preserved — the moved buffer is still in `ctx.buffers`
    // so its content / dirty state survive the move.
    expect(after.buffers.some((b) => b.key === keyA)).toBe(true);
    expect(after.buffers.some((b) => b.key === keyB)).toBe(true);
    expect(after.buffers).toHaveLength(2);
    assertFocusInvariant();
  });

  it('12. moving the last tab out of a group drops the now-empty group', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    act(() => current().openUntitledEditor());
    const [keyA, keyB] = current().buffers.map((b) => b.key);

    act(() => current().splitEditor('right'));
    const c = current();
    const primary = groupById('g-primary');
    const group2 = c.groups.find((g) => g.id !== 'g-primary');
    expect(group2).toBeDefined();
    // Setup: group2's only tab is B (the split seed). A is the other primary tab.
    expect(group2!.bufferKeys).toEqual([keyB]);
    expect(primary.bufferKeys).toEqual([keyA, keyB]);

    act(() => current().moveBufferToGroup(keyB, group2!.id, primary.id));
    const after = current();

    // group2 becomes empty after the move, so the normalizer drops it.
    expect(after.groups).toHaveLength(1);
    expect(after.groups[0].id).toBe('g-primary');
    expect(after.activeGroupId).toBe('g-primary');
    expect(after.activeKey).toBe(keyB);
    // B was already in primary (split seed) — the move must not duplicate it.
    expect(after.groups[0].bufferKeys).toEqual([keyA, keyB]);
    expect(new Set(after.groups[0].bufferKeys).size).toBe(after.groups[0].bufferKeys.length);
    // Shared pool still holds both buffers.
    expect(after.buffers).toHaveLength(2);
    assertFocusInvariant();
  });

  it('13. moveBufferToGroup with index inserts the tab at the requested position', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    act(() => current().openUntitledEditor());
    act(() => current().openUntitledEditor());
    const [keyA, keyB, keyC] = current().buffers.map((b) => b.key);

    act(() => current().splitEditor('right'));
    const c = current();
    const primary = groupById('g-primary');
    const group2 = c.groups.find((g) => g.id !== 'g-primary');
    expect(group2).toBeDefined();
    // Setup: group2 is seeded with C, the active key at split time; primary
    // still holds [A, B, C].
    expect(group2!.bufferKeys).toEqual([keyC]);
    expect(primary.bufferKeys).toEqual([keyA, keyB, keyC]);

    act(() => current().moveBufferToGroup(keyA, primary.id, group2!.id, 0));
    const after = current();

    const group2After = groupById(group2!.id);
    // Index 0 places the moved tab at the front of the target list.
    expect(group2After.bufferKeys[0]).toBe(keyA);
    expect(group2After.bufferKeys).toEqual([keyA, keyC]);
    // The moved tab becomes the active tab in the target group.
    expect(group2After.activeKey).toBe(keyA);

    // Source group lost A; B and C remain in their original positions.
    const primaryAfter = groupById('g-primary');
    expect(primaryAfter.bufferKeys).toEqual([keyB, keyC]);
    expect(after.activeGroupId).toBe(group2!.id);
    expect(after.activeKey).toBe(keyA);
    assertFocusInvariant();
  });

  it('14. moveBufferToGroup with fromGroupId === toGroupId is a no-op', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    act(() => current().openUntitledEditor());
    const [keyA, keyB] = current().buffers.map((b) => b.key);
    const beforeKeys = [...current().groups[0].bufferKeys];
    const beforeActive = current().groups[0].activeKey;
    const beforeGroupsLength = current().groups.length;
    const beforeActiveGroupId = current().activeGroupId;

    act(() => current().moveBufferToGroup(keyA, 'g-primary', 'g-primary'));
    const after = current();

    // Same-group move is explicitly a no-op — order, active tab, group count
    // and active group are all unchanged.
    expect(after.groups).toHaveLength(beforeGroupsLength);
    expect(after.activeGroupId).toBe(beforeActiveGroupId);
    expect(after.groups[0].bufferKeys).toEqual(beforeKeys);
    expect(after.groups[0].bufferKeys).toEqual([keyA, keyB]);
    expect(after.groups[0].activeKey).toBe(beforeActive);
    expect(after.groups[0].activeKey).toBe(keyB);
    assertFocusInvariant();
  });

  it('15. moveBufferToGroup into a group that already references the buffer just activates it (no duplicate)', () => {
    renderProvider();
    act(() => current().openUntitledEditor());
    act(() => current().openUntitledEditor());
    const [keyA, keyB] = current().buffers.map((b) => b.key);

    act(() => current().splitEditor('right'));
    const c = current();
    const primary = groupById('g-primary');
    const group2 = c.groups.find((g) => g.id !== 'g-primary');
    expect(group2).toBeDefined();
    // Setup: B is in BOTH groups (it was the active key at split time and got
    // copied into group2 as the seed).
    expect(group2!.bufferKeys).toEqual([keyB]);
    expect(primary.bufferKeys).toEqual([keyA, keyB]);

    act(() => current().moveBufferToGroup(keyB, primary.id, group2!.id));
    const after = current();

    const group2After = groupById(group2!.id);
    // group2 still has B exactly once — the move must not append a duplicate.
    expect(group2After.bufferKeys).toEqual([keyB]);
    expect(new Set(group2After.bufferKeys).size).toBe(group2After.bufferKeys.length);
    expect(group2After.activeKey).toBe(keyB);

    // B is removed from the source primary.
    const primaryAfter = groupById('g-primary');
    expect(primaryAfter.bufferKeys).toEqual([keyA]);
    expect(primaryAfter.bufferKeys.includes(keyB)).toBe(false);

    // Target becomes the focused group, with B as its active tab.
    expect(after.activeGroupId).toBe(group2!.id);
    expect(after.activeKey).toBe(keyB);
    assertFocusInvariant();
  });
});
