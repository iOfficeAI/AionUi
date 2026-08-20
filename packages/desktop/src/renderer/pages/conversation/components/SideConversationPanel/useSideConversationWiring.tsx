/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isSideConversationSupported } from '@/common/chat/sideConversation';
import type { TChatConversation } from '@/common/config/storage';
import type { ReplyQuote } from '@/renderer/utils/emitter';
import { dispatchExplorerShowSideEvent, dispatchWorkspaceOpenEvent } from '@/renderer/utils/workspace/workspaceEvents';
import React, { useEffect, useMemo } from 'react';
import SideConversationDock from './SideConversationDock';
import { setSideConversationUi } from './sideConversationUiStore';
import { useSideConversation } from './useSideConversation';

/**
 * Placeholder parent so the side hook can mount before the conversation
 * detail loads; the hook's restore effect is a no-op while `id` is empty.
 */
const SIDE_PARENT_STUB = {
  id: '',
  type: 'acp',
  name: '',
  created_at: 0,
  modified_at: 0,
  extra: { backend: 'claude' },
  model: { id: 'side-stub', platform: 'stub', name: 'stub', base_url: '', api_key: '', use_model: 'stub' },
} as unknown as TChatConversation;

export type SideConversationWiring = {
  enableSide: boolean;
  sideControlValue: {
    enableSide: boolean;
    onOpenSide: (firstQuestion?: string) => void;
    onAskInSide: (quote: ReplyQuote) => void;
  };
  side: ReturnType<typeof useSideConversation>;
};

/** Reveal the side panel: expand the native sidebar (never toggles it closed)
 * and switch its tab row to the side-conversation tab. */
const revealSidePanel = (): void => {
  dispatchWorkspaceOpenEvent();
  dispatchExplorerShowSideEvent();
};

/**
 * Side conversation wiring shared by the ACP and Aionrs panels: mounts the
 * side state hook, builds the control context value for send box / selection
 * entry points, and publishes the tab/dropdown state plus the panel content
 * node to {@link setSideConversationUi} so ExplorerContainer — which lives in
 * a different subtree for project conversations (Layout-level ProjectPanelHost)
 * — can host the side tab in the native right sidebar.
 */
export const useSideConversationWiring = (conversation: TChatConversation | undefined): SideConversationWiring => {
  const enableSide = Boolean(
    conversation?.id &&
    isSideConversationSupported({
      type: conversation.type,
      fork_capability: conversation.fork_capability,
    })
  );
  const side = useSideConversation({ parent: conversation ?? SIDE_PARENT_STUB });
  const sideControlValue = {
    enableSide,
    onOpenSide: (firstQuestion?: string) => {
      revealSidePanel();
      if (firstQuestion?.trim() || side.tabs.length > 0) {
        void side.openNewTab(firstQuestion);
      } else {
        void side.open();
      }
    },
    onAskInSide: (quote: ReplyQuote): void => {
      revealSidePanel();
      void side.quoteComposer(quote);
    },
  };

  // Publish the side tab model + content node for ExplorerContainer. The store
  // is keyed to this conversation (`parentId`); consumers ignore snapshots that
  // do not match their active conversation.
  const content = useMemo(
    () => (enableSide ? <SideConversationDock childId={side.childId} /> : null),
    [enableSide, side.childId]
  );
  useEffect(() => {
    if (!enableSide || !conversation?.id || !content) {
      setSideConversationUi(null);
      return;
    }
    setSideConversationUi({
      parentId: conversation.id,
      threads: side.tabs.map((tab) => ({
        id: tab.childId,
        label: tab.label,
        mode: tab.mode,
        promoted: side.promotedIds.has(tab.childId),
      })),
      activeThreadId: side.activeTabId,
      content,
      selectTab: side.selectTab,
      discardTab: (id: string): void => void side.discardTab(id),
      openNewTab: (): void => void side.openNewTab(),
      promoteCurrent: (): void => void side.promote(),
    });
  }, [
    enableSide,
    conversation?.id,
    content,
    side.tabs,
    side.activeTabId,
    side.promotedIds,
    side.selectTab,
    side.discardTab,
    side.openNewTab,
    side.promote,
  ]);

  // Clear on unmount so a stale snapshot never leaks into the next conversation.
  useEffect(() => {
    return () => setSideConversationUi(null);
  }, []);

  return { enableSide, sideControlValue, side };
};
