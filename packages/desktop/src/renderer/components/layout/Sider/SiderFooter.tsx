/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Popover, Tooltip } from '@arco-design/web-react';
import { ArrowCircleLeft, CloseOne, Earth, Moon, SettingTwo, SunOne } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import type { AuthUser } from '@renderer/hooks/context/AuthContext';
import siderBrandIcon from '@renderer/assets/logos/brand/sider-brand.png';

interface SiderFooterProps {
  isMobile: boolean;
  isSettings: boolean;
  collapsed?: boolean;
  theme: string;
  siderTooltipProps: SiderTooltipProps;
  onSettingsClick: () => void;
  onWebuiClick?: () => void;
  onThemeToggle: () => void;
  showAccount?: boolean;
  user?: AuthUser | null;
  onLogoutClick?: () => void;
}

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  isSettings,
  collapsed = false,
  theme,
  siderTooltipProps,
  onSettingsClick,
  onWebuiClick,
  onThemeToggle,
  showAccount = false,
  user,
  onLogoutClick,
}) => {
  const { t } = useTranslation();
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const displayName = user?.realname?.trim() || user?.username?.trim() || t('login.brand');
  const displayAvatar = user?.avatar && !avatarFailed ? user.avatar : siderBrandIcon;

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.avatar]);

  const handleSettingsClick = () => {
    setAccountMenuVisible(false);
    onSettingsClick();
  };

  const handleLogoutClick = () => {
    setAccountMenuVisible(false);
    onLogoutClick?.();
  };

  const handleWebuiClick = () => {
    setAccountMenuVisible(false);
    onWebuiClick?.();
  };

  const settingsIcon = isSettings ? (
    <ArrowCircleLeft
      theme='outline'
      size='16'
      fill='currentColor'
      className='block leading-none'
      style={{ lineHeight: 0 }}
    />
  ) : (
    <SettingTwo
      theme='outline'
      size='16'
      fill='currentColor'
      className='block leading-none'
      style={{ lineHeight: 0 }}
    />
  );
  const showThemeToggle = isSettings && !collapsed;
  const themeTooltip = theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode');
  const accountMenu = (
    <div className='w-220px' data-testid='sider-account-menu'>
      <div className='h-42px flex items-center gap-10px px-6px'>
        <img
          src={displayAvatar}
          alt=''
          aria-hidden='true'
          draggable={false}
          className='size-24px shrink-0 rd-full object-cover select-none'
          onError={() => setAvatarFailed(true)}
        />
        <span className='min-w-0 flex-1 truncate text-14px font-[500] text-t-primary'>{displayName}</span>
      </div>
      <div className='my-6px h-1px bg-[var(--color-border-2)]' />
      {onWebuiClick && (
        <Button
          type='text'
          data-testid='sider-account-webui'
          className='!h-36px !w-full !justify-start !px-8px !text-t-primary !rd-0.5rem hover:!bg-fill-3'
          onClick={handleWebuiClick}
        >
          <span className='flex items-center gap-10px'>
            <Earth theme='outline' size='16' fill='currentColor' />
            <span>{t('settings.webui.enable')}</span>
          </span>
        </Button>
      )}
      <Button
        type='text'
        data-testid='sider-account-settings'
        className={classNames(
          '!h-36px !w-full !justify-start !px-8px !text-t-primary !rd-0.5rem',
          isSettings ? '!bg-fill-3' : 'hover:!bg-fill-3'
        )}
        onClick={handleSettingsClick}
      >
        <span className='flex items-center gap-10px'>
          <SettingTwo theme='outline' size='16' fill='currentColor' />
          <span>{t('common.settings')}</span>
        </span>
      </Button>
      {onLogoutClick && (
        <Button
          type='text'
          data-testid='sider-account-logout'
          className='!h-36px !w-full !justify-start !px-8px !text-t-primary !rd-0.5rem hover:!bg-fill-3'
          onClick={handleLogoutClick}
        >
          <span className='flex items-center gap-10px'>
            <CloseOne theme='outline' size='16' fill='currentColor' />
            <span>{t('settings.googleLogout')}</span>
          </span>
        </Button>
      )}
    </div>
  );

  return (
    <div className='shrink-0 sider-footer mt-auto pt-8px pb-8px border-t border-solid border-[var(--color-border-2)] border-l-0 border-r-0 border-b-0'>
      <div className={classNames('flex', collapsed ? 'flex-col gap-2px' : 'items-center gap-2px')}>
        {showAccount ? (
          <Popover
            trigger='click'
            position={collapsed ? 'right' : 'tr'}
            className='!rd-12px !overflow-hidden'
            popupVisible={accountMenuVisible}
            onVisibleChange={setAccountMenuVisible}
            content={accountMenu}
            triggerProps={{ showArrow: false }}
            unmountOnExit
          >
            <Button
              type='text'
              data-testid='sider-account-trigger'
              aria-label={displayName}
              className={classNames(
                '!h-34px !min-w-0 !border-none !text-t-primary !rd-0.5rem hover:!bg-fill-3 active:!bg-fill-4',
                collapsed ? '!w-full !px-0' : '!flex-1 !justify-start !px-10px'
              )}
            >
              <span className='flex min-w-0 items-center gap-8px'>
                <img
                  src={displayAvatar}
                  alt=''
                  aria-hidden='true'
                  draggable={false}
                  className='size-22px shrink-0 rd-full object-cover select-none'
                  onError={() => setAvatarFailed(true)}
                />
                <span className='collapsed-hidden truncate text-14px font-[500]'>{displayName}</span>
              </span>
            </Button>
          </Popover>
        ) : (
          <Tooltip
            {...siderTooltipProps}
            content={isSettings ? t('common.back') : t('common.settings')}
            position='right'
          >
            <Button
              type='text'
              onClick={onSettingsClick}
              aria-label={isSettings ? t('common.back') : t('common.settings')}
              className={classNames(
                '!h-34px !min-w-0 !rd-0.5rem !text-t-primary',
                collapsed ? '!w-full !px-0' : '!flex-1 !justify-start !px-10px',
                isSettings ? '!bg-fill-3' : 'hover:!bg-fill-3 active:!bg-fill-4'
              )}
            >
              <span className='flex min-w-0 items-center gap-8px'>
                <span className='size-22px flex items-center justify-center shrink-0 text-t-secondary'>
                  {settingsIcon}
                </span>
                <span className='collapsed-hidden truncate text-14px font-[500]'>
                  {isSettings ? t('common.back') : t('common.settings')}
                </span>
              </span>
            </Button>
          </Tooltip>
        )}
        {/* Theme toggle — lightweight icon button, only while inside Settings page (not in collapsed mode) */}
        {showThemeToggle && (
          <Tooltip {...siderTooltipProps} content={themeTooltip} position='right'>
            <div
              onClick={onThemeToggle}
              className={classNames(
                'h-32px w-40px shrink-0 flex items-center justify-center cursor-pointer rd-0.5rem transition-colors text-t-secondary hover:bg-fill-2 hover:text-t-primary active:bg-fill-3',
                isMobile && 'sider-footer-btn-mobile'
              )}
              aria-label={themeTooltip}
            >
              <span className='w-28px h-28px flex items-center justify-center shrink-0'>
                {theme === 'dark' ? (
                  <SunOne theme='outline' size='18' fill='currentColor' className='block leading-none' />
                ) : (
                  <Moon theme='outline' size='18' fill='currentColor' className='block leading-none' />
                )}
              </span>
            </div>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default SiderFooter;
