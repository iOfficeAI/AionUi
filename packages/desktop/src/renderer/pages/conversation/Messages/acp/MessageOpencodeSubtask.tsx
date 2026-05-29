/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageOpencodeSubtask } from '@/common/chat/chatLib';
import { Card, Tag } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Sub-agent (OpenCode child session) bubble.
 *
 * Renders a compact chip at the position the parent delegated the task. While
 * the child session is in flight the chip shows the rolling counter and the
 * currently active tool; on completion it settles to the final status with the
 * elapsed duration.
 *
 * Sub-agent tool calls themselves render inline at the top level (see
 * `MessageAcpToolCall`'s sub-agent attribution styling) — this bubble is the
 * lifecycle anchor that lets the user spot a sub-agent at a glance and watch
 * its progress without scrolling through individual tool-call cards.
 */
const MessageOpencodeSubtask: React.FC<{ message: IMessageOpencodeSubtask }> = ({ message }) => {
  const { t } = useTranslation();
  const data = message.content;
  const running = data.phase !== 'completed';
  const status = data.status;
  const elapsed =
    data.started_at && data.completed_at ? Math.max(0, Math.round((data.completed_at - data.started_at) / 1000)) : null;

  const headerColor = (() => {
    if (!status) return 'arcoblue';
    if (status === 'completed') return 'green';
    if (status === 'failed') return 'red';
    return 'gray';
  })();

  const headerLabel = (() => {
    if (running) return t('messages.remoteSubagent.running');
    if (status === 'completed') return t('messages.remoteSubagent.completed', { seconds: elapsed ?? 0 });
    if (status === 'failed') return t('messages.remoteSubagent.failed');
    if (status === 'aborted') return t('messages.remoteSubagent.aborted');
    return t('messages.remoteSubagent.completed', { seconds: elapsed ?? 0 });
  })();

  const counter = data.live_summary?.tool_calls_count ?? 0;
  const currentTool = data.live_summary?.current_tool_name;

  return (
    <Card className='w-full mb-2' size='small' bordered>
      <div className='flex items-center gap-2 flex-wrap'>
        <Tag color={headerColor} size='small'>
          {t('messages.remoteSubagent.tag')}
        </Tag>
        <span className='font-medium text-t-primary'>{data.agent_name ?? t('messages.remoteSubagent.unnamed')}</span>
        <span className='text-xs text-t-secondary'>{headerLabel}</span>
        <span className='text-xs text-t-secondary'>
          {t('messages.remoteSubagent.toolCount', { count: counter })}
          {running && currentTool ? ` · ${currentTool}` : ''}
        </span>
      </div>
      {data.summary && <div className='mt-2 text-sm text-t-primary break-words'>{data.summary}</div>}
    </Card>
  );
};

export default MessageOpencodeSubtask;
