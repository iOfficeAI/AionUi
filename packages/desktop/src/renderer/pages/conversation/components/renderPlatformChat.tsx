/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationMcpStatus, TChatConversation } from '@/common/config/storage';
import AcpChat from '@/renderer/pages/conversation/platforms/acp/AcpChat';
import AionrsPlatformChat from '@/renderer/pages/conversation/platforms/aionrs/AionrsPlatformChat';
import React from 'react';

export type RenderPlatformChatOptions = {
  conversation: TChatConversation;
  assistantDisplayName?: string;
  hideSendBox?: boolean;
  backend?: string;
  cronJobId?: string;
  assistantId?: string;
  isSideMode?: boolean;
  /** Rendered directly above the platform SendBox (e.g. side quick prompts). */
  composerPrefix?: React.ReactNode;
};

/** Single source of truth for type→platform-chat routing. Used by main view and side dock. */
export function renderPlatformChat({
  conversation,
  assistantDisplayName,
  hideSendBox,
  backend,
  cronJobId,
  assistantId,
  isSideMode = Boolean(conversation.extra?.side_mode),
  composerPrefix,
}: RenderPlatformChatOptions): React.ReactNode {
  const resolvedAssistantDisplayName = assistantDisplayName ?? conversation.assistant?.name;
  const resolvedAssistantId = assistantId ?? conversation.assistant?.id;
  const resolvedBackend = backend ?? conversation.assistant?.backend;

  switch (conversation.type) {
    case 'acp':
      return (
        <AcpChat
          key={conversation.id}
          conversation_id={conversation.id}
          workspace={conversation.extra?.workspace}
          backend={resolvedBackend || conversation.extra?.backend || 'claude'}
          session_mode={conversation.extra?.session_mode}
          agent_name={resolvedAssistantDisplayName}
          cron_job_id={cronJobId ?? (conversation.extra as { cron_job_id?: string })?.cron_job_id}
          hideSendBox={hideSendBox}
          isSideMode={isSideMode}
          composerPrefix={composerPrefix}
          loadedSkills={(conversation.extra as { skills?: string[] } | undefined)?.skills}
          loadedMcpServers={(conversation.extra as { mcp_servers?: string[] } | undefined)?.mcp_servers}
          loadedMcpStatuses={
            (conversation.extra as { mcp_statuses?: IConversationMcpStatus[] } | undefined)?.mcp_statuses
          }
          assistantId={resolvedAssistantId}
        />
      );
    case 'aionrs':
      if (!conversation.extra?.workspace) return null;
      return (
        <AionrsPlatformChat
          key={conversation.id}
          conversation={conversation as TChatConversation & { type: 'aionrs' }}
          assistantDisplayName={resolvedAssistantDisplayName}
          assistantId={resolvedAssistantId}
          isSideMode={isSideMode}
          composerPrefix={composerPrefix}
        />
      );
    default:
      return null;
  }
}
