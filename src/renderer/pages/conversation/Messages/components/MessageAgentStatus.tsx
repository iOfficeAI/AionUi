/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAgentStatus } from '@/common/chat/chatLib';
import { ACP_BACKENDS_ALL } from '@/common/types/acpTypes';
import { Badge, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface MessageAgentStatusProps {
  message: IMessageAgentStatus;
}

/**
 * Unified agent status message component for all ACP-based agents (Claude, Qwen, Codex, etc.)
 */
const MessageAgentStatus: React.FC<MessageAgentStatusProps> = ({ message }) => {
  const { t } = useTranslation();
  const { backend, status, agentName } = message.content;

  // Resolve display name: agentName (extension/custom) > ACP_BACKENDS_ALL name > capitalized backend
  const displayName =
    agentName ||
    ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL]?.name ||
    backend.charAt(0).toUpperCase() + backend.slice(1);

  const getStatusBadge = () => {
    switch (status) {
      case 'connecting':
        return <Badge status='processing' text={t('acp.status.connecting', { agent: displayName })} />;
      case 'connected':
        return <Badge status='success' text={t('acp.status.connected', { agent: displayName })} />;
      case 'authenticated':
        return <Badge status='success' text={t('acp.status.authenticated', { agent: displayName })} />;
      case 'session_active':
        return <Badge status='success' text={t('acp.status.session_active', { agent: displayName })} />;
      case 'disconnected':
        return <Badge status='default' text={t('acp.status.disconnected', { agent: displayName })} />;
      case 'error':
        return <Badge status='error' text={t('acp.status.error')} />;
      default:
        return <Badge status='default' text={t('acp.status.unknown')} />;
    }
  };

  const isError = status === 'error';
  const isSuccess = status === 'connected' || status === 'authenticated' || status === 'session_active';

  return (
    <div
      className='agent-status-message flex items-center gap-3 p-3 rounded-lg border'
      style={{
        backgroundColor: isError
          ? 'var(--color-danger-light-1)'
          : isSuccess
            ? 'var(--color-success-light-1)'
            : 'var(--color-primary-light-1)',
        borderColor: isError ? 'rgb(var(--danger-3))' : isSuccess ? 'rgb(var(--success-3))' : 'rgb(var(--primary-3))',
        color: isError ? 'rgb(var(--danger-6))' : isSuccess ? 'rgb(var(--success-6))' : 'rgb(var(--primary-6))',
      }}
    >
      <div className='flex items-center gap-2'>
        <Text style={{ fontWeight: 'bold' }} className='capitalize'>
          {displayName}
        </Text>
      </div>

      <div className='flex-1'>{getStatusBadge()}</div>
    </div>
  );
};

export default MessageAgentStatus;
