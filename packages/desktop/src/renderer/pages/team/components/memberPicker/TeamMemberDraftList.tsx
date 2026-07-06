import React from 'react';
import { Button } from '@arco-design/web-react';
import { CloseSmall, Flag } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { AssistantOptionLabel, type TeamAssistantOption } from '../assistantSelectUtils';

export type TeamMemberDraft = {
  selectionId: string;
  assistant: TeamAssistantOption;
};

type Props = {
  members: TeamMemberDraft[];
  leaderSelectionId?: string;
  onLeaderChange: (selectionId: string) => void;
  onRemove: (selectionId: string) => void;
};

const TeamMemberDraftList: React.FC<Props> = ({ members, leaderSelectionId, onLeaderChange, onRemove }) => {
  const { t } = useTranslation();

  return (
    <div className='flex min-h-0 flex-col'>
      <div className='mb-28px text-20px font-700 leading-28px text-t-secondary'>
        {t('team.create.selectedMembersWithCount', {
          count: members.length,
          defaultValue: `Selected members ${members.length} · ⚑ = Leader`,
        })}
      </div>
      <div className='flex min-h-176px flex-col gap-16px'>
        {members.length === 0 ? (
          <div className='flex min-h-176px items-start rounded-8px bg-fill-1 px-22px py-24px text-18px leading-28px text-t-tertiary'>
            {t('team.create.selectAtLeastOneMember', { defaultValue: 'Select at least one team member' })}
          </div>
        ) : (
          members.map((member) => {
            const isLeader = leaderSelectionId === member.selectionId;
            return (
              <div
                key={member.selectionId}
                className='flex h-60px items-center gap-18px rounded-8px px-16px'
                data-testid={`team-create-member-draft-${member.selectionId}`}
              >
                <AssistantOptionLabel assistant={member.assistant} size='large' />
                <div className='flex flex-1 items-center justify-end gap-24px'>
                  <Button
                    type='text'
                    className={`!h-28px !w-28px !min-w-28px !p-0 ${isLeader ? 'text-success-6' : 'text-t-tertiary'}`}
                    icon={<Flag theme='filled' size='18' fill='currentColor' />}
                    onClick={() => onLeaderChange(member.selectionId)}
                    aria-label={
                      isLeader
                        ? t('team.create.teamLeader', { defaultValue: 'Team Leader' })
                        : t('team.create.teammate', { defaultValue: 'Teammate' })
                    }
                  />
                  <Button
                    type='text'
                    icon={<CloseSmall theme='outline' size='22' />}
                    className='!h-28px !w-28px !min-w-28px !p-0 text-t-tertiary'
                    onClick={() => onRemove(member.selectionId)}
                    data-testid={`team-create-member-remove-${member.selectionId}`}
                  />
                </div>
              </div>
            );
          })
        )}
        <div className='rounded-8px bg-fill-1 px-18px py-16px text-18px leading-28px text-t-tertiary'>
          {t('team.create.memberHint', {
            defaultValue:
              'No suitable assistant as a member? After creation, let the Leader create temporary team members in chat.',
          })}
        </div>
      </div>
    </div>
  );
};

export default TeamMemberDraftList;
