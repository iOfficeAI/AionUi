/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageCodexStatus } from '@/common/chatLib';
import { Badge, Typography } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface MessageCodexStatusProps {
  message: IMessageCodexStatus;
}

// Extend the basic codex status content to include optional backend property
interface ICodexStatusContent {
  status: string;
  message: string;
  sessionId?: string;
  isConnected?: boolean;
  hasActiveSession?: boolean;
  backend?: string;
}

const CodexStatusMessage: React.FC<MessageCodexStatusProps> = ({ message }) => {
  const { t } = useTranslation();
  const { status, message: statusMessage } = message.content as ICodexStatusContent;
  const backend = (message.content as ICodexStatusContent).backend;

  const getStatusBadge = () => {
    switch (status) {
      case 'connecting':
        return <Badge status='processing' text={t('codex.status.connecting')} />;
      case 'connected':
        return <Badge status='success' text={t('codex.status.connected')} />;
      case 'authenticated':
        return <Badge status='success' text={t('codex.status.authenticated')} />;
      case 'session_active':
        return <Badge status='success' text={t('codex.status.session_active')} />;
      case 'disconnected':
        return <Badge status='default' text={t('codex.status.disconnected')} />;
      case 'error':
        return <Badge status='error' text={t('codex.status.error')} />;
      default:
        return <Badge status='default' text={t('codex.status.unknown')} />;
    }
  };

  const getBackendIcon = () => {
    switch (backend) {
      case 'claude':
        return '🤖'; // Claude icon
      case 'gemini':
        return '✨'; // Gemini icon
      default:
        return '🔌'; // Generic connection icon
    }
  };

  const isError = status === 'error';
  const isSuccess = status === 'connected' || status === 'authenticated' || status === 'session_active';

  return (
    <div
      className={classNames('codex-status-message', 'flex items-center gap-3 p-3 rounded-lg border', {
        'bg-red-50 border-red-200 text-red-700': isError,
        'bg-green-50 border-green-200 text-green-700': isSuccess,
        'bg-blue-50 border-blue-200 text-blue-700': !isError && !isSuccess,
      })}
    >
      <div className='flex items-center gap-2'>
        {backend && <span>{getBackendIcon()}</span>}
        <Text style={{ fontWeight: 'bold' }} className='capitalize'>
          {backend || 'Codex'}
        </Text>
      </div>

      <div className='flex-1'>{getStatusBadge()}</div>

      {statusMessage && (
        <div className='text-sm'>
          <Text type='secondary'>{statusMessage}</Text>
        </div>
      )}
    </div>
  );
};

export default CodexStatusMessage;
