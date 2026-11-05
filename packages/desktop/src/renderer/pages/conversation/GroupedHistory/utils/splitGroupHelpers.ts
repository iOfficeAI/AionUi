/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Split groups: several conversations fused into one sidebar pill that opens
 * as side-by-side columns (Arc-style split view).
 *
 * A group has no record of its own. Each member conversation carries a tag in
 * its backend metadata bag (`extra.split_group`), next to its pin state and
 * sort order, so the group persists across restarts and is the same on every
 * device. The tag says which group the conversation belongs to and where its
 * column sits. Removing a member clears its tag; the conversation itself is
 * never touched.
 *
 * Everything in this file is pure: reading tags, deriving the groups from a
 * loaded conversation list, deciding where the pill sits, and planning the
 * tag patches for a mutation. Persisting the patches is the caller's job.
 */

import type { TChatConversation } from '@/common/config/storage';
import { uuid } from '@/common/utils';

/** The tag stored on each member conversation's `extra`. */
export type SplitGroupTag = {
  id: string;
  order: number;
};

export type SplitGroup = {
  id: string;
  /** Members in column order. Always at least two. */
  members: TChatConversation[];
};

/** One conversation's tag update: `null` clears the tag. */
export type SplitGroupPatch = {
  conversation_id: string;
  split_group: SplitGroupTag | null;
};

export const SPLIT_GROUP_EXTRA_KEY = 'split_group';

const warnedMalformedIds = new Set<string>();
const warnedSingletonGroupIds = new Set<string>();

/**
 * Read a conversation's split-group tag. A missing or `null` tag means "not in
 * a group". A malformed tag is ignored and reported once per conversation,
 * never thrown: a bad row must not take the whole list down.
 */
export const readSplitGroupTag = (conversation: TChatConversation): SplitGroupTag | null => {
  const raw = (conversation.extra as { split_group?: unknown } | undefined)?.split_group;
  if (raw === undefined || raw === null) return null;

  const tag = raw as { id?: unknown; order?: unknown };
  const valid =
    typeof raw === 'object' &&
    typeof tag.id === 'string' &&
    tag.id.trim().length > 0 &&
    typeof tag.order === 'number' &&
    Number.isFinite(tag.order);
  if (valid) return { id: tag.id as string, order: tag.order as number };

  if (!warnedMalformedIds.has(conversation.id)) {
    warnedMalformedIds.add(conversation.id);
    console.warn(`[SplitGroup] Ignoring a malformed split_group tag on conversation ${conversation.id}:`, raw);
  }
  return null;
};

const compareMembers = (a: { order: number; id: string }, b: { order: number; id: string }): number =>
  a.order - b.order || a.id.localeCompare(b.id);

/**
 * Derive the split groups present in a loaded conversation list.
 *
 * A group needs two loaded members to be a group. A tag whose group has only
 * one loaded member — the other was deleted, archived, or is not in this list
 * — leaves that conversation as a plain row, reported once, so a dangling tag
 * never shows an empty pill.
 */
export const buildSplitGroups = (conversations: TChatConversation[]): SplitGroup[] => {
  const membersByGroup = new Map<string, Array<{ order: number; id: string; conversation: TChatConversation }>>();
  for (const conversation of conversations) {
    const tag = readSplitGroupTag(conversation);
    if (!tag) continue;
    const members = membersByGroup.get(tag.id) ?? [];
    members.push({ order: tag.order, id: conversation.id, conversation });
    membersByGroup.set(tag.id, members);
  }

  const groups: SplitGroup[] = [];
  for (const [id, members] of membersByGroup) {
    if (members.length < 2) {
      if (!warnedSingletonGroupIds.has(id)) {
        warnedSingletonGroupIds.add(id);
        console.warn(
          `[SplitGroup] Group ${id} has a single loaded member (${members[0].id}); showing it as a plain row.`
        );
      }
      continue;
    }
    groups.push({ id, members: members.toSorted(compareMembers).map((member) => member.conversation) });
  }
  return groups;
};

export const findSplitGroupOf = (groups: SplitGroup[], conversation_id: string): SplitGroup | undefined =>
  groups.find((group) => group.members.some((member) => member.id === conversation_id));

export type SplitGroupPlacement = {
  /** The pill for a group is rendered in place of this member row. */
  pillByLeaderId: Map<string, SplitGroup>;
  /** Member rows that are absorbed into a pill and must not render. */
  hiddenIds: Set<string>;
};

/**
 * Decide where each pill sits: in the slot of the group's first member in the
 * list's render order. Every other member row is hidden. A group with no
 * member in the rendered order is not placed at all.
 */
export const placeSplitGroupPills = (orderedConversationIds: string[], groups: SplitGroup[]): SplitGroupPlacement => {
  const pillByLeaderId = new Map<string, SplitGroup>();
  const hiddenIds = new Set<string>();
  const rank = new Map(orderedConversationIds.map((id, index) => [id, index] as const));

  for (const group of groups) {
    const ranked = group.members
      .map((member) => ({ id: member.id, rank: rank.get(member.id) }))
      .filter((member): member is { id: string; rank: number } => member.rank !== undefined)
      .toSorted((a, b) => a.rank - b.rank);
    if (ranked.length === 0) continue;
    pillByLeaderId.set(ranked[0].id, group);
    for (const member of ranked.slice(1)) hiddenIds.add(member.id);
  }

  return { pillByLeaderId, hiddenIds };
};

export const newSplitGroupId = (): string => uuid(36);

/** Fuse two plain conversations: the drop target becomes the first column. */
export const planCreateSplitGroup = (
  target_id: string,
  dragged_id: string,
  group_id: string = newSplitGroupId()
): SplitGroupPatch[] => [
  { conversation_id: target_id, split_group: { id: group_id, order: 0 } },
  { conversation_id: dragged_id, split_group: { id: group_id, order: 1 } },
];

/** Append a conversation as the last column. A member already in the group is a no-op. */
export const planAddSplitGroupMember = (group: SplitGroup, conversation_id: string): SplitGroupPatch[] => {
  if (group.members.some((member) => member.id === conversation_id)) return [];
  const orders = group.members.map((member) => readSplitGroupTag(member)?.order ?? 0);
  return [{ conversation_id, split_group: { id: group.id, order: Math.max(...orders) + 1 } }];
};

export type SplitGroupRemoval = {
  patches: SplitGroupPatch[];
  /** True when the group is down to one member and dissolves back into a plain row. */
  dissolved: boolean;
  /** Members that stay in the group (or the single survivor when it dissolves). */
  remaining: string[];
};

/**
 * Take a member out of its group. When one member would remain, its tag is
 * cleared too: a group of one is just a conversation.
 */
export const planRemoveSplitGroupMember = (group: SplitGroup, conversation_id: string): SplitGroupRemoval => {
  if (!group.members.some((member) => member.id === conversation_id)) {
    return { patches: [], dissolved: false, remaining: group.members.map((member) => member.id) };
  }
  const remaining = group.members.filter((member) => member.id !== conversation_id).map((member) => member.id);
  const dissolved = remaining.length < 2;
  const cleared = dissolved ? [conversation_id, ...remaining] : [conversation_id];
  return {
    patches: cleared.map((id): SplitGroupPatch => ({ conversation_id: id, split_group: null })),
    dissolved,
    remaining,
  };
};

/** Test hook: forget which malformed tags and singleton groups were already reported. */
export const resetSplitGroupWarningsForTest = (): void => {
  warnedMalformedIds.clear();
  warnedSingletonGroupIds.clear();
};
