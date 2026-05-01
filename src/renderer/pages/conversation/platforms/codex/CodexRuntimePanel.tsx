/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatTokenCount } from '@/renderer/components/agent/ContextUsageIndicator';
import { Progress, Space, Typography } from '@arco-design/web-react';
import { Terminal, Time } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CodexActivity } from './useCodexMessage';

const { Text } = Typography;

type CodexRuntimePanelProps = {
  activity: CodexActivity | null;
  running: boolean;
  tokenUsage: { totalTokens: number } | null;
  contextLimit: number;
};

function getActivityLabel(
  activity: CodexActivity | null,
  running: boolean,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (!activity) {
    return running ? t('codex.runtime.activity.waiting') : t('codex.runtime.activity.idle');
  }

  switch (activity.phase) {
    case 'waiting':
      return t('codex.runtime.activity.waiting');
    case 'thinking':
      return t('codex.runtime.activity.thinking');
    case 'streaming':
      return t('codex.runtime.activity.streaming');
    case 'permission':
      return t('codex.runtime.activity.permission');
    case 'tool':
      return activity.title
        ? t('codex.runtime.activity.toolWithName', { tool: activity.title })
        : t('codex.runtime.activity.tool');
  }
}

const CodexRuntimePanel: React.FC<CodexRuntimePanelProps> = ({ activity, running, tokenUsage, contextLimit }) => {
  const { t } = useTranslation();
  const usagePercent = useMemo(() => {
    if (!tokenUsage || contextLimit <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((tokenUsage.totalTokens / contextLimit) * 100));
  }, [contextLimit, tokenUsage]);

  if (!running && !tokenUsage) {
    return null;
  }

  return (
    <div className='max-w-800px w-full mx-auto mt-8px mb-8px px-2px'>
      <div className='flex items-center justify-between gap-12px text-12px text-t-secondary'>
        <Space size={6}>
          <Time theme='outline' size='14' />
          <Text type='secondary'>{getActivityLabel(activity, running, t)}</Text>
        </Space>
        {tokenUsage && contextLimit > 0 ? (
          <Space size={6}>
            <Terminal theme='outline' size='14' />
            <Text type='secondary'>
              {t('codex.runtime.contextUsage', {
                used: formatTokenCount(tokenUsage.totalTokens),
                limit: formatTokenCount(contextLimit, true),
              })}
            </Text>
          </Space>
        ) : null}
      </div>
      {tokenUsage && contextLimit > 0 ? (
        <Progress
          percent={usagePercent}
          showText={false}
          size='small'
          className='mt-6px'
          color={usagePercent >= 90 ? 'rgb(var(--danger-6))' : 'rgb(var(--primary-6))'}
        />
      ) : null}
    </div>
  );
};

export default CodexRuntimePanel;
