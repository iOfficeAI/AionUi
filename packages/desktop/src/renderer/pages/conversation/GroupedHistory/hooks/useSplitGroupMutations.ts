/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The write path for split groups: one serialized queue, and every mutation
 * reads the conversations it touches from the backend when its turn comes.
 *
 * Nothing a caller saw when it asked is trusted at execution time — not the
 * group's members, not the tags, not whether a conversation still exists.
 * The plan is built from fresh reads, written as one reconciled batch with
 * rollback, and followed by exactly one list refresh that resolves only when
 * the snapshot containing the write has landed. A conversation counts as
 * deleted only when the backend answers its own read with 404; absence from a
 * list snapshot (archived, filtered, not loaded) never is.
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import type { SplitGroupPatch, SplitGroupTag } from '../utils/splitGroupHelpers';
import { planCreateSplitGroup, readSplitGroupTag } from '../utils/splitGroupHelpers';
import { getSnapshotConversations, refreshConversationList } from './useConversationListSync';

export const splitGroupRoute = (group_id: string): string => `/split/${group_id}`;

export type SplitGroupMutationDeps = {
  /** The conversation as the backend has it right now; `null` means a 404. Any other failure throws. */
  read: (conversation_id: string) => Promise<TChatConversation | null>;
  /** Write one conversation's tag; resolves false when the backend refuses. */
  update: (conversation_id: string, split_group: SplitGroupTag | null) => Promise<boolean>;
  /** Reload the list; resolves once the snapshot containing the write is published. */
  refresh: () => Promise<void>;
  /** Conversations the published list shows for a group — a starting point for the fresh reads, never the truth. */
  candidates: (group_id: string) => string[];
};

export type SplitGroupMutation =
  | { type: 'create'; target_id: string; dragged_id: string }
  | { type: 'add'; group_id: string; conversation_id: string }
  | { type: 'remove'; group_id: string; conversation_id: string }
  /** A backend "deleted" event: remove the member only if its own read confirms it is gone. */
  | { type: 'remove-if-deleted'; group_id: string; conversation_id: string };

export type SplitGroupMutationResult = {
  group_id: string | null;
  /** The group is down to one member and that member's tag was cleared too. */
  dissolved: boolean;
  survivor: string | null;
  /** Nothing was written and why. */
  noop?: string;
};

const settle = async (
  patches: SplitGroupPatch[],
  deps: Pick<SplitGroupMutationDeps, 'update'>
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
 * Persist a planned set of tag patches as one batch. The backend applies each
 * conversation's update on its own, so a batch can half-land; when any write
 * is refused, the writes that did land are put back to the tags they had
 * (from the fresh reads) and the error is thrown. A rollback that itself fails
 * is reported loudly with the ids left inconsistent.
 */
export const applySplitGroupPatches = async (
  patches: SplitGroupPatch[],
  previousTags: ReadonlyMap<string, SplitGroupTag | null>,
  deps: Pick<SplitGroupMutationDeps, 'update' | 'refresh'>
): Promise<void> => {
  if (patches.length === 0) return;
  const { succeeded, failed } = await settle(patches, deps);
  if (failed.length > 0) {
    const rollback = succeeded.map(
      (patch): SplitGroupPatch => ({
        conversation_id: patch.conversation_id,
        split_group: previousTags.get(patch.conversation_id) ?? null,
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

const unique = (ids: string[]): string[] => Array.from(new Set(ids));

/** The group's members as the backend has them now: every candidate re-read, kept only if it still carries the tag. */
const readGroupFresh = async (
  group_id: string,
  deps: SplitGroupMutationDeps,
  alsoIds: string[] = []
): Promise<TChatConversation[]> => {
  const ids = unique([...deps.candidates(group_id), ...alsoIds]);
  const rows = await Promise.all(ids.map((id) => deps.read(id)));
  return rows.filter((row): row is TChatConversation => row !== null && readSplitGroupTag(row)?.id === group_id);
};

const nextOrder = (members: TChatConversation[]): number =>
  Math.max(-1, ...members.map((member) => readSplitGroupTag(member)?.order ?? 0)) + 1;

/**
 * Carry out one mutation against the backend as it is right now. Pure with
 * respect to its dependencies, so the decision table is testable without the
 * IPC bridge or the queue.
 */
export const runSplitGroupMutation = async (
  mutation: SplitGroupMutation,
  deps: SplitGroupMutationDeps
): Promise<SplitGroupMutationResult> => {
  const previous = new Map<string, SplitGroupTag | null>();
  const remember = (row: TChatConversation) => previous.set(row.id, readSplitGroupTag(row));

  if (mutation.type === 'create') {
    const [target, dragged] = await Promise.all([deps.read(mutation.target_id), deps.read(mutation.dragged_id)]);
    if (!target || !dragged) throw new Error('a conversation in the drop no longer exists');
    remember(target);
    remember(dragged);
    if (readSplitGroupTag(dragged)) throw new Error(`${dragged.id} already belongs to a group`);
    const targetTag = readSplitGroupTag(target);
    if (targetTag) {
      // The target joined a group since the drag started: add to that group.
      const members = await readGroupFresh(targetTag.id, deps, [target.id]);
      members.forEach(remember);
      const patches: SplitGroupPatch[] = [
        { conversation_id: dragged.id, split_group: { id: targetTag.id, order: nextOrder(members) } },
      ];
      await applySplitGroupPatches(patches, previous, deps);
      return { group_id: targetTag.id, dissolved: false, survivor: null };
    }
    const patches = planCreateSplitGroup(target.id, dragged.id);
    await applySplitGroupPatches(patches, previous, deps);
    return { group_id: patches[0].split_group?.id ?? null, dissolved: false, survivor: null };
  }

  if (mutation.type === 'add') {
    const [row, members] = await Promise.all([
      deps.read(mutation.conversation_id),
      readGroupFresh(mutation.group_id, deps),
    ]);
    if (!row) throw new Error(`${mutation.conversation_id} no longer exists`);
    if (members.length === 0) throw new Error(`group ${mutation.group_id} no longer exists`);
    if (members.some((member) => member.id === row.id)) {
      return { group_id: mutation.group_id, dissolved: false, survivor: null, noop: 'already a member' };
    }
    if (readSplitGroupTag(row)) throw new Error(`${row.id} already belongs to a group`);
    remember(row);
    const patches: SplitGroupPatch[] = [
      { conversation_id: row.id, split_group: { id: mutation.group_id, order: nextOrder(members) } },
    ];
    await applySplitGroupPatches(patches, previous, deps);
    return { group_id: mutation.group_id, dissolved: false, survivor: null };
  }

  // remove / remove-if-deleted
  const row = await deps.read(mutation.conversation_id);
  if (mutation.type === 'remove-if-deleted' && row !== null) {
    return { group_id: mutation.group_id, dissolved: false, survivor: null, noop: 'not deleted' };
  }
  const members = await readGroupFresh(mutation.group_id, deps, [mutation.conversation_id]);
  members.forEach(remember);
  const leaving = members.find((member) => member.id === mutation.conversation_id);
  const remaining = members.filter((member) => member.id !== mutation.conversation_id);
  if (!leaving && remaining.length >= 2) {
    return { group_id: mutation.group_id, dissolved: false, survivor: null, noop: 'not a member' };
  }
  const dissolved = remaining.length < 2;
  const cleared = [...(leaving ? [leaving] : []), ...(dissolved ? remaining : [])];
  const patches = cleared.map((member): SplitGroupPatch => ({ conversation_id: member.id, split_group: null }));
  await applySplitGroupPatches(patches, previous, deps);
  return { group_id: mutation.group_id, dissolved, survivor: dissolved ? (remaining[0]?.id ?? null) : null };
};

const ipcDeps: SplitGroupMutationDeps = {
  // Resolved at call time so a test that stubs the cache module without this
  // export can still import the hook.
  read: (conversation_id) => getConversationOrNull(conversation_id),
  update: (conversation_id, split_group) =>
    ipcBridge.conversation.update.invoke({
      id: conversation_id,
      updates: {
        extra: { split_group } as Partial<TChatConversation['extra']>,
      } as Partial<TChatConversation>,
      merge_extra: true,
    }),
  refresh: refreshConversationList,
  candidates: (group_id) =>
    getSnapshotConversations()
      .filter((conversation) => readSplitGroupTag(conversation)?.id === group_id)
      .map((conversation) => conversation.id),
};

/** Mutations run one after another; each reads the backend when its turn comes. */
let mutationQueue: Promise<void> = Promise.resolve();

type OpenOption = {
  /** Navigate to the group's columns once the change has landed. */
  open?: boolean;
};

/**
 * The things a user can do to a split group, each queued, read fresh, written
 * as one batch, and reported loudly when the backend refuses.
 */
export const useSplitGroupMutations = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // Read at execution time: a queued mutation must see the route as it is
  // when it runs, not as it was when it was requested.
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const enqueue = useCallback(
    (label: string, mutation: SplitGroupMutation): Promise<SplitGroupMutationResult | null> => {
      const turn = mutationQueue.then(async () => {
        try {
          const result = await runSplitGroupMutation(mutation, ipcDeps);
          if (result.noop) console.info(`[SplitGroup] ${label}: nothing to do (${result.noop}).`);
          return result;
        } catch (error) {
          console.error(`[SplitGroup] ${label} failed:`, error);
          Message.error(t('conversation.splitGroup.updateFailed'));
          return null;
        }
      });
      mutationQueue = turn.then((): void => undefined);
      return turn;
    },
    [t]
  );

  const leaveDissolvedGroup = useCallback(
    (group_id: string, result: SplitGroupMutationResult | null) => {
      // A group that dissolved while its columns were open leaves the survivor
      // on screen as a plain conversation, where the user was already looking.
      if (result?.dissolved && result.survivor && pathnameRef.current === splitGroupRoute(group_id)) {
        void navigate(`/conversation/${result.survivor}`, { replace: true });
      }
    },
    [navigate]
  );

  const createGroup = useCallback(
    async (target_id: string, dragged_id: string, { open = false }: OpenOption = {}): Promise<void> => {
      const result = await enqueue('create', { type: 'create', target_id, dragged_id });
      if (open && result?.group_id)
        void navigate(splitGroupRoute(result.group_id), { state: { focus: dragged_id, nonce: Date.now() } });
    },
    [enqueue, navigate]
  );

  const addMember = useCallback(
    async (group_id: string, conversation_id: string, { open = false }: OpenOption = {}): Promise<void> => {
      const result = await enqueue('add member', { type: 'add', group_id, conversation_id });
      if (open && result?.group_id)
        void navigate(splitGroupRoute(result.group_id), { state: { focus: conversation_id, nonce: Date.now() } });
    },
    [enqueue, navigate]
  );

  const removeMember = useCallback(
    async (group_id: string, conversation_id: string): Promise<void> => {
      leaveDissolvedGroup(group_id, await enqueue('remove member', { type: 'remove', group_id, conversation_id }));
    },
    [enqueue, leaveDissolvedGroup]
  );

  /** A backend "deleted" event for a member: reconcile the group, but only once the member's own read confirms it is gone. */
  const reconcileDeleted = useCallback(
    async (group_id: string, conversation_id: string): Promise<void> => {
      leaveDissolvedGroup(
        group_id,
        await enqueue('reconcile deleted member', { type: 'remove-if-deleted', group_id, conversation_id })
      );
    },
    [enqueue, leaveDissolvedGroup]
  );

  return { createGroup, addMember, removeMember, reconcileDeleted };
};
