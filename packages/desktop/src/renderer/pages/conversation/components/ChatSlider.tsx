/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import React from 'react';
import { ExplorerContainer } from '../explorer/ExplorerContainer';

/**
 * ChatLayout's right-sider content. The legacy per-conversation Workspace tree
 * (HTTP `getWorkspace` data source) has been removed — file browsing is now the
 * project-level Explorer host at the Layout level, gated on `project_id`.
 *
 * This sider only renders while `workspaceEnabled` — a workspace conversation
 * before its project_id backfill lands, or a pure-chat conversation whose agent
 * supports side conversations (ChatConversation includes `enableSide` in the
 * gate). With a project_id the container is a defensive passthrough to the
 * Explorer; without one it hosts ONLY the 侧边会话 tab (ExplorerContainer's
 * no-project mode) and renders nothing when side conversations are unsupported.
 */
const ChatSlider: React.FC<{
  conversation?: TChatConversation;
}> = ({ conversation }) => {
  return <ExplorerContainer projectId={conversation?.project_id || undefined} />;
};

export default ChatSlider;
