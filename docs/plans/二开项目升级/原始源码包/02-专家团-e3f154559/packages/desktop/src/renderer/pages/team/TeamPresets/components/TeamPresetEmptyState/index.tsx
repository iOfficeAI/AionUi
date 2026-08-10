/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Empty } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import { useTranslation } from 'react-i18next';

type TeamPresetEmptyStateProps = {
  onCreate?: () => void;
};

export const TeamPresetEmptyState: React.FC<TeamPresetEmptyStateProps> = ({ onCreate }) => {
  const { t } = useTranslation();

  return (
    <div className='flex h-full flex-col items-center justify-center gap-12px px-20px py-24px text-center'>
      <Empty
        description={t('team.presets.emptyDescription', {
          defaultValue: 'Create reusable expert teams to speed up team setup.',
        })}
      />
      <Button
        type='primary'
        size='small'
        icon={<Plus theme='outline' size='14' fill='currentColor' />}
        onClick={onCreate}
        data-testid='preset-empty-create'
      >
        {t('team.presets.createPreset', { defaultValue: 'Create expert team' })}
      </Button>
    </div>
  );
};

export default TeamPresetEmptyState;
