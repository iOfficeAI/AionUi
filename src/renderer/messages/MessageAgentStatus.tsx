/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAgentStatus } from '@/common/chatLib';
import { Badge, Typography } from '@arco-design/web-react';
import classNames from 'classnames';
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
  const { backend, status } = message.content;

  const getStatusBadge = () => {
    switch (status) {
      case 'connecting':
        return <Badge status='processing' text={t('acp.status.connecting', { agent: backend })} />;
      case 'connected':
        return <Badge status='success' text={t('acp.status.connected', { agent: backend })} />;
      case 'authenticated':
        return <Badge status='success' text={t('acp.status.authenticated', { agent: backend })} />;
      case 'session_active':
        return <Badge status='success' text={t('acp.status.session_active', { agent: backend })} />;
      case 'disconnected':
        return <Badge status='default' text={t('acp.status.disconnected', { agent: backend })} />;
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
      className={classNames('agent-status-message', 'flex items-center gap-3 p-3 rounded-lg border', {
        'bg-red-50 border-red-200 text-red-700': isError,
        'bg-green-50 border-green-200 text-green-700': isSuccess,
        'bg-blue-50 border-blue-200 text-blue-700': !isError && !isSuccess,
      })}
    >
      <div className='flex items-center gap-2'>
        <Text style={{ fontWeight: 'bold' }} className='capitalize'>
          {backend.charAt(0).toUpperCase() + backend.slice(1)}
        </Text>
      </div>

      <div className='flex-1'>{getStatusBadge()}</div>
    </div>
  );
};

export default MessageAgentStatus;
