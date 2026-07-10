import React from 'react';
import { Button } from '@arco-design/web-react';
import { CloseSmall, Crown } from '@icon-park/react';
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
  /**
   * 可选的标题行操作区，渲染在“已选成员 N”标题右侧、替换默认的 Leader 图例。
   * 窄屏用它承载“添加成员”按钮，避免另起一行重复渲染标题。
   */
  headerAction?: React.ReactNode;
  /**
   * 追加到成员列表框上的类名。默认框用 flex-1 撑满父级高度（桌面双栏有固定高度，
   * 因此天然可滚动）。窄屏没有固定高度的父级，可传一个 max-height 让框自身受限、
   * 内容变多时在框内滚动。
   */
  listBoxClassName?: string;
};

const TeamMemberDraftList: React.FC<Props> = ({
  members,
  leaderSelectionId,
  onLeaderChange,
  onRemove,
  headerAction,
  listBoxClassName,
}) => {
  const { t } = useTranslation();

  const hasMembers = members.length > 0;

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='mb-4px flex items-center justify-between gap-8px'>
        <span className='text-15px font-600 leading-22px text-t-secondary'>
          {t('team.create.selectedMembersTitleWithCount', {
            count: members.length,
            defaultValue: `Selected members ${members.length}`,
          })}
        </span>
        {headerAction ?? (
          <span className='flex items-center gap-4px text-12px leading-18px text-t-tertiary'>
            <Crown theme='filled' size='13' fill='var(--warning)' className='relative top-1px block leading-none' />
            {t('team.create.leaderLegend', { defaultValue: '= Leader' })}
          </span>
        )}
      </div>
      <p className='m-0 mb-12px text-12px leading-18px text-t-tertiary'>
        {t('team.create.membersHelper', {
          defaultValue: 'Choose team members and assign one Leader. The same assistant can be selected multiple times.',
        })}
      </p>
      <div
        data-testid='team-create-member-list-box'
        className={`min-h-120px flex-1 overflow-y-auto rounded-8px bg-fill-1 ${hasMembers ? 'flex flex-col gap-6px p-8px' : 'flex items-center justify-center px-14px py-12px'} ${listBoxClassName ?? ''}`}
      >
        {!hasMembers ? (
          <div className='flex max-w-260px flex-col items-center gap-6px text-center'>
            <span className='text-13px font-500 leading-20px text-t-secondary'>
              {t('team.create.selectAtLeastOneMember', {
                defaultValue: 'Select at least one assistant as the Team Leader.',
              })}
            </span>
            <span className='text-12px leading-18px text-t-tertiary'>
              {t('team.create.memberHint', {
                defaultValue:
                  'No suitable assistant as a member? After creation, let the Leader create temporary team members in chat.',
              })}
            </span>
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
                className='flex h-40px shrink-0 items-center gap-8px rounded-8px px-8px hover:bg-fill-2'
                data-testid={`team-create-member-draft-${member.selectionId}`}
              >
                <AssistantOptionLabel assistant={member.assistant} size='large' />
                <div className='flex flex-1 items-center justify-end gap-10px'>
                  <Button
                    type='text'
                    className={`!h-26px !w-26px !min-w-26px !rounded-6px !p-0 ${
                      isLeader
                        ? '!bg-[rgba(var(--warning-6),0.16)] hover:!bg-[rgba(var(--warning-6),0.24)]'
                        : '!bg-transparent !text-t-tertiary hover:!bg-fill-2 hover:!text-t-secondary'
                    }`}
                    icon={
                      <Crown
                        theme={isLeader ? 'filled' : 'outline'}
                        size='15'
                        fill={isLeader ? 'var(--warning)' : 'currentColor'}
                      />
                    }
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
      </div>
    </div>
  );
};

export default TeamMemberDraftList;
