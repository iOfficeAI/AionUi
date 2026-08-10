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
 * This sider only renders while `workspaceEnabled` (a workspace conversation
 * before its project_id backfill lands). Once the backfill arrives the
 * conversation is project-bound → `workspaceEnabled` is false and the Explorer
 * host takes over. The `project_id` branch is a defensive passthrough;
 * pure-chat (no workspace) conversations correctly show nothing here.
 */
const ChatSlider: React.FC<{
  conversation?: TChatConversation;
}> = ({ conversation }) => {
  if (conversation?.project_id) {
    return <ExplorerContainer projectId={conversation.project_id} />;
  }
  return <div />;
};

export default ChatSlider;
