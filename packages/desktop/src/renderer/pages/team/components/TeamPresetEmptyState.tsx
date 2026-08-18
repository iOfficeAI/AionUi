import { Button, Empty } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const TeamPresetEmptyState: React.FC<{ onCreate?: () => void }> = ({ onCreate }) => {
  const { t } = useTranslation();
  return (
    <div
      className='flex h-full flex-col items-center justify-center gap-12px px-20px py-24px text-center'
      data-testid='team-preset-empty-state'
    >
      <Empty
        description={t('team.presets.emptyDescription', {
          defaultValue: 'Create reusable expert teams to speed up team setup.',
        })}
      />
      <Button
        type='primary'
        size='small'
        icon={<Plus theme='outline' size='14' />}
        onClick={onCreate}
        data-testid='preset-empty-create'
      >
        {t('team.presets.createPreset', { defaultValue: 'Create expert team' })}
      </Button>
    </div>
  );
};

export default TeamPresetEmptyState;
