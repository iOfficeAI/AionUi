/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import { AlarmClock } from '@icon-park/react';
import classNames from 'classnames';
import { iconColors } from '@renderer/styles/colors';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

interface SiderScheduledEntryProps {
  isMobile: boolean;
  isActive: boolean;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
}

const SiderScheduledEntry: React.FC<SiderScheduledEntryProps> = ({
  isMobile,
  isActive,
  siderTooltipProps,
  onClick,
}) => {
  const { t } = useTranslation();

  return (
    <Tooltip {...siderTooltipProps} content={t('cron.scheduledTasks')} position='right'>
      <div
        className={classNames(
          'shrink-0 h-36px flex items-center justify-start gap-10px px-12px rd-0.5rem cursor-pointer transition-colors hover:bg-[rgba(var(--primary-6),0.14)]',
          isMobile && 'sider-action-btn-mobile',
          isActive && 'text-primary'
        )}
        onClick={onClick}
      >
        <AlarmClock
          theme='outline'
          size='20'
          fill={isActive ? 'rgb(var(--primary-6))' : iconColors.primary}
          className='block leading-none shrink-0'
          style={{ lineHeight: 0 }}
        />
        <span className='collapsed-hidden text-t-primary text-13px'>{t('cron.scheduledTasks')}</span>
      </div>
    </Tooltip>
  );
};

export default SiderScheduledEntry;
