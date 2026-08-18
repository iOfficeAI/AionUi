import { Button, Tag } from '@arco-design/web-react';
import { Peoples } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TeamPreset, TeamPresetMember } from '@/common/types/team/teamTypes';
import TeamPresetMemberList from './TeamPresetMemberList';

type Props = {
  preset?: TeamPreset | null;
  missingMembers?: TeamPresetMember[];
  onInvoke: (preset: TeamPreset) => void;
};

const TeamPresetPreview: React.FC<Props> = ({ preset, missingMembers = [], onInvoke }) => {
  const { t } = useTranslation();
  if (!preset)
    return (
      <div className='flex h-full items-center justify-center text-13px text-t-tertiary'>
        {t('team.presets.selectHint', { defaultValue: 'Select an expert team to preview its details.' })}
      </div>
    );
  const missingIds = missingMembers.map((m) => m.assistant_id).filter(Boolean) as string[];
  const hasMissing = missingIds.length > 0;
  return (
    <div className='flex h-full flex-col gap-12px overflow-y-auto px-4px py-2px' data-testid='team-preset-preview'>
      <div className='flex items-start gap-12px'>
        <span className='flex size-44px shrink-0 items-center justify-center rounded-12px bg-fill-2 text-primary'>
          <Peoples theme='filled' size='24' />
        </span>
        <div className='flex min-w-0 flex-1 flex-col gap-4px'>
          <span className='truncate text-16px font-600 text-t-primary' data-testid='preset-preview-name'>
            {preset.name}
          </span>
          {preset.category && (
            <Tag size='small' className='w-fit'>
              {preset.category}
            </Tag>
          )}
        </div>
      </div>
      <p className='m-0 text-13px leading-20px text-t-secondary' data-testid='preset-preview-description'>
        {preset.description}
      </p>
      {preset.expertise_tags.length > 0 && (
        <div className='flex flex-wrap gap-6px'>
          {preset.expertise_tags.map((tag) => (
            <Tag key={tag} size='small' color='arcoblue'>
              {tag}
            </Tag>
          ))}
        </div>
      )}
      {hasMissing && (
        <div className='rounded-8px bg-[rgba(var(--danger-6),0.08)] px-12px py-8px text-12px text-[rgb(var(--danger-6))]'>
          {t('team.presets.missingWarning', {
            defaultValue: 'Some assistants in this preset are unavailable. Replace them before creating the team.',
          })}
        </div>
      )}
      <div className='flex flex-col gap-8px'>
        <span className='text-13px font-600 text-t-secondary'>
          {t('team.presets.membersLabel', { defaultValue: 'Members' })}
        </span>
        <TeamPresetMemberList members={preset.members} leader={preset.leader} missingIds={missingIds} />
      </div>
      {preset.example_prompts.length > 0 && (
        <div className='flex flex-col gap-8px'>
          <span className='text-13px font-600 text-t-secondary'>
            {t('team.presets.examplesLabel', { defaultValue: 'Example tasks' })}
          </span>
          <ul className='m-0 flex list-none flex-col gap-4px p-0'>
            {preset.example_prompts.map((example) => (
              <li key={example} className='text-12px text-t-tertiary'>
                • {example}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className='mt-auto pt-12px'>
        <Button
          type='primary'
          long
          onClick={() => onInvoke(preset)}
          data-testid='preset-preview-invoke'
          disabled={hasMissing}
        >
          {t('team.presets.invokeThisTeam', { defaultValue: 'Invoke this expert team' })}
        </Button>
      </div>
    </div>
  );
};

export default TeamPresetPreview;
