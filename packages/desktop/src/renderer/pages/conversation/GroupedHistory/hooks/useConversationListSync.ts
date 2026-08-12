/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { flattenSidebarConversations, scopeToToken } from '@/common/adapter/sidebarMapper';
import type { SidebarGroup, SidebarResponse } from '@/common/types/sidebar';
import { addEventListener } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

/** Per-group window sizes: first screen shows 5, "load more" pages 10 at a time. */
const FIRST_SCREEN_LIMIT = 5;
const LOAD_MORE_LIMIT = 10;

/**
 * Whitelist of message types that indicate content generation is in progress.
 * Only these types should trigger the sidebar loading spinner.
 * Using a whitelist (instead of a blacklist) prevents unknown/internal message
 * types (e.g. slash_commands_updated, acp_context_usage) from falsely
 * triggering the generating state.
 */
const isGeneratingStreamMessage = (type: string): boolean => {
  return (
    type === 'content' ||
    type === 'start' ||
    type === 'thought' ||
    type === 'thinking' ||
    type === 'tool_group' ||
    type === 'acp_tool_call' ||
    type === 'acp_permission' ||
    type === 'permission' ||
    type === 'plan'
  );
};

const isTerminalAgentStatus = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const { status } = data as { status?: string };
  return status === 'error' || status === 'disconnected';
};

const isTerminalStreamMessage = (message: { type: string; data: unknown }): boolean => {
  return (
    message.type === 'finish' ||
    message.type === 'error' ||
    (message.type === 'agent_status' && isTerminalAgentStatus(message.data))
  );
};

const isTerminalTurnState = (state: string): boolean => {
  return state === 'ai_waiting_input' || state === 'error' || state === 'stopped';
};

export type SidebarStreamGuardDecision = {
  markGenerating: boolean;
  clearCompleted: boolean;
  lateIgnored: boolean;
};

export const getSidebarStreamGuardDecision = ({
  type,
  completed,
  completedTurnId,
  streamTurnId,
}: {
  type: string;
  completed: boolean;
  /** Turn whose completion set the `completed` flag, when known. */
  completedTurnId?: string | null;
  /** Turn the incoming stream frame belongs to, when known. */
  streamTurnId?: string | null;
}): SidebarStreamGuardDecision => {
  if (!isGeneratingStreamMessage(type)) {
    return {
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: false,
    };
  }

  if (type === 'start') {
    return {
      markGenerating: true,
      clearCompleted: true,
      lateIgnored: false,
    };
  }

  if (completed) {
    // A frame from a DIFFERENT turn than the one that completed is not late —
    // it belongs to a newer turn. codex keeps streaming after ending its
    // prompt turn (unified exec runs the command in a background PTY), so the
    // old turn's completion used to swallow the next turn's whole stream and
    // the sidebar never lit up as generating.
    const isNewerTurn =
      typeof streamTurnId === 'string' &&
      streamTurnId.length > 0 &&
      typeof completedTurnId === 'string' &&
      completedTurnId.length > 0 &&
      streamTurnId !== completedTurnId;
    if (!isNewerTurn) {
      return {
        markGenerating: false,
        clearCompleted: false,
        lateIgnored: true,
      };
    }
    return {
      markGenerating: true,
      clearCompleted: true,
      lateIgnored: false,
    };
  }

  return {
    markGenerating: true,
    clearCompleted: false,
    lateIgnored: false,
  };
};

type ConversationListSyncSnapshot = {
  /** Backend sidebar read model (grouped, windowed) — the render source of truth. */
  sidebar: SidebarResponse;
  /** Flat conversation list derived from `sidebar` (batch selection, fork-name lookup). */
  conversations: TChatConversation[];
  generatingConversationIds: Set<string>;
  completionUnreadConversationIds: Set<string>;
};

const EMPTY_SIDEBAR: SidebarResponse = { groups: [], has_more_groups: false };

const listeners = new Set<() => void>();

let isStoreInitialized = false;
let sidebarState: SidebarResponse = EMPTY_SIDEBAR;
// First-screen snapshot per group token, captured on every full refresh, so
// collapsing a group can reset it to the first window without a network request
// (the "收起重置不发请求" rule).
let firstScreenGroupsByToken = new Map<string, SidebarGroup>();
let conversationsState: TChatConversation[] = [];
let generatingConversationIdsState = new Set<string>();
let completionUnreadConversationIdsState = new Set<string>();
let completedConversationIdsState = new Set<string>();
let conversation_idsState = new Set<string>();
// Full id → owning project_id map over ALL loaded conversations (incl. the team
// member rows filtered out of `conversationsState`). Every row from
// GET /api/conversations carries project_id, so this lets the route publish the
// active project synchronously on switch — no waiting for the per-conversation
// `conversation.get` to resolve (that async lag painted the previous project's
// tree). `null` = known conversation with no project (or project_id not yet
// backfilled); a missing key = not loaded yet (caller placeholders).
let projectIdByIdState = new Map<string, string | null>();
let activeConversationIdState: string | null = null;
let snapshotState: ConversationListSyncSnapshot = {
  sidebar: sidebarState,
  conversations: conversationsState,
  generatingConversationIds: generatingConversationIdsState,
  completionUnreadConversationIds: completionUnreadConversationIdsState,
};

const emitStoreChange = () => {
  snapshotState = {
    sidebar: sidebarState,
    conversations: conversationsState,
    generatingConversationIds: generatingConversationIdsState,
    completionUnreadConversationIds: completionUnreadConversationIdsState,
  };
  listeners.forEach((listener) => listener());
};

const subscribeConversationListSync = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getConversationListSyncSnapshot = (): ConversationListSyncSnapshot => snapshotState;

/**
 * Synchronous lookup of a conversation's owning project id from the in-memory
 * list snapshot (loaded once via GET /api/conversations, every row carrying
 * project_id). Returns the project id string, `null` when the conversation is
 * known but has no project (or its project_id has not been backfilled yet), or
 * `undefined` when the conversation is not in the snapshot yet (brand-new /
 * not-loaded — the caller should placeholder rather than paint a stale project).
 */
export const getSnapshotConversationProjectId = (conversation_id: string): string | null | undefined => {
  if (!projectIdByIdState.has(conversation_id)) return undefined;
  return projectIdByIdState.get(conversation_id) ?? null;
};

/** Test hook: seed the id → project_id map so the sync lookup can be exercised. */
export const setConversationProjectMapForTest = (entries: Array<[string, string | null]>): void => {
  projectIdByIdState = new Map(entries);
};

/**
 * Recompute the derived flat list + the two id-keyed maps from a sidebar
 * response. The sidebar folds team member conversations into their team row, so:
 * - `conversation_idsState` = every conversation id ∪ every team's member ids ∪
 *   team ids. Windowing means a stream can arrive for an id outside the current
 *   window; the responseStream guard adds such ids on sight (see below) so it
 *   refreshes once rather than looping.
 * - `projectIdByIdState` = each conversation's own `project_id`; a folded team
 *   member inherits its owning group's project (a project-bound team's row sits
 *   in that Project group), so `TeamPage`'s synchronous leader-project lookup and
 *   the conversation view's stale-tree guard keep resolving without an extra fetch.
 */
const rebuildDerivedFromSidebar = (response: SidebarResponse) => {
  conversationsState = flattenSidebarConversations(response);

  const ids = new Set<string>();
  const projectById = new Map<string, string | null>();
  for (const group of response.groups) {
    const groupProjectId = group.scope.type === 'project' ? group.scope.project_id : null;
    for (const item of group.items) {
      if (item.type === 'conversation') {
        const conversation = item.conversation;
        ids.add(conversation.id);
        projectById.set(conversation.id, conversation.project_id ?? groupProjectId ?? null);
      } else {
        ids.add(item.team_id);
        for (const memberId of item.member_conversation_ids) {
          ids.add(memberId);
          if (!projectById.has(memberId)) {
            projectById.set(memberId, groupProjectId);
          }
        }
      }
    }
  }
  conversation_idsState = ids;
  projectIdByIdState = projectById;
};

const applySidebarResponse = (response: SidebarResponse) => {
  sidebarState = response;
  firstScreenGroupsByToken = new Map(response.groups.map((group) => [scopeToToken(group.scope), group]));
  rebuildDerivedFromSidebar(response);
  emitStoreChange();
};

const refreshConversations = () => {
  void ipcBridge.sidebar.get
    .invoke({ limit: FIRST_SCREEN_LIMIT })
    .then((response) => {
      applySidebarResponse(response ?? EMPTY_SIDEBAR);
    })
    .catch((error) => {
      console.error('[WorkspaceGroupedHistory] Failed to load sidebar:', error);
      applySidebarResponse(EMPTY_SIDEBAR);
    });
};

/** Ensure a conversation id counts as "known" so late/out-of-window stream
 *  frames don't trigger a refresh loop. */
const noteKnownConversation = (conversation_id: string) => {
  if (conversation_idsState.has(conversation_id)) {
    return;
  }
  conversation_idsState = new Set(conversation_idsState).add(conversation_id);
};

/** Page one more window into a group (the "+10" affordance). No-op when the
 *  group is gone or has nothing more. */
const loadMoreGroup = (token: string) => {
  const group = sidebarState.groups.find((candidate) => scopeToToken(candidate.scope) === token);
  if (!group || !group.has_more) {
    return;
  }
  void ipcBridge.sidebar.items
    .invoke({ scope: token, cursor: group.next_cursor, limit: LOAD_MORE_LIMIT })
    .then((page) => {
      const groups = sidebarState.groups.map((candidate) => {
        if (scopeToToken(candidate.scope) !== token) {
          return candidate;
        }
        return {
          ...candidate,
          items: [...candidate.items, ...page.items],
          has_more: page.has_more,
          next_cursor: page.next_cursor,
        };
      });
      sidebarState = { ...sidebarState, groups };
      rebuildDerivedFromSidebar(sidebarState);
      emitStoreChange();
    })
    .catch((error) => {
      console.error('[WorkspaceGroupedHistory] Failed to page sidebar group:', error);
    });
};

/** Reset a group back to its first-screen window (used when the group is
 *  collapsed) without issuing a request. */
const resetGroup = (token: string) => {
  const firstScreen = firstScreenGroupsByToken.get(token);
  if (!firstScreen) {
    return;
  }
  const current = sidebarState.groups.find((candidate) => scopeToToken(candidate.scope) === token);
  // Nothing paged beyond the first screen → no state change needed.
  if (!current || current.items.length <= firstScreen.items.length) {
    return;
  }
  const groups = sidebarState.groups.map((candidate) =>
    scopeToToken(candidate.scope) === token ? firstScreen : candidate
  );
  sidebarState = { ...sidebarState, groups };
  rebuildDerivedFromSidebar(sidebarState);
  emitStoreChange();
};

const markGenerating = (conversation_id: string) => {
  if (generatingConversationIdsState.has(conversation_id)) {
    return;
  }

  generatingConversationIdsState = new Set(generatingConversationIdsState).add(conversation_id);
  emitStoreChange();
};

const clearGenerating = (conversation_id: string) => {
  if (!generatingConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(generatingConversationIdsState);
  next.delete(conversation_id);
  generatingConversationIdsState = next;
  emitStoreChange();
};

const markCompletionUnread = (conversation_id: string) => {
  if (completionUnreadConversationIdsState.has(conversation_id)) {
    return;
  }

  completionUnreadConversationIdsState = new Set(completionUnreadConversationIdsState).add(conversation_id);
  emitStoreChange();
};

const clearCompletionUnreadState = (conversation_id: string) => {
  if (!completionUnreadConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(completionUnreadConversationIdsState);
  next.delete(conversation_id);
  completionUnreadConversationIdsState = next;
  emitStoreChange();
};

/** Turn id that put a conversation into the `completed` set (for turn-aware
 *  late-frame detection). */
const completedTurnIdByConversation = new Map<string, string | null>();

const markCompleted = (conversation_id: string, turn_id?: string | null) => {
  completedConversationIdsState = new Set(completedConversationIdsState).add(conversation_id);
  completedTurnIdByConversation.set(conversation_id, turn_id ?? null);
};

const clearCompleted = (conversation_id: string) => {
  if (!completedConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(completedConversationIdsState);
  next.delete(conversation_id);
  completedConversationIdsState = next;
  completedTurnIdByConversation.delete(conversation_id);
};

const logLateStreamIgnored = (conversation_id: string, type: string) => {
  void ipcBridge.application.writeRendererLog
    .invoke({
      level: 'warn',
      tag: 'conversationRuntimeView',
      message: 'late_stream_ignored_for_runtime',
      data: {
        conversation_id,
        stream_type: type,
      },
    })
    .catch(() => {});
};

const setActiveConversationState = (conversation_id: string | null) => {
  activeConversationIdState = conversation_id;
};

const initializeConversationListSyncStore = () => {
  if (isStoreInitialized) {
    return;
  }

  isStoreInitialized = true;
  refreshConversations();

  addEventListener('chat.history.refresh', refreshConversations);
  ipcBridge.conversation.listChanged.on((event) => {
    if (event.action === 'deleted') {
      clearGenerating(event.conversation_id);
      clearCompletionUnreadState(event.conversation_id);
      clearCompleted(event.conversation_id);
    }
    refreshConversations();
  });
  ipcBridge.conversation.responseStream.on((message) => {
    const conversation_id = message.conversation_id;
    if (!conversation_id) {
      return;
    }

    if (!conversation_idsState.has(conversation_id)) {
      // New (or windowed-out) conversation: mark known first so repeated frames
      // for a row outside the current window refresh once, not on every frame.
      noteKnownConversation(conversation_id);
      refreshConversations();
    }

    if (isTerminalStreamMessage(message)) {
      const wasGenerating = generatingConversationIdsState.has(conversation_id);
      if (wasGenerating && activeConversationIdState !== conversation_id) {
        markCompletionUnread(conversation_id);
      }
      clearGenerating(conversation_id);
      return;
    }

    const decision = getSidebarStreamGuardDecision({
      type: message.type,
      completed: completedConversationIdsState.has(conversation_id),
      completedTurnId: completedTurnIdByConversation.get(conversation_id) ?? null,
      streamTurnId: message.turn_id ?? null,
    });
    if (decision.clearCompleted) {
      clearCompleted(conversation_id);
    }
    if (decision.lateIgnored) {
      logLateStreamIgnored(conversation_id, message.type);
      return;
    }
    if (decision.markGenerating) {
      markGenerating(conversation_id);
    }
  });
  ipcBridge.conversation.turnCompleted.on((event) => {
    if (isTerminalTurnState(event.state) && activeConversationIdState !== event.session_id) {
      markCompletionUnread(event.session_id);
    }
    markCompleted(event.session_id, event.turn_id);
    clearGenerating(event.session_id);
    refreshConversations();
  });
};

export const useConversationListSync = () => {
  useEffect(() => {
    initializeConversationListSyncStore();
  }, []);

  const { sidebar, conversations, generatingConversationIds, completionUnreadConversationIds } = useSyncExternalStore(
    subscribeConversationListSync,
    getConversationListSyncSnapshot,
    getConversationListSyncSnapshot
  );

  const clearCompletionUnread = useCallback((conversation_id: string) => {
    clearCompletionUnreadState(conversation_id);
  }, []);

  const setActiveConversation = useCallback((conversation_id: string | null) => {
    setActiveConversationState(conversation_id);
  }, []);

  const loadMore = useCallback((token: string) => {
    loadMoreGroup(token);
  }, []);

  const resetGroupWindow = useCallback((token: string) => {
    resetGroup(token);
  }, []);

  const isConversationGenerating = useCallback(
    (conversation_id: string) => {
      return generatingConversationIds.has(conversation_id);
    },
    [generatingConversationIds]
  );

  const hasCompletionUnread = useCallback(
    (conversation_id: string) => {
      return completionUnreadConversationIds.has(conversation_id);
    },
    [completionUnreadConversationIds]
  );

  return {
    sidebar,
    conversations,
    isConversationGenerating,
    hasCompletionUnread,
    clearCompletionUnread,
    setActiveConversation,
    loadMore,
    resetGroupWindow,
  };
};
