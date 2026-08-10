/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tag } from '@arco-design/web-react';
import { Crown, Peoples } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { TeamPresetMember } from '../../types';

type TeamPresetMemberListProps = {
  members: TeamPresetMember[];
  leader: TeamPresetMember;
  missingIds?: string[];
};

export const TeamPresetMemberList: React.FC<TeamPresetMemberListProps> = ({ members, leader, missingIds = [] }) => {
  const { t } = useTranslation();

  return (
    <ul className='m-0 flex list-none flex-col gap-6px p-0'>
      {members.map((member, index) => {
        const isLeader = member.assistant_id === leader.assistant_id && member.order === leader.order;
        const isMissing = member.assistant_id ? missingIds.includes(member.assistant_id) : false;
        return (
          <li
            // eslint-disable-next-line react/no-array-index-key
            key={`${member.assistant_id ?? member.assistant_name}-${index}`}
            className='flex items-center gap-8px rounded-6px px-8px py-6px hover:bg-fill-2'
          >
            <span className='flex size-22px items-center justify-center rounded-full bg-fill-2 text-t-secondary'>
              <Peoples theme='outline' size='14' />
            </span>
            <span
              className={`flex-1 truncate text-13px font-500 ${
                isMissing ? 'text-[rgb(var(--danger-6))]' : 'text-t-primary'
              }`}
            >
              {member.assistant_name}
            </span>
            {isMissing && (
              <Tag size='small' color='red'>
                {t('team.presets.memberMissing', { defaultValue: 'Missing' })}
              </Tag>
            )}
            {isLeader && (
              <Tag size='small' color='orange'>
                <span className='flex items-center gap-4px'>
                  <Crown theme='filled' size='12' />
                  {t('team.presets.leaderLabel', { defaultValue: 'Leader' })}
                </span>
              </Tag>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default TeamPresetMemberList;
