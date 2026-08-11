/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sidebar read-model types (`GET /api/sidebar`, `GET /api/sidebar/items`).
 *
 * One request renders the whole left panel: the backend classifies every
 * conversation/team into its group (pinned / project / pseudo-dir / chats),
 * windows each group, and hydrates items. The front-end renders in the given
 * order and runs no classification. These shapes mirror the backend
 * `aionui-api-types/sidebar` DTOs 1:1 (including the flat team variant, see
 * `SidebarItem` below), except conversation items carry the mapped
 * `TChatConversation` (the wire `ConversationResponse` is mapped by the
 * ipcBridge response mapper, matching `getUserConversations`).
 *
 * See `feat-project-design/temp/left-panel/api-contract-sidebar.md` §4.
 */

import type { TChatConversation } from '@/common/config/storage';

/** Which section a group belongs to; the tag doubles as the group-head shape. */
export type SidebarScope =
  | { type: 'pinned' }
  /**
   * Real project group. `workspace` feeds the project-head "+" entry (resolved
   * server-side from the project source, not scanned from items).
   */
  | { type: 'project'; project_id: string; name: string; workspace?: string | null }
  /**
   * Pseudo project group (directory aggregation). `key` is the dir token used
   * for paging / `win`; `name` is the directory's last segment.
   */
  | { type: 'dir'; key: string; path: string; name: string }
  /** The flat "chats" group. */
  | { type: 'chats' };

/** An aggregated team row for the sidebar (server-side aggregate). */
export type SidebarTeamItem = {
  team_id: string;
  name: string;
  /** `MAX(updated_at)` across active member conversations. */
  updated_at: number;
  /** Derived from a `user_order` scene=`pinned` row existing for this team. */
  pinned: boolean;
  /** Active member conversation ids, `created_at` ascending. */
  member_conversation_ids: string[];
};

/**
 * One row in a group: either a full conversation (mapped to `TChatConversation`)
 * or an aggregated team row. A conversation's `pinned` flag is derived from
 * `user_order` row existence, not any table column.
 *
 * The team variant is **flat** on the wire: the backend `SidebarItem::Team`
 * is a newtype variant on an internally-tagged (`#[serde(tag = "type")]`) enum,
 * so `SidebarTeamItem`'s fields sit alongside `type` rather than nested under a
 * `team` key (contract §4 example: `{ "type": "team", "team_id": …, … }`). The
 * conversation variant stays nested because its inner DTO is mapped separately.
 */
export type SidebarItem =
  | { type: 'conversation'; conversation: TChatConversation }
  | ({ type: 'team' } & SidebarTeamItem);

/** One group (a section's window) in the sidebar. */
export type SidebarGroup = {
  scope: SidebarScope;
  items: SidebarItem[];
  /** True when this group has items beyond the returned window. */
  has_more: boolean;
  /** Keyset cursor for the next page; absent iff `has_more` is false. */
  next_cursor?: string;
};

/** `GET /api/sidebar` response. `groups` order **is** render order. */
export type SidebarResponse = {
  groups: SidebarGroup[];
  /** True when the project area exceeded the 100-group hard cap. */
  has_more_groups: boolean;
};

/** `GET /api/sidebar/items` response — one more window of a single group. */
export type SidebarItemsResponse = {
  items: SidebarItem[];
  has_more: boolean;
  next_cursor?: string;
};

/** Closed ordering scenes. v1 only pins. */
export type OrderScene = 'pinned';

/** Item kinds that can be ordered. */
export type OrderItemType = 'conversation' | 'team';

/**
 * `DELETE /api/sidebar/project/{project_id}` result (BR-19 "所见即所删").
 *
 * Counts what was (or, with `dry_run`, would be) removed. `teams_deleted` and
 * `conversations_deleted` are disjoint: standalone conversations classified into
 * the project are counted in `conversations_deleted`, while team member
 * conversations are removed via their team's cascade and counted only under
 * `teams_deleted`.
 */
export type RemoveProjectResult = {
  teams_deleted: number;
  conversations_deleted: number;
  /**
   * The named units in the delete set, present only on a `dry_run` preview so the
   * confirm dialog can list *which* items go — not just how many. Pinned members
   * are hoisted into the top pinned group (B1 double-render), so the frontend
   * cannot reconstruct project membership itself; the names ride this list.
   */
  items?: RemoveProjectItem[];
};

/** One named unit in a {@link RemoveProjectResult} preview. */
export type RemoveProjectItem = {
  name: string;
  /** Whether the unit is currently pinned (hoisted into the top pinned group). */
  pinned: boolean;
  kind: OrderItemType;
};

/**
 * `DELETE /api/sidebar/archived` result — counts what was hard-deleted when the
 * archive was emptied. Mirrors the backend `ArchiveDeleteResult`. `teams_deleted`
 * and `conversations_deleted` are disjoint: a team's member conversations are
 * removed via the team cascade and counted only under `teams_deleted`, while
 * `conversations_deleted` counts the independent archived conversations.
 */
export type ArchiveDeleteResult = {
  teams_deleted: number;
  conversations_deleted: number;
};
