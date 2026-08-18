/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isSideConversationSupported } from '@/common/chat/sideConversation';
import type { TChatConversation } from '@/common/config/storage';
import type { ReplyQuote } from '@/renderer/utils/emitter';
import React from 'react';
import SideConversationDock from './SideConversationDock';
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
    sideCollapsed: boolean;
    onReopenSide: () => void;
  };
  sideDock: React.ReactNode;
  sideDockOpen: boolean;
  side: ReturnType<typeof useSideConversation>;
};

/**
 * Side conversation wiring shared by the ACP and Aionrs panels: mounts the
 * side state hook, builds the control context value for send box / selection
 * entry points, and derives the dock node ChatLayout renders.
 */
export const useSideConversationWiring = (
  conversation: TChatConversation | undefined,
  isMobile: boolean
): SideConversationWiring => {
  const enableSide =
    Boolean(conversation?.id) &&
    !isMobile &&
    isSideConversationSupported({
      type: conversation.type,
      fork_capability: conversation.fork_capability,
    });
  const side = useSideConversation({ parent: conversation ?? SIDE_PARENT_STUB });
  const sideControlValue = {
    enableSide,
    onOpenSide: (firstQuestion?: string) => {
      if (firstQuestion?.trim() || side.tabs.length > 0) {
        void side.openNewTab(firstQuestion);
      } else {
        void side.open();
      }
    },
    onAskInSide: (quote: ReplyQuote): void => void side.quoteComposer(quote),
    sideCollapsed: side.state === 'collapsed',
    onReopenSide: side.reopen,
  };
  const sideDockOpen = side.state === 'empty' || side.state === 'active' || side.state === 'promoted';
  const sideDock =
    side.childId && sideDockOpen ? (
      <SideConversationDock
        childId={side.childId}
        tabs={side.tabs}
        activeTabId={side.activeTabId}
        onSelectTab={side.selectTab}
        onCloseTab={(tabId: string): void => void side.discardTab(tabId)}
        onNewTab={(): void => void side.openNewTab()}
        onCollapse={side.collapse}
        onPromote={(): void => void side.promote()}
      />
    ) : null;
  return { enableSide, sideControlValue, sideDock, sideDockOpen, side };
};
