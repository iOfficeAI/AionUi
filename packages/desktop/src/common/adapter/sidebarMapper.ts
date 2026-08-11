/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Maps the raw `GET /api/sidebar` / `GET /api/sidebar/items` wire payloads to
 * the front-end sidebar types. The only transform is on conversation items: the
 * wire `ConversationResponse` is run through `fromApiConversation` (same mapping
 * as `getUserConversations`) so downstream code sees a `TChatConversation`.
 * Team items and group/scope metadata pass through unchanged.
 */

import type {
  SidebarGroup,
  SidebarItem,
  SidebarItemsResponse,
  SidebarResponse,
  SidebarScope,
} from '@/common/types/sidebar';
import type { TChatConversation } from '@/common/config/storage';
import { fromApiConversation } from './apiModelMapper';

/**
 * Wire paging token for a scope — the inverse of the backend `ScopeToken`
 * grammar (`api-contract-sidebar.md` §3.3). Feeds `GET /api/sidebar/items?scope=`
 * and the `win` list. Pinned/chats are fixed strings; project/dir carry an id/key.
 */
export const scopeToToken = (scope: SidebarScope): string => {
  switch (scope.type) {
    case 'pinned':
      return 'pinned';
    case 'chats':
      return 'chats';
    case 'project':
      return `project:${scope.project_id}`;
    case 'dir':
      return `dir:${scope.key}`;
  }
};

/**
 * Flatten every conversation row across all groups into a single list (order
 * preserved). Used for the flat-list consumers (batch selection, fork-lineage
 * name resolution) that predate the grouped read model. Team rows are folded
 * server-side and carry no independent conversation here, so they are skipped.
 */
export const flattenSidebarConversations = (response: SidebarResponse): TChatConversation[] => {
  const out: TChatConversation[] = [];
  const seen = new Set<string>();
  for (const group of response.groups) {
    for (const item of group.items) {
      if (item.type === 'conversation' && !seen.has(item.conversation.id)) {
        seen.add(item.conversation.id);
        out.push(item.conversation);
      }
    }
  }
  return out;
};

const mapItem = (raw: SidebarItem): SidebarItem => {
  if (raw.type === 'conversation') {
    // The backend derives pin truth from a `user_order` row and sends it as a
    // top-level `pinned` flag on the wire `ConversationResponse`. The renderer
    // reads pin state from `extra.pinned`, so fold it in there after mapping.
    const wire = raw.conversation as TChatConversation & { pinned?: boolean; pinned_at?: number };
    const mapped = fromApiConversation(raw.conversation);
    const conversation = {
      ...mapped,
      extra: { ...mapped.extra, pinned: wire.pinned ?? false, pinned_at: wire.pinned_at },
    } as TChatConversation;
    return { type: 'conversation', conversation };
  }
  return raw;
};

const mapGroup = (raw: SidebarGroup): SidebarGroup => ({
  ...raw,
  items: raw.items.map(mapItem),
});

export const fromApiSidebar = (raw: SidebarResponse): SidebarResponse => ({
  ...raw,
  groups: raw.groups.map(mapGroup),
});

export const fromApiSidebarItems = (raw: SidebarItemsResponse): SidebarItemsResponse => ({
  ...raw,
  items: raw.items.map(mapItem),
});
