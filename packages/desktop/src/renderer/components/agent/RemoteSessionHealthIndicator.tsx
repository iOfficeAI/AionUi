/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RemoteSessionHealthIndicator — small chip + tooltip pair that surfaces
 * the dedicated "remote session error" UI state, distinct from the
 * generic ping-health error.
 *
 * Wired to `useRemoteAgentHealth`'s `sessionErrors` map. The component
 * is intentionally a no-op when the agent has no recorded session
 * error so it can be mounted unconditionally alongside other health
 * indicators (e.g. the existing conversation-header `RemoteServerBadge`).
 */

import { Tag, Tooltip, Typography } from '@arco-design/web-react';
import { CloseOne } from '@icon-park/react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export type RemoteSessionHealthIndicatorProps = {
  /** Last session.error event for this agent, if any. */
  sessionError?: { message: string; at: number };
  /** Optional click handler (e.g. open agent settings). */
  onClick?: () => void;
  /** Override the visible label; defaults to `agent.health.sessionError`. */
  label?: string;
};

const RemoteSessionHealthIndicator: React.FC<RemoteSessionHealthIndicatorProps> = ({
  sessionError,
  onClick,
  label,
}) => {
  const { t } = useTranslation();
  const handleClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  if (!sessionError) return null;

  const tooltipContent = sessionError.message
    ? t('agent.health.sessionErrorTooltip', { message: sessionError.message })
    : t('agent.health.sessionErrorTooltipFallback');

  return (
    <Tooltip content={<span className='block max-w-[320px]'>{tooltipContent}</span>}>
      <Tag
        size='small'
        color='red'
        className={onClick ? 'cursor-pointer' : undefined}
        onClick={onClick ? handleClick : undefined}
        data-testid='remote-session-error-indicator'
      >
        <span className='flex items-center gap-4px'>
          <CloseOne theme='filled' size='12' />
          <Typography.Ellipsis className='max-w-[160px]'>{label ?? t('agent.health.sessionError')}</Typography.Ellipsis>
        </span>
      </Tag>
    </Tooltip>
  );
};

export default RemoteSessionHealthIndicator;
