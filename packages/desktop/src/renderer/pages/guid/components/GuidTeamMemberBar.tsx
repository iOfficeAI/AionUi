/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Input } from '@arco-design/web-react';
import { Close, Crown, Plus } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { AssistantOptionLabel, type TeamAssistantOption } from '@renderer/pages/team/components/assistantSelectUtils';

type Props = {
  /** Selected members in selection order; index 0 defaults to leader. */
  members: TeamAssistantOption[];
  /** Current leader assistant id. */
  leaderId?: string;
  /** Team name draft; empty means "auto-name from member names" on create. */
  teamName: string;
  onTeamNameChange: (value: string) => void;
  onSetLeader: (id: string) => void;
  onRemove: (id: string) => void;
  /** Open the full team-create modal for advanced editing. */
  onOpenAdvanced: () => void;
};

/**
 * Inline homepage memberbar shown once ≥2 assistants are selected (design 图2):
 * a team-name input plus a row of member chips (crown = leader toggle, ✕ = remove)
 * and an "add / advanced" entry into the full {@link TeamCreateModal}.
 */
const GuidTeamMemberBar: React.FC<Props> = ({
  members,
  leaderId,
  teamName,
  onTeamNameChange,
  onSetLeader,
  onRemove,
  onOpenAdvanced,
}) => {
  const { t } = useTranslation();

  return (
    <div
      data-testid='guid-team-memberbar'
      className='flex flex-col gap-10px rounded-12px border border-border-2 bg-fill-1 px-14px py-12px'
    >
      <div className='grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-12px'>
        <span className='text-13px font-500 text-t-secondary'>{t('conversation.welcome.teamLabel')}</span>
        <Input
          value={teamName}
          onChange={onTeamNameChange}
          placeholder={t('conversation.welcome.teamNamePlaceholder')}
          data-testid='guid-team-name-input'
          className='!h-34px !rounded-8px !text-13px'
        />
      </div>

      <div className='grid grid-cols-[48px_minmax(0,1fr)] items-start gap-x-12px'>
        <span className='mt-6px text-13px font-500 text-t-secondary'>{t('conversation.welcome.membersLabel')}</span>
        <div className='flex flex-wrap items-center gap-8px'>
          {members.map((member) => {
            const isLeader = member.id === leaderId;
            return (
              <div
                key={member.id}
                data-testid={`guid-member-chip-${member.id}`}
                className='flex items-center gap-6px rounded-999px border border-border-3 bg-bg-1 py-4px pl-6px pr-4px'
              >
                <Button
                  type='text'
                  size='mini'
                  data-testid={`guid-member-leader-${member.id}`}
                  aria-label={t('conversation.welcome.setLeader')}
                  onClick={() => onSetLeader(member.id)}
                  className={`!h-24px !w-24px !min-w-24px !rounded-999px !p-0 ${isLeader ? '!text-warning-6' : '!text-t-tertiary'}`}
                  icon={<Crown theme={isLeader ? 'filled' : 'outline'} size='15' fill='currentColor' />}
                />
                <AssistantOptionLabel assistant={member} />
                <Button
                  type='text'
                  size='mini'
                  data-testid={`guid-member-remove-${member.id}`}
                  aria-label={t('conversation.welcome.removeMember')}
                  onClick={() => onRemove(member.id)}
                  className='!h-24px !w-24px !min-w-24px !rounded-999px !p-0 !text-t-tertiary'
                  icon={<Close theme='outline' size='14' fill='currentColor' />}
                />
              </div>
            );
          })}

          <Button
            type='outline'
            size='small'
            data-testid='guid-team-advanced-btn'
            onClick={onOpenAdvanced}
            icon={<Plus theme='outline' size='14' fill='currentColor' />}
            className='!h-30px !rounded-999px !px-12px !text-13px'
          >
            {t('conversation.welcome.addAdvanced')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GuidTeamMemberBar;
