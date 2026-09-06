/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Who is in a split group, asked of the backend rather than of the sidebar.
 *
 * The published list is not a membership source. It drops archived rows
 * (verified against the backend: an archived conversation disappears from
 * `GET /api/conversations` while it keeps its `split_group` tag) and it is
 * only ever as new as the last refresh, so another window's add is invisible
 * until then. Planning a group write from it silently under-counts, and an
 * under-counted group dissolves itself: it clears the tags of the members it
 * can see and leaves the ones it cannot wearing a tag for a group nobody
 * shows.
 *
 * So membership is read from both slices the backend offers — the active list
 * and the archive — and the read reports whether it could see everything.
 * A caller about to clear tags because a group looks too small must refuse
 * when it could not, instead of writing against a partial picture.
 */

import { ipcBridge } from '@/common';
import { flattenSidebarConversations, scopeToToken } from '@/common/adapter/sidebarMapper';
import type { TChatConversation } from '@/common/config/storage';

import { readSplitGroupTag } from './splitGroupHelpers';

export type SplitGroupCensus = {
  /** Every conversation the read found carrying this group's tag. */
  members: TChatConversation[];
  /** False when a paged slice was cut off, so `members` may be short. */
  complete: boolean;
};

/** The same window the sidebar itself loads the active list with; the response carries no cursor to page past it. */
const ACTIVE_LIMIT = 10000;
/** The sidebar read model's hard cap (`limit out of range [1,100]`), so the archive is read a page at a time. */
const ARCHIVE_PAGE_LIMIT = 100;

const readActive = async (): Promise<SplitGroupCensus> => {
  const result = await ipcBridge.database.getUserConversations.invoke({ limit: ACTIVE_LIMIT });
  // An answer that is not a list is not an empty list.
  if (!result || !Array.isArray(result.items)) return { members: [], complete: false };
  return { members: result.items, complete: !result.has_more };
};

/** The rest of one archived group, followed cursor by cursor to its end. */
const drainGroup = async (scope: string, cursor: string): Promise<SplitGroupCensus> => {
  const page = await ipcBridge.sidebar.items.invoke({ scope, cursor, limit: ARCHIVE_PAGE_LIMIT, archived: true });
  const members: TChatConversation[] = [];
  for (const item of page.items) if (item.type === 'conversation') members.push(item.conversation);
  if (!page.has_more) return { members, complete: true };
  if (!page.next_cursor) return { members, complete: false };
  const rest = await drainGroup(scope, page.next_cursor);
  return { members: [...members, ...rest.members], complete: rest.complete };
};

const readArchived = async (): Promise<SplitGroupCensus> => {
  const response = await ipcBridge.sidebar.get.invoke({ archived: true, limit: ARCHIVE_PAGE_LIMIT });
  if (!response || !Array.isArray(response.groups)) return { members: [], complete: false };
  const rest = await Promise.all(
    response.groups.map((group) =>
      group.has_more && group.next_cursor
        ? drainGroup(scopeToToken(group.scope), group.next_cursor)
        : { members: [] as TChatConversation[], complete: !group.has_more }
    )
  );
  return {
    members: [...flattenSidebarConversations(response), ...rest.flatMap((page) => page.members)],
    // `has_more_groups` is the backend's 100-group cap on the project area:
    // there is no cursor past it, so the archive cannot be read whole.
    complete: !response.has_more_groups && rest.every((page) => page.complete),
  };
};

/**
 * Every conversation carrying `group_id`, active or archived, as the backend
 * has them right now. A slice that fails to read is not an empty slice — the
 * error propagates, because "I could not look" must never read as "nobody is
 * there".
 */
export const readSplitGroupCensus = async (group_id: string): Promise<SplitGroupCensus> => {
  const [active, archived] = await Promise.all([
    readActive(),
    // An archive that will not answer is an unread slice, not an empty one: the
    // count is incomplete, which is what stops it from clearing anyone's tag.
    // The active members still count, so a member can still be added or taken
    // out — only the writes that turn on a small count give way.
    readArchived().catch((error: unknown): SplitGroupCensus => {
      console.error('[SplitGroup] Could not read the archive; the member count is incomplete:', error);
      return { members: [], complete: false };
    }),
  ]);
  const members: TChatConversation[] = [];
  const seen = new Set<string>();
  for (const conversation of [...active.members, ...archived.members]) {
    if (seen.has(conversation.id)) continue;
    seen.add(conversation.id);
    if (readSplitGroupTag(conversation)?.id === group_id) members.push(conversation);
  }
  return { members, complete: active.complete && archived.complete };
};
