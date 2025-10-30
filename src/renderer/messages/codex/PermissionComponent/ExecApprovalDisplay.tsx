/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseCodexPermissionRequest, ExecApprovalRequestData } from '@/common/codex/types';
import { Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import BasePermissionDisplay from './BasePermissionDisplay';

const { Text } = Typography;

interface ExecApprovalDisplayProps {
  content: BaseCodexPermissionRequest & { subtype: 'exec_approval_request'; data: ExecApprovalRequestData };
  messageId: string;
  conversationId: string;
}

const ExecApprovalDisplay: React.FC<ExecApprovalDisplayProps> = React.memo(({ content, messageId, conversationId }) => {
  const { title, data } = content;
  const { t } = useTranslation();

  // 基于 exec_approval 类型生成权限信息
  const getExecInfo = () => {
    const commandStr = Array.isArray(data.command) ? data.command.join(' ') : data.command;
    return {
      title: title ? t(title) : t('codex.permissions.titles.exec_approval_request'),
      icon: '⚡',
      command: commandStr,
      cwd: data.cwd,
      reason: data.reason,
    };
  };

  const execInfo = getExecInfo();

  return (
    <BasePermissionDisplay content={content} messageId={messageId} conversationId={conversationId} icon={execInfo.icon} title={execInfo.title}>
      {/* Command details */}
      <div>
        <Text className='text-xs text-t-secondary mb-1'>{t('codex.permissions.labels.command')}</Text>
        <code className='text-xs bg-1 p-2 rounded block text-t-primary break-all'>{execInfo.command}</code>
      </div>

      {/* Working directory */}
      {execInfo.cwd && (
        <div>
          <Text className='text-xs text-t-secondary mb-1'>{t('codex.permissions.labels.directory')}</Text>
          <code className='text-xs bg-1 p-2 rounded block text-t-primary break-all'>{execInfo.cwd}</code>
        </div>
      )}

      {/* Reason */}
      {execInfo.reason && (
        <div>
          <Text className='text-xs text-t-secondary mb-1'>{t('codex.permissions.labels.reason')}</Text>
          <Text className='text-sm text-t-primary'>{execInfo.reason}</Text>
        </div>
      )}
    </BasePermissionDisplay>
  );
});

export default ExecApprovalDisplay;
