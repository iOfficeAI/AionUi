/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Badge, Button, Spin } from '@arco-design/web-react';
import { Peoples } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import AgentStatusBadge from '@/renderer/pages/team/components/AgentStatusBadge';
import type { TAdHocLastTeammateMessage } from '@/renderer/pages/conversation/hooks/useAdHocTeamFromConversation';
import type { ITeamRunEvent, ITeamSlotWork, TTeam, TeamAssistant, TeammateStatus } from '@/common/types/team/teamTypes';
import type { TAdHocTeamAssociation } from '@/common/types/team/adHocTeamTypes';

export type TeamStatusCardProps = {
  association: TAdHocTeamAssociation | null;
  team?: TTeam | null;
  teammates?: TeamAssistant[];
  lastTeammateMessage?: TAdHocLastTeammateMessage | null;
  unreadTeammateMessageCount?: number;
  isTeamRunning?: boolean;
  activeRun?: ITeamRunEvent;
  slotWorkBySlot?: Record<string, ITeamSlotWork | undefined>;
  onNavigate: (teamId: string) => void;
};

function getMessagePreview(message: TAdHocLastTeammateMessage): string {
  return message.content ?? '';
}

/**
 * Compact status card shown in normal conversations when an ad-hoc team has
 * been associated. Clicking the card navigates to the team page while keeping
 * the current conversation route intact.
 *
 * The card also surfaces a lightweight summary: member count, unread teammate
 * message count, and a preview of the most recent teammate message.
 */
export const TeamStatusCard: React.FC<TeamStatusCardProps> = ({
  association,
  team,
  teammates = [],
  lastTeammateMessage,
  unreadTeammateMessageCount = 0,
  isTeamRunning = false,
  activeRun: _activeRun,
  slotWorkBySlot = {},
  onNavigate,
}) => {
  const { t } = useTranslation();

  if (!association?.team_id) return null;

  const teamId = association.team_id;
  const teamName = team?.name ?? association.team?.name;
  const isDisbanded = association.status === 'disbanded';
  const displayName = teamName || teamId;
  const status: TeammateStatus = isDisbanded ? 'completed' : 'active';
  const memberCount = teammates.length;
  const messagePreview = lastTeammateMessage ? getMessagePreview(lastTeammateMessage) : '';
  const activeTurnCount = Object.values(slotWorkBySlot).filter((work) => Boolean(work?.active_turn_id)).length;

  const handleClick = () => {
    if (isDisbanded) {
      onNavigate(association.origin_conversation_id);
    } else {
      onNavigate(teamId);
    }
  };

  return (
    <Button
      type='text'
      size='mini'
      className='flex items-center gap-8px px-12px py-6px h-auto rounded-8px bg-2 hover:bg-hover border border-b-base'
      onClick={handleClick}
      data-testid='team-status-card'
      aria-label={t('conversation.collaboration.statusAria', { defaultValue: 'Open team' })}
    >
      <Peoples theme='filled' size='16' className='text-primary shrink-0' />
      <div className='flex flex-col min-w-0 text-left'>
        <div className='flex items-center gap-6px'>
          <span className='text-12px font-500 text-t-secondary' data-testid='team-status-card-title'>
            {t('conversation.collaboration.statusTitle', { defaultValue: 'Team' })}
          </span>
          <AgentStatusBadge status={status} testId='team-status-card-indicator' overlay={false} />
          {isDisbanded && (
            <span className='text-11px text-t-tertiary' data-testid='team-status-card-disbanded-label'>
              {t('conversation.collaboration.disbanded', { defaultValue: 'Disbanded' })}
            </span>
          )}
          {isTeamRunning && !isDisbanded && (
            <span className='flex items-center gap-4px text-11px text-primary' data-testid='team-status-card-running'>
              <Spin size={10} />
              {t('conversation.collaboration.running', { defaultValue: 'Running' })}
            </span>
          )}
          {memberCount > 0 && (
            <Badge
              count={memberCount}
              style={{ backgroundColor: 'var(--color-fill-3)', color: 'var(--color-text-2)' }}
              data-testid='team-status-card-member-count'
            />
          )}
          {unreadTeammateMessageCount > 0 && (
            <Badge count={unreadTeammateMessageCount} offset={[-2, 0]} data-testid='team-status-card-unread-count' />
          )}
        </div>
        <span className='text-13px font-500 text-t-primary truncate' data-testid='team-status-card-name'>
          {displayName}
        </span>
        {messagePreview && (
          <span
            className='text-11px text-t-secondary truncate max-w-160px'
            data-testid='team-status-card-message-preview'
            title={t('conversation.collaboration.latestMessage', {
              defaultValue: 'Latest: {{message}}',
              message: messagePreview,
            })}
          >
            {messagePreview}
          </span>
        )}
        {isTeamRunning && !isDisbanded && activeTurnCount > 0 && (
          <span className='text-11px text-t-secondary truncate' data-testid='team-status-card-run-detail'>
            {t('conversation.collaboration.runDetail', {
              defaultValue: '{{count}} active turn(s)',
              count: activeTurnCount,
            })}
          </span>
        )}
      </div>
    </Button>
  );
};

TeamStatusCard.displayName = 'TeamStatusCard';
