/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import { IconMoonFill, IconSunFill } from '@arco-design/web-react/icon';
import { ArrowCircleLeft, SettingTwo } from '@icon-park/react';
import classNames from 'classnames';
import { iconColors } from '@renderer/styles/colors';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

interface SiderFooterProps {
  isMobile: boolean;
  isSettings: boolean;
  theme: string;
  siderTooltipProps: SiderTooltipProps;
  onSettingsClick: () => void;
  onThemeToggle: () => void;
}

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  isSettings,
  theme,
  siderTooltipProps,
  onSettingsClick,
  onThemeToggle,
}) => {
  const { t } = useTranslation();

  return (
    <div className='shrink-0 sider-footer mt-auto pt-8px'>
      <div className='flex flex-col gap-8px'>
        {isSettings && (
          <Tooltip
            {...siderTooltipProps}
            content={theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}
            position='right'
          >
            <div
              onClick={onThemeToggle}
              className={classNames(
                'flex items-center justify-start gap-10px px-12px py-8px rd-0.5rem cursor-pointer transition-colors hover:bg-hover active:bg-fill-2',
                isMobile && 'sider-footer-btn-mobile'
              )}
              aria-label={theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}
            >
              {theme === 'dark' ? (
                <IconSunFill style={{ fontSize: 18, color: 'rgb(var(--primary-6))' }} />
              ) : (
                <IconMoonFill style={{ fontSize: 18, color: 'rgb(var(--primary-6))' }} />
              )}
              <span className='collapsed-hidden text-t-primary'>
                {t('settings.theme')} · {theme === 'dark' ? t('settings.darkMode') : t('settings.lightMode')}
              </span>
            </div>
          </Tooltip>
        )}
        <Tooltip {...siderTooltipProps} content={isSettings ? t('common.back') : t('common.settings')} position='right'>
          <div
            onClick={onSettingsClick}
            className={classNames(
              'flex items-center justify-start gap-10px px-12px py-8px rd-0.5rem cursor-pointer transition-colors',
              isMobile && 'sider-footer-btn-mobile',
              {
                'bg-[rgba(var(--primary-6),0.12)] text-primary': isSettings,
                'hover:bg-hover hover:shadow-sm active:bg-fill-2': !isSettings,
              }
            )}
          >
            {isSettings ? (
              <ArrowCircleLeft className='flex' theme='outline' size='24' fill={iconColors.primary} />
            ) : (
              <SettingTwo className='flex' theme='outline' size='24' fill={iconColors.primary} />
            )}
            <span className='collapsed-hidden text-t-primary'>
              {isSettings ? t('common.back') : t('common.settings')}
            </span>
          </div>
        </Tooltip>
      </div>
    </div>
  );
};

export default SiderFooter;
