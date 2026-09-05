/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import type { SplitGroup, SplitGroupPatch, SplitGroupTag } from '../utils/splitGroupHelpers';
import {
  buildSplitGroups,
  findSplitGroupOf,
  planAddSplitGroupMember,
  planCreateSplitGroup,
  planRemoveSplitGroupMember,
  readSplitGroupTag,
} from '../utils/splitGroupHelpers';
import { getSnapshotConversations, refreshConversationList } from './useConversationListSync';

export const splitGroupRoute = (group_id: string): string => `/split/${group_id}`;

export type SplitGroupPatchDeps = {
  /** Write one conversation's tag; resolves false when the backend refuses. */
  update: (conversation_id: string, split_group: SplitGroupTag | null) => Promise<boolean>;
  /** The tag a conversation carries right now, for rolling a failed batch back. */
  previousTag: (conversation_id: string) => SplitGroupTag | null;
  /** Reload the list; rejects when the reload fails. */
  refresh: () => Promise<void>;
};

const settle = async (
  patches: SplitGroupPatch[],
  deps: SplitGroupPatchDeps
): Promise<{ succeeded: SplitGroupPatch[]; failed: Array<{ patch: SplitGroupPatch; reason: unknown }> }> => {
  const results = await Promise.allSettled(
    patches.map((patch) => deps.update(patch.conversation_id, patch.split_group))
  );
  const succeeded: SplitGroupPatch[] = [];
  const failed: Array<{ patch: SplitGroupPatch; reason: unknown }> = [];
  results.forEach((result, index) => {
    const patch = patches[index];
    if (result.status === 'fulfilled' && result.value) succeeded.push(patch);
    else failed.push({ patch, reason: result.status === 'rejected' ? result.reason : 'rejected by the backend' });
  });
  return { succeeded, failed };
};

/**
 * Persist a planned set of tag patches (merge-patched into `extra`, next to
 * pin state and sort order), then reload the sidebar list so the pill exists
 * before anyone navigates to it.
 *
 * The backend applies each conversation's update on its own, so a batch can
 * half-land. That must never leave one member tagged and the other not: when
 * any write is refused, the writes that did land are put back to the tags they
 * had before, and the error is thrown. A rollback that itself fails is
 * reported loudly with the ids left inconsistent.
 */
export const applySplitGroupPatches = async (patches: SplitGroupPatch[], deps: SplitGroupPatchDeps): Promise<void> => {
  if (patches.length === 0) return;
  const previous = new Map(patches.map((patch) => [patch.conversation_id, deps.previousTag(patch.conversation_id)]));

  const { succeeded, failed } = await settle(patches, deps);
  if (failed.length > 0) {
    const rollback = succeeded.map(
      (patch): SplitGroupPatch => ({
        conversation_id: patch.conversation_id,
        split_group: previous.get(patch.conversation_id) ?? null,
      })
    );
    const undone = await settle(rollback, deps);
    if (undone.failed.length > 0) {
      console.error(
        `[SplitGroup] Rollback failed for ${undone.failed.map((entry) => entry.patch.conversation_id).join(', ')}; their split_group tags are inconsistent.`,
        undone.failed.map((entry) => entry.reason)
      );
    }
    const rejected = failed.map((entry) => entry.patch.conversation_id).join(', ');
    console.error(
      `[SplitGroup] split_group update rejected for ${rejected}:`,
      failed.map((entry) => entry.reason)
    );
    throw new Error(`split_group update rejected for ${rejected}`);
  }

  await deps.refresh();
};

const ipcDeps: SplitGroupPatchDeps = {
  update: (conversation_id, split_group) =>
    ipcBridge.conversation.update.invoke({
      id: conversation_id,
      updates: {
        extra: { split_group } as Partial<TChatConversation['extra']>,
      } as Partial<TChatConversation>,
      merge_extra: true,
    }),
  previousTag: (conversation_id) => {
    const conversation = getSnapshotConversations().find((candidate) => candidate.id === conversation_id);
    return conversation ? readSplitGroupTag(conversation) : null;
  },
  refresh: refreshConversationList,
};

/** The group a conversation belongs to in the list as published right now. */
const currentGroupOf = (conversation_id: string): SplitGroup | undefined =>
  findSplitGroupOf(buildSplitGroups([...getSnapshotConversations()]), conversation_id);

/**
 * Mutations run one after another. Two removals fired in the same render
 * (two members found deleted at once) would otherwise both plan against the
 * same stale group and leave the survivor with a tag nobody clears; queued,
 * the second one re-reads the group after the first has landed.
 */
let mutationQueue: Promise<void> = Promise.resolve();

type OpenOption = {
  /** Navigate to the group's columns once the change has landed. */
  open?: boolean;
};

/**
 * The things a user can do to a split group, each persisted on the member
 * conversations and reported loudly when the backend refuses.
 */
export const useSplitGroupMutations = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // Read at execution time: a queued mutation must see the route as it is
  // when it runs, not as it was when it was requested.
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const run = useCallback(
    (label: string, mutation: () => Promise<void>): Promise<boolean> => {
      const turn = mutationQueue.then(async () => {
        try {
          await mutation();
          return true;
        } catch (error) {
          console.error(`[SplitGroup] ${label} failed:`, error);
          Message.error(t('conversation.splitGroup.updateFailed'));
          return false;
        }
      });
      mutationQueue = turn.then((): void => undefined);
      return turn;
    },
    [t]
  );

  const createGroup = useCallback(
    async (target_id: string, dragged_id: string, { open = false }: OpenOption = {}): Promise<void> => {
      const patches = planCreateSplitGroup(target_id, dragged_id);
      const group_id = patches[0].split_group?.id ?? '';
      const ok = await run('create', () => applySplitGroupPatches(patches, ipcDeps));
      if (ok && open) void navigate(splitGroupRoute(group_id), { state: { focus: dragged_id } });
    },
    [navigate, run]
  );

  const addMember = useCallback(
    async (group: SplitGroup, conversation_id: string, { open = false }: OpenOption = {}): Promise<void> => {
      const ok = await run('add member', () =>
        applySplitGroupPatches(
          planAddSplitGroupMember(currentGroupOf(group.members[0].id) ?? group, conversation_id),
          ipcDeps
        )
      );
      if (ok && open) void navigate(splitGroupRoute(group.id), { state: { focus: conversation_id } });
    },
    [navigate, run]
  );

  const removeMember = useCallback(
    async (group: SplitGroup, conversation_id: string): Promise<void> => {
      let survivor: string | null = null;
      const ok = await run('remove member', async () => {
        // The group as the list has it now, not as the caller saw it: an
        // earlier queued removal may already have shrunk it.
        const fresh = currentGroupOf(conversation_id);
        if (!fresh) return;
        const removal = planRemoveSplitGroupMember(fresh, conversation_id);
        await applySplitGroupPatches(removal.patches, ipcDeps);
        if (removal.dissolved) survivor = removal.remaining[0] ?? null;
      });
      // A group that dissolved while its columns were open leaves the survivor
      // on screen as a plain conversation, where the user was already looking.
      if (ok && survivor && pathnameRef.current === splitGroupRoute(group.id)) {
        void navigate(`/conversation/${survivor}`, { replace: true });
      }
    },
    [navigate, run]
  );

  /**
   * A conversation still tagged with a group that no longer has two members
   * (the other member was deleted or archived underneath): clear the tag so
   * the row is plain again, and say where the user should land.
   */
  const clearLeftoverTag = useCallback(
    (conversation_id: string): Promise<boolean> =>
      run('clear leftover tag', () => applySplitGroupPatches([{ conversation_id, split_group: null }], ipcDeps)),
    [run]
  );

  return { createGroup, addMember, removeMember, clearLeftoverTag };
};
