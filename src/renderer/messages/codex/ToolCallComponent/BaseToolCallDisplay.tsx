/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card, Tag } from '@arco-design/web-react';
import type { ReactNode } from 'react';
import React from 'react';
import { useTranslation } from 'react-i18next';

export const StatusTag: React.FC<{ status: string }> = ({ status }) => {
  const { t } = useTranslation();

  const getTagProps = () => {
    switch (status) {
      case 'pending':
        return { color: 'blue', text: t('tools.status.pending') };
      case 'executing':
        return { color: 'orange', text: t('tools.status.executing') };
      case 'success':
        return { color: 'green', text: t('tools.status.success') };
      case 'error':
        return { color: 'red', text: t('tools.status.error') };
      case 'canceled':
        return { color: 'gray', text: t('tools.status.canceled') };
      default:
        return { color: 'gray', text: status };
    }
  };

  const { color, text } = getTagProps();
  return <Tag color={color}>{text}</Tag>;
};

interface BaseToolCallDisplayProps {
  toolCallId: string;
  title: string;
  status: string;
  description?: string | ReactNode;
  icon: string;
  additionalTags?: ReactNode; // 额外的标签，如 exit code、duration 等
  children?: ReactNode; // 特定工具的详细信息内容
}

const BaseToolCallDisplay: React.FC<BaseToolCallDisplayProps> = ({ toolCallId, title, status, description, icon, additionalTags, children }) => {
  return (
    <Card className='w-full mb-2' size='small' bordered>
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-2'>
            <span className='text-lg'>{icon}</span>
            <span className='font-medium text-t-primary'>{title}</span>
            <StatusTag status={status} />
            {additionalTags}
          </div>

          {description && <div className='text-sm text-t-secondary mb-2 overflow-hidden'>{description}</div>}

          {/* 特定工具的详细信息 */}
          {children}

          <div className='text-xs text-t-secondary mt-2'>Tool Call ID: {toolCallId}</div>
        </div>
      </div>
    </Card>
  );
};

export default BaseToolCallDisplay;
