/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Divider, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { CheckOne, Refresh, Shield } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TeamWatchdogInterval } from './watchdogTypes';

type TeamWatchdogToggleProps = {
  intervalMs: TeamWatchdogInterval;
  onChangeInterval: (interval: TeamWatchdogInterval) => void;
  onCheckAndRetryNow: () => Promise<void>;
  isMonitoring: boolean;
  isRecovering: boolean;
};

export const TeamWatchdogToggle: React.FC<TeamWatchdogToggleProps> = ({
  intervalMs,
  onChangeInterval,
  onCheckAndRetryNow,
  isMonitoring,
  isRecovering,
}) => {
  const { t } = useTranslation();

  const minutes = intervalMs > 0 ? Math.round(intervalMs / 60_000) : 0;
  const isEnabled = intervalMs > 0;

  const tooltipContent = isEnabled
    ? t('team.watchdog.tooltipActive', {
        minutes,
        defaultValue: `Auto-Watchdog: Monitoring every ${minutes}m. Auto-stops and retries if stalled.`,
      })
    : t('team.watchdog.tooltipOff', {
        defaultValue: 'Auto-Watchdog: Disabled. Click to enable 2m/5m auto-retry when stuck.',
      });

  const buttonText = isEnabled
    ? t('team.watchdog.active', { minutes, defaultValue: `Watchdog: ${minutes}m` })
    : t('team.watchdog.off', { defaultValue: 'Watchdog: Off' });

  const menu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'check-now') {
          void onCheckAndRetryNow();
        } else {
          onChangeInterval(Number(key) as TeamWatchdogInterval);
        }
      }}
      selectedKeys={[String(intervalMs)]}
    >
      <div className='px-12px py-6px text-12px font-600 text-t-secondary select-none'>
        {t('team.watchdog.menuTitle', { defaultValue: 'Auto-Watchdog Interval' })}
      </div>
      <Menu.Item key='0'>
        <div className='flex items-center justify-between gap-12px'>
          <span>{t('team.watchdog.optionOff', { defaultValue: 'Off' })}</span>
          {intervalMs === 0 && <CheckOne theme='filled' size='14' className='text-[rgb(var(--primary-6))]' />}
        </div>
      </Menu.Item>
      <Menu.Item key='120000'>
        <div className='flex items-center justify-between gap-12px'>
          <span>{t('team.watchdog.option2m', { defaultValue: 'Every 2 minutes' })}</span>
          {intervalMs === 120_000 && <CheckOne theme='filled' size='14' className='text-[rgb(var(--primary-6))]' />}
        </div>
      </Menu.Item>
      <Menu.Item key='300000'>
        <div className='flex items-center justify-between gap-12px'>
          <span>{t('team.watchdog.option5m', { defaultValue: 'Every 5 minutes' })}</span>
          {intervalMs === 300_000 && <CheckOne theme='filled' size='14' className='text-[rgb(var(--primary-6))]' />}
        </div>
      </Menu.Item>
      <Menu.Item key='600000'>
        <div className='flex items-center justify-between gap-12px'>
          <span>{t('team.watchdog.option10m', { defaultValue: 'Every 10 minutes' })}</span>
          {intervalMs === 600_000 && <CheckOne theme='filled' size='14' className='text-[rgb(var(--primary-6))]' />}
        </div>
      </Menu.Item>
      <Divider style={{ margin: '4px 0' }} />
      <Menu.Item key='check-now' disabled={isRecovering}>
        <div className='flex items-center gap-6px text-[rgb(var(--primary-6))]'>
          <Refresh theme='outline' size='14' />
          <span>{t('team.watchdog.checkNow', { defaultValue: 'Check Progress & Retry Now' })}</span>
        </div>
      </Menu.Item>
    </Menu>
  );

  return (
    <Dropdown trigger='click' droplist={menu} position='br'>
      <Tooltip content={tooltipContent} position='bottom'>
        <Button
          size='small'
          type={isEnabled ? 'primary' : 'secondary'}
          status={isMonitoring ? 'success' : 'default'}
          loading={isRecovering}
          icon={<Shield theme={isEnabled ? 'filled' : 'outline'} size='14' />}
          className={isMonitoring ? 'shadow-sm' : undefined}
          data-testid='team-watchdog-toggle'
        >
          {buttonText}
        </Button>
      </Tooltip>
    </Dropdown>
  );
};
