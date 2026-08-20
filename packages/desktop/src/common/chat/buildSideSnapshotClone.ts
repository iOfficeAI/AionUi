/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import type { TChatConversation } from '@/common/config/storage';

/**
 * Build the `createWithConversation` (clone) payload for a snapshot-mode side
 * child. Used for fork-incapable backends (hermes, pi, …): the child reuses
 * the parent's agent identity / workspace / skill snapshot but starts with a
 * clean history — the parent transcript is delivered as one framed reference
 * message afterwards (see `loadParentReferenceTranscript`). ACP session fields
 * are stripped so the clone never resumes the parent's live session (same
 * treatment as the "new conversation in workspace" clone flow).
 */
export function buildSideSnapshotClone(parent: TChatConversation): TChatConversation {
  return {
    ...parent,
    id: uuid(),
    name: parent.name.trim() ? `↳ ${parent.name}` : 'Side',
    created_at: Date.now(),
    modified_at: Date.now(),
    status: undefined,
    runtime: undefined,
    extra: {
      ...parent.extra,
      // Never resume the parent's live agent session from a clone.
      acp_session_id: undefined,
      acp_session_conversation_id: undefined,
      acp_session_updated_at: undefined,
      // Parent-side UI state and fork lineage must not leak into the child.
      active_side_id: undefined,
      side_panel_hidden: undefined,
      side_mode: undefined,
      ephemeral: undefined,
      parent_conversation_id: undefined,
      forked_at_msg_id: undefined,
      side_fork_mode: undefined,
      fork: undefined,
      pinned: undefined,
      pinned_at: undefined,
    },
  } as TChatConversation;
}
