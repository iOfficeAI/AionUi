/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';

import ConversationPaneDesktop from './ConversationPaneDesktop';
import ConversationPaneMobileOverlay from './ConversationPaneMobileOverlay';

interface ConversationPaneProps {
  /**
   * Optional callback fired when a conversation is selected. On mobile this
   * is the cue to close the overlay; on desktop the pane stays open.
   */
  onSessionClick?: () => void;
}

/**
 * Right-side conversation navigation surface. The desktop variant docks as
 * a peer pane; the mobile variant is a full-screen overlay with a
 * backdrop. Visibility is driven by `LayoutContext.conversationPaneCollapsed`
 * — when collapsed, this component returns `null` so the layout doesn't
 * reserve a slot for it.
 */
const ConversationPane: React.FC<ConversationPaneProps> = ({ onSessionClick }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const collapsed = layout?.conversationPaneCollapsed ?? true;

  if (isMobile) {
    return collapsed ? null : <ConversationPaneMobileOverlay onSessionClick={onSessionClick} />;
  }

  // Desktop: stay mounted regardless of collapsed state so the pane can
  // animate its width 0↔N (matches the left navigation bar's slide) instead
  // of popping in/out.
  return <ConversationPaneDesktop collapsed={collapsed} onSessionClick={onSessionClick} />;
};

export default ConversationPane;
