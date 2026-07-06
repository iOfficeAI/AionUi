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
      <div className='mb-12px text-15px font-600 leading-22px text-t-secondary'>
        {t('team.create.selectedMembersWithCount', {
          count: members.length,
          defaultValue: `Selected members ${members.length} · ⚑ = Leader`,
        })}
      </div>
      <div className='flex min-h-112px flex-col gap-6px'>
        {members.length === 0 ? (
          <div className='flex min-h-112px items-start rounded-8px bg-fill-1 px-14px py-12px text-13px leading-20px text-t-tertiary'>
            {t('team.create.selectAtLeastOneMember', { defaultValue: 'Select at least one team member' })}
          </div>
        ) : (
          members.map((member) => {
            const isLeader = leaderSelectionId === member.selectionId;
            const leaderButtonLabel = isLeader
              ? t('team.create.currentLeader', { defaultValue: 'Current Leader' })
              : t('team.create.setAsLeader', { defaultValue: 'Set as Leader' });
            return (
              <div
                key={member.selectionId}
                className='flex h-40px items-center gap-8px rounded-8px px-8px'
                data-testid={`team-create-member-draft-${member.selectionId}`}
              >
                <AssistantOptionLabel assistant={member.assistant} size='large' />
                <div className='flex flex-1 items-center justify-end gap-10px'>
                  <Button
                    type='text'
                    className={`!h-26px !w-26px !min-w-26px !rounded-6px !p-0 ${
                      isLeader
                        ? '!bg-[rgba(var(--success-6),0.14)] !text-[rgb(var(--success-6))] hover:!bg-[rgba(var(--success-6),0.20)]'
                        : '!bg-transparent !text-t-tertiary hover:!bg-fill-2 hover:!text-t-secondary'
                    }`}
                    icon={<Flag theme={isLeader ? 'filled' : 'outline'} size='14' fill='currentColor' />}
                    onClick={() => onLeaderChange(member.selectionId)}
                    aria-label={leaderButtonLabel}
                    aria-pressed={isLeader}
                    data-leader-state={isLeader ? 'active' : 'inactive'}
                  />
                  <Button
                    type='text'
                    icon={<CloseSmall theme='outline' size='16' />}
                    className='!h-24px !w-24px !min-w-24px !p-0 text-t-tertiary'
                    onClick={() => onRemove(member.selectionId)}
                    data-testid={`team-create-member-remove-${member.selectionId}`}
                  />
                </div>
              </div>
            );
          })
        )}
        <div className='rounded-8px bg-fill-1 px-12px py-10px text-13px leading-20px text-t-tertiary'>
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
