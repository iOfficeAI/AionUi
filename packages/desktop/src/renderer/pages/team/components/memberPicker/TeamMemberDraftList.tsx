import React from 'react';
import { Button, Radio } from '@arco-design/web-react';
import { CloseSmall } from '@icon-park/react';
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

  if (members.length === 0) {
    return (
      <div className='rounded-8px border border-dashed border-border-2 bg-fill-1 px-12px py-14px text-12px text-t-tertiary'>
        {t('team.create.selectAtLeastOneMember', { defaultValue: 'Select at least one team member' })}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-6px rounded-8px border border-border-2 bg-fill-1 p-6px'>
      {members.map((member) => (
        <div
          key={member.selectionId}
          className='flex items-center gap-10px rounded-6px bg-bg-2 px-10px py-8px'
          data-testid={`team-create-member-draft-${member.selectionId}`}
        >
          <Radio checked={leaderSelectionId === member.selectionId} onChange={() => onLeaderChange(member.selectionId)}>
            <span className='text-12px text-t-secondary'>
              {leaderSelectionId === member.selectionId
                ? t('team.create.teamLeader', { defaultValue: 'Team Leader' })
                : t('team.create.teammate', { defaultValue: 'Teammate' })}
            </span>
          </Radio>
          <div className='min-w-0 flex-1'>
            <AssistantOptionLabel assistant={member.assistant} />
          </div>
          <Button
            type='text'
            icon={<CloseSmall theme='outline' size='14' />}
            className='!h-24px !w-24px !min-w-24px !p-0'
            onClick={() => onRemove(member.selectionId)}
            data-testid={`team-create-member-remove-${member.selectionId}`}
          />
        </div>
      ))}
    </div>
  );
};

export default TeamMemberDraftList;
