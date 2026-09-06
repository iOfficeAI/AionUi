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
 *
 * Membership comes from the backend too (`readSplitGroupCensus`), never from
 * the published list: the list drops archived rows and lags another window's
 * writes, and a group counted short clears the tags of the members it can see
 * while orphaning the ones it cannot.
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import type { SplitGroupCensus } from '../utils/splitGroupCensus';
import { readSplitGroupCensus } from '../utils/splitGroupCensus';
import type { SplitGroupPatch, SplitGroupTag } from '../utils/splitGroupHelpers';
import {
  newSplitGroupId,
  normalizeSplitGroupName,
  planCreateSplitGroup,
  readSplitGroupName,
  readSplitGroupTag,
  splitGroupTag,
} from '../utils/splitGroupHelpers';
import { refreshConversationList } from './useConversationListSync';

export const splitGroupRoute = (group_id: string): string => `/split/${group_id}`;

export type SplitGroupMutationDeps = {
  /** The conversation as the backend has it right now; `null` means a 404. Any other failure throws. */
  read: (conversation_id: string) => Promise<TChatConversation | null>;
  /** Write one conversation's tag; resolves false when the backend refuses. */
  update: (conversation_id: string, split_group: SplitGroupTag | null) => Promise<boolean>;
  /** Reload the list; resolves once the snapshot containing the write is published. */
  refresh: () => Promise<void>;
  /** Everyone the backend shows carrying a group's tag, archived rows included, and whether it could be read whole. */
  census: (group_id: string) => Promise<SplitGroupCensus>;
};

export type SplitGroupMutation =
  | { type: 'create'; target_id: string; dragged_id: string }
  | { type: 'add'; group_id: string; conversation_id: string }
  | { type: 'remove'; group_id: string; conversation_id: string }
  /** Name the group, or clear the name when it is blank. Written onto every member. */
  | { type: 'rename'; group_id: string; name: string | null }
  /**
   * Put the members in this column order. Every member's `order` is rewritten
   * from the sequence; a member the sequence does not name keeps its place
   * after the named ones, an id that is no longer a member is skipped.
   */
  | { type: 'reorder'; group_id: string; order: string[] }
  /** Leave one group and join another (or fuse with a plain row) as a single batch. */
  | {
      type: 'move';
      from_group_id: string;
      conversation_id: string;
      to: { kind: 'group'; group_id: string } | { kind: 'conversation'; conversation_id: string };
    }
  /**
   * Take a conversation out of whatever group it is in, if any. The caller
   * names no group: archiving is the caller here, and it knows the row, not
   * the membership.
   */
  | { type: 'leave-own-group'; conversation_id: string }
  /** A backend "deleted" event: remove the member only if its own read confirms it is gone. */
  | { type: 'remove-if-deleted'; group_id: string; conversation_id: string }
  /** Clear a tag left behind by a group that no longer has anyone else — proven, not assumed. */
  | { type: 'dissolve-if-alone'; group_id: string };

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

/**
 * The group's members as the backend has them now. `alsoRows` are rows this
 * mutation already read on their own: they are the authority on their own tag,
 * so they join the census rather than being read a second time.
 */
const readGroup = async (
  group_id: string,
  deps: SplitGroupMutationDeps,
  alsoRows: TChatConversation[] = []
): Promise<SplitGroupCensus> => {
  const census = await deps.census(group_id);
  const members = [...census.members];
  for (const row of alsoRows) {
    if (members.some((member) => member.id === row.id)) continue;
    if (readSplitGroupTag(row)?.id === group_id) members.push(row);
  }
  return { members, complete: census.complete };
};

/**
 * A tag whose group has nobody else left anywhere on the backend. The group
 * was dissolved while this window could not watch it — its last peer was
 * deleted with no listener attached, or in an earlier run of the app — so the
 * tag is a leftover: the row shows as a plain conversation yet refuses to join
 * any group. Proving it takes a complete count; a peer merely missed is still
 * a peer, so an incomplete read answers "no".
 */
const isLeftoverTag = async (
  tag: SplitGroupTag,
  row: TChatConversation,
  deps: SplitGroupMutationDeps
): Promise<boolean> => {
  const { members, complete } = await readGroup(tag.id, deps, [row]);
  return complete && members.every((member) => member.id === row.id);
};

/**
 * The column order a conversation joining this group takes.
 *
 * A count that could not be read whole cannot say what the highest order is,
 * and guessing hands the newcomer an order an unread member already holds —
 * two columns claiming one slot, with nothing left to tell them apart. So an
 * incomplete count refuses the join rather than writing a duplicate; the user
 * sees the failure and can try again once the backend answers whole.
 */
const nextOrderIn = (group_id: string, census: SplitGroupCensus): number => {
  if (!census.complete) throw new Error(`group ${group_id} could not be read whole`);
  return Math.max(-1, ...census.members.map((member) => readSplitGroupTag(member)?.order ?? 0)) + 1;
};

/**
 * The patches that put a group's members back in step with the name the group
 * goes by.
 *
 * Readers take the name from the first member by column order, so a member a
 * half-landed rename left behind shows nothing wrong until it becomes the
 * first one — at which point the group silently changes its name. Every write
 * that touches the group carries the repair, which is what "the next
 * successful write reconciles them" has to mean: a rename is not the only
 * write, and waiting for one would leave a divergence nobody can see.
 *
 * Members already carrying the name produce no patch, so the common case adds
 * nothing to the batch.
 */
const reconcileNamePatches = (members: TChatConversation[], name: string | undefined): SplitGroupPatch[] =>
  members.flatMap((member): SplitGroupPatch[] => {
    const tag = readSplitGroupTag(member);
    // `readGroup` only ever returns rows whose tag parsed and named this
    // group, so this narrows the type — it never skips a member.
    if (!tag || tag.name === name) return [];
    return [{ conversation_id: member.id, split_group: splitGroupTag(tag.id, tag.order, name) }];
  });

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
    const draggedTag = readSplitGroupTag(dragged);
    // A leftover tag is overwritten by the new one, so the row joins instead of
    // being turned away by a group that no longer exists.
    if (draggedTag && !(await isLeftoverTag(draggedTag, dragged, deps)))
      throw new Error(`${dragged.id} already belongs to a group`);
    const targetTag = readSplitGroupTag(target);
    if (targetTag) {
      // The target joined a group since the drag started: add to that group.
      const census = await readGroup(targetTag.id, deps, [target]);
      census.members.forEach(remember);
      const groupName = readSplitGroupName(census.members);
      const patches: SplitGroupPatch[] = [
        {
          conversation_id: dragged.id,
          split_group: splitGroupTag(targetTag.id, nextOrderIn(targetTag.id, census), groupName),
        },
        ...reconcileNamePatches(census.members, groupName),
      ];
      await applySplitGroupPatches(patches, previous, deps);
      return { group_id: targetTag.id, dissolved: false, survivor: null };
    }
    const patches = planCreateSplitGroup(target.id, dragged.id);
    await applySplitGroupPatches(patches, previous, deps);
    return { group_id: patches[0].split_group?.id ?? null, dissolved: false, survivor: null };
  }

  if (mutation.type === 'add') {
    const [row, census] = await Promise.all([deps.read(mutation.conversation_id), readGroup(mutation.group_id, deps)]);
    if (!row) throw new Error(`${mutation.conversation_id} no longer exists`);
    if (census.members.length === 0) throw new Error(`group ${mutation.group_id} no longer exists`);
    if (census.members.some((member) => member.id === row.id)) {
      return { group_id: mutation.group_id, dissolved: false, survivor: null, noop: 'already a member' };
    }
    const rowTag = readSplitGroupTag(row);
    if (rowTag && !(await isLeftoverTag(rowTag, row, deps))) throw new Error(`${row.id} already belongs to a group`);
    remember(row);
    census.members.forEach(remember);
    const groupName = readSplitGroupName(census.members);
    const patches: SplitGroupPatch[] = [
      {
        conversation_id: row.id,
        split_group: splitGroupTag(mutation.group_id, nextOrderIn(mutation.group_id, census), groupName),
      },
      ...reconcileNamePatches(census.members, groupName),
    ];
    await applySplitGroupPatches(patches, previous, deps);
    return { group_id: mutation.group_id, dissolved: false, survivor: null };
  }

  if (mutation.type === 'dissolve-if-alone') {
    const { members, complete } = await readGroup(mutation.group_id, deps);
    if (members.length >= 2) {
      return { group_id: mutation.group_id, dissolved: false, survivor: null, noop: 'the group still has members' };
    }
    if (members.length === 0) {
      return { group_id: mutation.group_id, dissolved: false, survivor: null, noop: 'nobody carries the tag' };
    }
    if (!complete) {
      return {
        group_id: mutation.group_id,
        dissolved: false,
        survivor: null,
        noop: 'the backend could not be read whole',
      };
    }
    members.forEach(remember);
    await applySplitGroupPatches([{ conversation_id: members[0].id, split_group: null }], previous, deps);
    return { group_id: mutation.group_id, dissolved: true, survivor: members[0].id };
  }

  if (mutation.type === 'rename') {
    const census = await readGroup(mutation.group_id, deps);
    // Every member carries the name, so a rename is only a rename once it has
    // reached all of them. A count read short would name the members it could
    // see and report success, leaving the group disagreeing with itself — so
    // it refuses instead, loudly, the way the join paths do.
    if (!census.complete) throw new Error(`group ${mutation.group_id} could not be read whole`);
    // A group is at least two members. One tag left behind by a dissolve is
    // not a group to name; naming it would report success over a leftover
    // that the next complete read is going to clear anyway.
    if (census.members.length < 2) throw new Error(`group ${mutation.group_id} no longer exists`);
    census.members.forEach(remember);
    const name = normalizeSplitGroupName(mutation.name);
    const patches = reconcileNamePatches(census.members, name);
    if (patches.length === 0) {
      return { group_id: mutation.group_id, dissolved: false, survivor: null, noop: 'the name is already that' };
    }
    await applySplitGroupPatches(patches, previous, deps);
    return { group_id: mutation.group_id, dissolved: false, survivor: null };
  }

  if (mutation.type === 'reorder') {
    const census = await readGroup(mutation.group_id, deps);
    // The order lives on every member, so it is only an order once every
    // member carries its slot. A count read short would number the members it
    // could see and leave the rest colliding with them — so it refuses,
    // loudly, the way the join and rename paths do.
    if (!census.complete) throw new Error(`group ${mutation.group_id} could not be read whole`);
    if (census.members.length < 2) throw new Error(`group ${mutation.group_id} no longer exists`);
    census.members.forEach(remember);
    const byId = new Map(census.members.map((member) => [member.id, member]));
    // Named first, in the sequence's order; anyone the sequence missed (joined
    // since the drag started) keeps the tail in the order they had.
    // A sequence that names a member twice is not an order; nothing of it is
    // written, and the refusal is loud like every other one on this boundary.
    if (new Set(mutation.order).size !== mutation.order.length) {
      throw new Error(`reorder of group ${mutation.group_id} names a member twice: ${mutation.order.join(', ')}`);
    }
    const named = mutation.order.filter((id) => byId.has(id));
    const rest = census.members
      .filter((member) => !named.includes(member.id))
      .toSorted((a, b) => (readSplitGroupTag(a)?.order ?? 0) - (readSplitGroupTag(b)?.order ?? 0))
      .map((member) => member.id);
    const sequence = [...named, ...rest];
    // The name rides along: readers take it from the first member by order,
    // so a member a half-landed rename left behind, moved first, would rename
    // the group. Every member is written with the name the group goes by now.
    const name = readSplitGroupName(census.members);
    const patches: SplitGroupPatch[] = [];
    sequence.forEach((id, index) => {
      const member = byId.get(id);
      const tag = member ? readSplitGroupTag(member) : null;
      if (!member || !tag || (tag.order === index && tag.name === name)) return;
      patches.push({ conversation_id: id, split_group: splitGroupTag(tag.id, index, name) });
    });
    if (patches.length === 0) {
      return { group_id: mutation.group_id, dissolved: false, survivor: null, noop: 'the order is already that' };
    }
    await applySplitGroupPatches(patches, previous, deps);
    return { group_id: mutation.group_id, dissolved: false, survivor: null };
  }

  if (mutation.type === 'leave-own-group') {
    const row = await deps.read(mutation.conversation_id);
    if (!row) return { group_id: null, dissolved: false, survivor: null, noop: 'no longer exists' };
    const tag = readSplitGroupTag(row);
    if (!tag) return { group_id: null, dissolved: false, survivor: null, noop: 'not in a group' };
    // From here it is an ordinary removal, dissolve rule and all — the only
    // thing this arm adds is finding out which group to name.
    return runSplitGroupMutation({ type: 'remove', group_id: tag.id, conversation_id: row.id }, deps);
  }

  if (mutation.type === 'move') {
    const row = await deps.read(mutation.conversation_id);
    if (!row) throw new Error(`${mutation.conversation_id} no longer exists`);
    const source = await readGroup(mutation.from_group_id, deps, [row]);
    source.members.forEach(remember);
    if (!source.members.some((member) => member.id === row.id)) {
      return { group_id: mutation.from_group_id, dissolved: false, survivor: null, noop: 'not a member' };
    }
    const staying = source.members.filter((member) => member.id !== row.id);

    // Where it is going, resolved now rather than when the drag started: the
    // destination may have joined a group, or become one, in between.
    let destination_id: string;
    const patches: SplitGroupPatch[] = [];
    if (mutation.to.kind === 'group') {
      const census = await readGroup(mutation.to.group_id, deps);
      if (census.members.length === 0) throw new Error(`group ${mutation.to.group_id} no longer exists`);
      destination_id = mutation.to.group_id;
      census.members.forEach(remember);
      const groupName = readSplitGroupName(census.members);
      patches.push(
        {
          conversation_id: row.id,
          split_group: splitGroupTag(destination_id, nextOrderIn(destination_id, census), groupName),
        },
        ...reconcileNamePatches(census.members, groupName)
      );
    } else {
      const target = await deps.read(mutation.to.conversation_id);
      if (!target) throw new Error(`${mutation.to.conversation_id} no longer exists`);
      remember(target);
      const targetTag = readSplitGroupTag(target);
      if (targetTag && targetTag.id === mutation.from_group_id) {
        return { group_id: mutation.from_group_id, dissolved: false, survivor: null, noop: 'the same group' };
      }
      if (targetTag) {
        const census = await readGroup(targetTag.id, deps, [target]);
        destination_id = targetTag.id;
        census.members.forEach(remember);
        const groupName = readSplitGroupName(census.members);
        patches.push(
          {
            conversation_id: row.id,
            split_group: splitGroupTag(destination_id, nextOrderIn(destination_id, census), groupName),
          },
          ...reconcileNamePatches(census.members, groupName)
        );
      } else {
        destination_id = newSplitGroupId();
        patches.push(...planCreateSplitGroup(target.id, row.id, destination_id));
      }
    }

    // The group it leaves dissolves under the same rule a plain removal uses:
    // a survivor's tag is cleared only when a complete count proves the group
    // is too small to exist.
    const dissolved = staying.length < 2 && source.complete;
    if (staying.length < 2 && !source.complete) {
      console.error(
        `[SplitGroup] Could not read every conversation, so group ${mutation.from_group_id} was not dissolved; ${staying.map((member) => member.id).join(', ')} keeps its tag.`
      );
    }
    if (dissolved) {
      for (const member of staying) patches.push({ conversation_id: member.id, split_group: null });
    } else {
      // Same rule on the way out as on the way in: the group being left keeps
      // the name it had, even when the member who carried it is the one going —
      // and, as in a removal, a short count still holds the survivors it read.
      if (!source.complete) {
        console.error(
          `[SplitGroup] Could not read every conversation of group ${mutation.from_group_id}; its name was held only among ${staying.map((member) => member.id).join(', ')}.`
        );
      }
      patches.push(...reconcileNamePatches(staying, readSplitGroupName(source.members)));
    }
    await applySplitGroupPatches(patches, previous, deps);
    return { group_id: destination_id, dissolved, survivor: dissolved ? (staying[0]?.id ?? null) : null };
  }

  // remove / remove-if-deleted
  const row = await deps.read(mutation.conversation_id);
  if (mutation.type === 'remove-if-deleted' && row !== null) {
    return { group_id: mutation.group_id, dissolved: false, survivor: null, noop: 'not deleted' };
  }
  const { members, complete } = await readGroup(mutation.group_id, deps, row ? [row] : []);
  members.forEach(remember);
  const leaving = members.find((member) => member.id === mutation.conversation_id);
  const remaining = members.filter((member) => member.id !== mutation.conversation_id);
  if (!leaving && remaining.length >= 2) {
    return { group_id: mutation.group_id, dissolved: false, survivor: null, noop: 'not a member' };
  }
  // The member the user asked to remove always leaves. A survivor's tag is
  // cleared only because the count says the group is too small to exist, and
  // an incomplete count cannot say that — it keeps its tag and the next
  // complete read (a regroup, or reopening the route) clears it.
  const dissolved = remaining.length < 2 && complete;
  if (remaining.length < 2 && !complete) {
    console.error(
      `[SplitGroup] Could not read every conversation, so group ${mutation.group_id} was not dissolved; ${remaining.map((member) => member.id).join(', ')} keeps its tag.`
    );
  }
  const cleared = [...(leaving ? [leaving] : []), ...(dissolved ? remaining : [])];
  const patches = cleared.map((member): SplitGroupPatch => ({ conversation_id: member.id, split_group: null }));
  // Taking a member out can change what the group is called: readers take the
  // name from the first member by order, so removing that first member hands
  // the group whatever the next one happens to carry. The name the group had
  // before this write is the name it keeps, and the members that stay are put
  // back in step with it here — a group does not get renamed by someone
  // leaving it. A short count cannot name every survivor, but it can still
  // hold the ones it read to the name the group had: after any complete write
  // every member agrees, so the name read from the lowest order on hand is the
  // group's name, and leaving the read survivors alone would let the group
  // rename itself the moment its carrier left. The unread ones are put back in
  // step by the next complete write, and the short read is said out loud.
  if (!dissolved) {
    if (!complete) {
      console.error(
        `[SplitGroup] Could not read every conversation of group ${mutation.group_id}; its name was held only among ${remaining.map((member) => member.id).join(', ')}.`
      );
    }
    patches.push(...reconcileNamePatches(remaining, readSplitGroupName(members)));
  }
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
  census: (group_id) => readSplitGroupCensus(group_id),
};

/** Mutations run one after another; each reads the backend when its turn comes. */
let mutationQueue: Promise<void> = Promise.resolve();

/**
 * Focus requests are told apart by a counter, not by the clock: two requests
 * for the same member inside one millisecond (a held Enter on a member row)
 * are two requests, and the second must not be swallowed as a repeat of the
 * first.
 */
let focusNonce = 0;
export const nextFocusNonce = (): number => (focusNonce += 1);

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
        void navigate(splitGroupRoute(result.group_id), { state: { focus: dragged_id, nonce: nextFocusNonce() } });
    },
    [enqueue, navigate]
  );

  const addMember = useCallback(
    async (group_id: string, conversation_id: string, { open = false }: OpenOption = {}): Promise<void> => {
      const result = await enqueue('add member', { type: 'add', group_id, conversation_id });
      if (open && result?.group_id)
        void navigate(splitGroupRoute(result.group_id), {
          state: { focus: conversation_id, nonce: nextFocusNonce() },
        });
    },
    [enqueue, navigate]
  );

  const removeMember = useCallback(
    async (group_id: string, conversation_id: string): Promise<void> => {
      leaveDissolvedGroup(group_id, await enqueue('remove member', { type: 'remove', group_id, conversation_id }));
    },
    [enqueue, leaveDissolvedGroup]
  );

  /**
   * Name the group, or clear its name when the input is blank. Answers whether
   * the write landed, so the box the name was typed into can keep it when it
   * did not — the queue has already said what went wrong.
   */
  /** Put the group's columns in this order. Answers whether the write landed. */
  const reorderMembers = useCallback(
    async (group_id: string, order: string[]): Promise<boolean> => {
      return (await enqueue('reorder group', { type: 'reorder', group_id, order })) !== null;
    },
    [enqueue]
  );

  const renameGroup = useCallback(
    async (group_id: string, name: string | null): Promise<boolean> => {
      return (await enqueue('rename group', { type: 'rename', group_id, name })) !== null;
    },
    [enqueue]
  );

  /**
   * Drag a member onto another group or another row: it leaves where it was
   * and joins where it landed as one reconciled batch, so it is never briefly
   * in both places or in neither.
   */
  const moveMember = useCallback(
    async (
      from_group_id: string,
      conversation_id: string,
      to: { kind: 'group'; group_id: string } | { kind: 'conversation'; conversation_id: string },
      { open = false }: OpenOption = {}
    ): Promise<void> => {
      const result = await enqueue('move member', { type: 'move', from_group_id, conversation_id, to });
      // Released on the open chat area, the gesture asks to *see* what it
      // built. That navigation supersedes the one a dissolved source would
      // ask for: the group the user is looking at is the destination now.
      if (open && result?.group_id) {
        void navigate(splitGroupRoute(result.group_id), {
          state: { focus: conversation_id, nonce: nextFocusNonce() },
        });
        return;
      }
      leaveDissolvedGroup(from_group_id, result);
    },
    [enqueue, leaveDissolvedGroup, navigate]
  );

  /**
   * Take a conversation out of its split group before something else takes it
   * out of the sidebar. Archiving is the caller: an archived member leaves the
   * active list but keeps its tag, so the group it was in shows one loaded
   * member and folds back into a plain row — while the census, which counts
   * archived rows, still sees two and refuses to dissolve it or to let the
   * survivor join anything else. Leaving first turns that dead end into an
   * ordinary removal.
   */
  const leaveOwnGroup = useCallback(
    async (
      conversation_id: string,
      /**
       * Whether a dissolve may move the user onto *this* survivor, asked once
       * the survivor is known. Worth it when the survivor stays — that is where
       * the user was already looking, and the columns they were in are gone.
       * Not worth it when the caller is about to take that survivor away too:
       * it would land them on a row that is seconds from leaving the list. Only
       * the caller knows which rows it is taking, and only the write knows who
       * survived, so the caller answers per survivor rather than up front.
       */
      { moveToSurvivor = () => true }: { moveToSurvivor?: (survivor_id: string, group_id: string) => boolean } = {}
    ): Promise<boolean> => {
      const result = await enqueue('leave own group', { type: 'leave-own-group', conversation_id });
      // The queue turns a refused write into `null` and says so on screen. The
      // caller still has to hear it: archiving a member whose tag could not be
      // cleared is exactly the dead end this call exists to prevent, and
      // reporting the archive as done would hide it.
      if (!result) return false;
      if (result.group_id && result.survivor && moveToSurvivor(result.survivor, result.group_id)) {
        leaveDissolvedGroup(result.group_id, result);
      }
      return true;
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

  /**
   * Clear a tag whose group has provably nobody else left. The route reaches
   * here when a group it was asked to open has collapsed to a single member:
   * that member is either a survivor of a dissolve this window never saw (its
   * peer was deleted while no listener was attached, or in an earlier run) or
   * the only member the list can show while a peer sits in the archive. The
   * census tells the two apart; only the first clears a tag.
   */
  const dissolveIfAlone = useCallback(
    async (group_id: string): Promise<void> => {
      await enqueue('dissolve if alone', { type: 'dissolve-if-alone', group_id });
    },
    [enqueue]
  );

  return {
    createGroup,
    addMember,
    removeMember,
    moveMember,
    renameGroup,
    reorderMembers,
    leaveOwnGroup,
    reconcileDeleted,
    dissolveIfAlone,
  };
};
