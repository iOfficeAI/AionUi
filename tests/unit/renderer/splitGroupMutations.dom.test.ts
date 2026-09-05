/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The write path for split-group tags. The backend applies each conversation's
 * update on its own, so a batch can half-land; the contract is that it never
 * leaves one member tagged and the other not.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({ ipcBridge: { conversation: { update: { invoke: vi.fn() } } } }));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync', () => ({
  getSnapshotConversations: () => [],
  refreshConversationList: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import type { SplitGroupPatchDeps } from '@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations';
import { applySplitGroupPatches } from '@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations';
import type { SplitGroupTag } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';

const tag = (id: string, order: number): SplitGroupTag => ({ id, order });

type TestDeps = SplitGroupPatchDeps & {
  writes: Array<[string, SplitGroupTag | null]>;
  refresh: ReturnType<typeof vi.fn>;
};

const makeDeps = (
  outcomes: Record<string, boolean | Error>,
  previous: Record<string, SplitGroupTag | null> = {}
): TestDeps => {
  const writes: Array<[string, SplitGroupTag | null]> = [];
  const refresh = vi.fn(async () => {});
  return {
    writes,
    refresh,
    previousTag: (id) => previous[id] ?? null,
    update: async (id, split_group) => {
      writes.push([id, split_group]);
      const outcome = outcomes[id];
      if (outcome instanceof Error) throw outcome;
      return outcome ?? true;
    },
  };
};

const silenced = async (body: (error: ReturnType<typeof vi.spyOn>) => Promise<void>): Promise<void> => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await body(error);
  } finally {
    error.mockRestore();
  }
};

describe('applySplitGroupPatches', () => {
  it('writes every patch and then reloads the list', async () => {
    const deps = makeDeps({});
    await applySplitGroupPatches(
      [
        { conversation_id: 'a', split_group: tag('g', 0) },
        { conversation_id: 'b', split_group: tag('g', 1) },
      ],
      deps
    );
    expect(deps.writes).toEqual([
      ['a', tag('g', 0)],
      ['b', tag('g', 1)],
    ]);
    expect(deps.refresh).toHaveBeenCalledTimes(1);
  });

  it('rolls the landed writes back when another one is rejected, and throws', async () =>
    silenced(async () => {
      const deps = makeDeps({ b: false }, { a: null });
      await expect(
        applySplitGroupPatches(
          [
            { conversation_id: 'a', split_group: tag('g', 0) },
            { conversation_id: 'b', split_group: tag('g', 1) },
          ],
          deps
        )
      ).rejects.toThrow(/rejected for b/);
      // a was written, then put back to what it had (nothing); b never landed.
      expect(deps.writes).toEqual([
        ['a', tag('g', 0)],
        ['b', tag('g', 1)],
        ['a', null],
      ]);
      expect(deps.refresh).not.toHaveBeenCalled();
    }));

  it('restores the tag a conversation had before, not a blank one', async () =>
    silenced(async () => {
      const deps = makeDeps({ c: new Error('offline') }, { a: tag('old', 3) });
      await expect(
        applySplitGroupPatches(
          [
            { conversation_id: 'a', split_group: null },
            { conversation_id: 'c', split_group: null },
          ],
          deps
        )
      ).rejects.toThrow(/rejected for c/);
      expect(deps.writes.at(-1)).toEqual(['a', tag('old', 3)]);
    }));

  it('reports a rollback that itself fails, and still throws', async () =>
    silenced(async (error) => {
      let calls = 0;
      const deps = makeDeps({});
      deps.update = async (id, split_group) => {
        deps.writes.push([id, split_group]);
        calls += 1;
        if (id === 'b') return false;
        // The third write is the rollback of a.
        if (calls === 3) throw new Error('rollback offline');
        return true;
      };
      await expect(
        applySplitGroupPatches(
          [
            { conversation_id: 'a', split_group: tag('g', 0) },
            { conversation_id: 'b', split_group: tag('g', 1) },
          ],
          deps
        )
      ).rejects.toThrow();
      expect(error.mock.calls.some((call) => String(call[0]).includes('Rollback failed for a'))).toBe(true);
    }));

  it('propagates a failed list reload so the caller does not navigate', async () => {
    const deps = makeDeps({});
    deps.refresh.mockRejectedValueOnce(new Error('list offline'));
    await expect(applySplitGroupPatches([{ conversation_id: 'a', split_group: tag('g', 0) }], deps)).rejects.toThrow(
      'list offline'
    );
  });

  it('does nothing for an empty plan', async () => {
    const deps = makeDeps({});
    await applySplitGroupPatches([], deps);
    expect(deps.writes).toEqual([]);
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});
