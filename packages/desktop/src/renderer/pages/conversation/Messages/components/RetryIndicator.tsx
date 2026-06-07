import type { IMessageRetry } from '@/common/chat/chatLib';
import { Tag, Tooltip } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const redReasons = new Set(['provider_error', 'tool_error']);

const RetryIndicator: React.FC<{ message: IMessageRetry }> = ({ message }) => {
  const { t } = useTranslation();
  const color = redReasons.has(message.content.reason) ? 'red' : 'orange';
  const label = t(`conversation.remoteRetry.reason.${message.content.reason}`, {
    defaultValue: message.content.reason,
  });
  return (
    <Tooltip
      content={t('conversation.remoteRetry.tooltip', {
        reason: label,
        attempt: message.content.attempt,
        defaultValue: `${label} retry attempt ${message.content.attempt}`,
      })}
    >
      <Tag color={color} size='small'>
        {t('conversation.remoteRetry.tag', {
          reason: label,
          attempt: message.content.attempt,
          defaultValue: `${label} · retry ${message.content.attempt}`,
        })}
      </Tag>
    </Tooltip>
  );
};

export default RetryIndicator;
