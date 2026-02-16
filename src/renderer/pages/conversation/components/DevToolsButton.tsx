/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DevTools button — opens session analysis panel for Claude Code conversations.
 * Placed in the conversation header alongside CronJobManager.
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import { usePreviewContext } from '@/renderer/pages/conversation/preview/context/PreviewContext';
import { iconColors } from '@/renderer/theme/colors';
import { Button, Tooltip } from '@arco-design/web-react';
import { ChartHistogram } from '@icon-park/react';
import React, { useCallback, useMemo } from 'react';

type DevToolsButtonProps = {
  conversation: TChatConversation;
};

/**
 * A header button that opens the DevTools session analysis panel.
 * Only visible for ACP conversations with a Claude backend.
 */
const DevToolsButton: React.FC<DevToolsButtonProps> = ({ conversation }) => {
  const { openPreview } = usePreviewContext();

  // Only show for ACP conversations (Claude sessions have JSONL logs)
  const isClaudeSession = useMemo(() => {
    return conversation.type === 'acp';
  }, [conversation.type]);

  const handleClick = useCallback(async () => {
    // Get the ACP session ID from conversation extra data
    const extra = conversation.extra as Record<string, unknown>;
    const acpSessionId = extra?.acpSessionId as string | undefined;
    const workspace = extra?.workspace as string | undefined;

    if (acpSessionId) {
      // Open devtools panel with the known session ID
      openPreview(
        JSON.stringify({ sessionId: acpSessionId, workspace }),
        'devtools',
        { title: 'Session Insights' }
      );
    } else if (workspace) {
      // No session ID yet — try to find the latest session for this workspace
      try {
        const result = await ipcBridge.devtools.listSessions.invoke({ workspace });
        if (result.success && result.data && result.data.length > 0) {
          // Open the most recent session
          const latest = result.data[0];
          openPreview(
            JSON.stringify({ sessionId: latest.sessionId, workspace }),
            'devtools',
            { title: 'Session Insights' }
          );
        } else {
          // No sessions found — open with workspace-only params
          openPreview(
            JSON.stringify({ sessionId: '', workspace }),
            'devtools',
            { title: 'Session Insights' }
          );
        }
      } catch {
        // Fallback: open with empty state
        openPreview(
          JSON.stringify({ sessionId: '', workspace }),
          'devtools',
          { title: 'Session Insights' }
        );
      }
    }
  }, [conversation.extra, openPreview]);

  if (!isClaudeSession) return null;

  return (
    <Tooltip content='Session Insights'>
      <Button
        type='text'
        size='small'
        onClick={handleClick}
        icon={
          <span className='inline-flex items-center gap-2px rounded-full px-8px py-2px bg-2'>
            <ChartHistogram theme='outline' size={16} fill={iconColors.primary} />
          </span>
        }
      />
    </Tooltip>
  );
};

export default DevToolsButton;
