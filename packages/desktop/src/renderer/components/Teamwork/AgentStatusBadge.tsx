/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { Avatar, CheckOne, Code, Search, Tool } from '@icon-park/react';
import type { TeamworkRole, TeamworkTokenConsumption } from '@/common/types/teamwork';

export type AgentStatusBadgeProps = {
  role?: TeamworkRole;
  isExecuting?: boolean;
  activeToolCall?: string;
  tokenConsumption?: TeamworkTokenConsumption;
  className?: string;
};

const getRoleConfig = (role: TeamworkRole) => {
  switch (role) {
    case 'sentinel':
      return {
        tagColor: 'purple',
        icon: <Avatar theme='outline' size='14' />,
      };
    case 'explorer':
      return {
        tagColor: 'arcoblue',
        icon: <Search theme='outline' size='14' />,
      };
    case 'worker':
      return {
        tagColor: 'orange',
        icon: <Code theme='outline' size='14' />,
      };
    case 'auditor':
      return {
        tagColor: 'green',
        icon: <CheckOne theme='outline' size='14' />,
      };
    default:
      return {
        tagColor: 'gray',
        icon: <Avatar theme='outline' size='14' />,
      };
  }
};

const formatTokenCount = (count?: number): string => {
  if (!count) return '0';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${count}`;
};

export const AgentStatusBadge: React.FC<AgentStatusBadgeProps> = ({
  role = 'sentinel',
  isExecuting = false,
  activeToolCall,
  tokenConsumption,
  className = '',
}) => {
  const { t } = useTranslation();
  const config = getRoleConfig(role);
  const roleName = t(`team.teamwork.roles.${role}`, { defaultValue: role });

  return (
    <div className={`inline-flex items-center gap-2 flex-wrap ${className}`}>
      {/* Role Badge */}
      <Tag
        color={config.tagColor}
        className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium shadow-xs'
      >
        {isExecuting ? <Spin size={12} className='mr-0.5' /> : config.icon}
        <span>{roleName}</span>
      </Tag>

      {/* Active Tool Call */}
      {activeToolCall ? (
        <Tag color='cyan' className='inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-xs'>
          <Tool theme='outline' size='12' />
          <span>{activeToolCall}</span>
        </Tag>
      ) : null}

      {/* Token Consumption */}
      {tokenConsumption && tokenConsumption.totalTokens > 0 ? (
        <Tooltip
          content={`In: ${tokenConsumption.inputTokens.toLocaleString()} | Out: ${tokenConsumption.outputTokens.toLocaleString()}`}
        >
          <Tag
            color='gray'
            className='inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs cursor-default text-[var(--color-text-3)]'
          >
            <span>{t('team.teamwork.tokensLabel')}:</span>
            <span className='font-semibold text-[var(--color-text-2)]'>
              {formatTokenCount(tokenConsumption.totalTokens)}
            </span>
          </Tag>
        </Tooltip>
      ) : null}
    </div>
  );
};
