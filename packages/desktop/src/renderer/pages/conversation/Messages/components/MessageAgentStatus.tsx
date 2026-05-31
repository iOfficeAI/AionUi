/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAgentStatus } from '@/common/chat/chatLib';
import React from 'react';
import { useTranslation } from 'react-i18next';
import FeedbackButton from '@/renderer/components/base/FeedbackButton';
import { useConversationAgents } from '@/renderer/pages/conversation/hooks/useConversationAgents';
import ToolShell from './ToolShell';
import type { StatusPillState } from './StatusPill';
import { STATE_LABEL_FALLBACK, STATE_LABEL_KEY } from './StatusPill';

interface MessageAgentStatusProps {
  message: IMessageAgentStatus;
}

/**
 * Unified agent status message component for all ACP-based agents (Claude, Qwen, Codex, etc.)
 */
const MessageAgentStatus: React.FC<MessageAgentStatusProps> = ({ message }) => {
  const { t } = useTranslation();
  const { backend, status, agent_name } = message.content;
  const { cliAgents } = useConversationAgents();

  // Resolve display name: agent_name (extension/custom) > detected agent name > capitalized backend
  const display_name =
    agent_name ||
    cliAgents.find((a) => a.backend === backend || a.agent_type === backend)?.name ||
    backend.charAt(0).toUpperCase() + backend.slice(1);

  // Hide disconnected status from historical messages (no longer emitted but may exist in DB)
  if ((status as string) === 'disconnected') return null;

  const pillState: StatusPillState =
    status === 'error'
      ? 'failed'
      : status === 'connected' || status === 'authenticated' || status === 'session_active'
        ? 'success'
        : status === 'connecting'
          ? 'running'
          : 'queued';

  const stateLabel = t(STATE_LABEL_KEY[pillState], { defaultValue: STATE_LABEL_FALLBACK[pillState] });

  const statusText =
    status === 'connecting'
      ? t('acp.status.connecting', { agent: display_name })
      : status === 'connected'
        ? t('acp.status.connected', { agent: display_name })
        : status === 'authenticated'
          ? t('acp.status.authenticated', { agent: display_name })
          : status === 'session_active'
            ? t('acp.status.session_active', { agent: display_name })
            : status === 'error'
              ? t('acp.status.error')
              : t('acp.status.unknown');

  const isError = pillState === 'failed';

  return (
    <ToolShell
      state={pillState}
      stateLabel={stateLabel}
      title={<span className='font-medium capitalize'>{display_name}</span>}
      meta={statusText}
      collapsible={isError}
    >
      {isError && (
        <div className='flex justify-end'>
          <FeedbackButton module='conversation-session' />
        </div>
      )}
    </ToolShell>
  );
};

export default MessageAgentStatus;
