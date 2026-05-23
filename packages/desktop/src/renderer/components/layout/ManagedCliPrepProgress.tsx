/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { NewApiManagedCliPrepStatus } from '@/common/types/newApiAccount';
import { Button, Progress, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type ManagedCliPrepProgressProps = {
  prepStatus: NewApiManagedCliPrepStatus;
  onRetry?: () => void;
  compact?: boolean;
};

function resolveStageLabel(prepStatus: NewApiManagedCliPrepStatus, t: ReturnType<typeof useTranslation>['t']): string {
  switch (prepStatus.stage) {
    case 'preparing_environment':
      return t('settings.newApiManagedCliPrepPreparingEnvironment');
    case 'installing_hermes':
      return t('settings.newApiManagedCliPrepInstallingHermes');
    case 'installing_openclaw':
      return t('settings.newApiManagedCliPrepInstallingOpenClaw');
    case 'completed':
      return t('settings.newApiManagedCliPrepCompleted');
    case 'failed':
      return t('settings.newApiManagedCliPrepFailed');
    default:
      return t('settings.newApiManagedCliPrepIdle');
  }
}

const ManagedCliPrepProgress: React.FC<ManagedCliPrepProgressProps> = ({ prepStatus, onRetry, compact = false }) => {
  const { t } = useTranslation();
  const completedCount = prepStatus.completedTargets.length;
  const canRetry = prepStatus.stage === 'failed' && typeof onRetry === 'function';

  return (
    <div
      className={
        compact
          ? 'flex flex-col gap-8px rounded-12px bg-fill-1 px-12px py-10px'
          : 'flex flex-col gap-10px rounded-16px border border-solid border-[rgba(var(--primary-6),0.16)] bg-[rgba(var(--primary-6),0.06)] px-16px py-14px'
      }
      data-testid='managed-cli-prep-progress'
    >
      <div className='flex items-start justify-between gap-12px'>
        <div className='min-w-0 flex-1'>
          <Typography.Text className='block text-14px font-medium text-t-primary'>
            {t('settings.newApiManagedCliPrepTitle')}
          </Typography.Text>
          <Typography.Text className='mt-2px block text-12px leading-18px text-t-secondary'>
            {resolveStageLabel(prepStatus, t)}
          </Typography.Text>
        </div>
        <Typography.Text className='shrink-0 text-12px text-primary-6'>
          {t('settings.newApiManagedCliPrepCounter', { completed: completedCount, total: 2 })}
        </Typography.Text>
      </div>

      <Progress
        percent={prepStatus.percent}
        size='small'
        status={prepStatus.stage === 'failed' ? 'error' : 'normal'}
        showText
      />

      {prepStatus.error ? (
        <Typography.Text className='text-12px leading-18px text-[rgb(var(--danger-6))]'>
          {prepStatus.error}
        </Typography.Text>
      ) : null}

      {canRetry ? (
        <div className='flex justify-end'>
          <Button size='mini' type='secondary' onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default ManagedCliPrepProgress;
