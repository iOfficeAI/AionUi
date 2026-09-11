/**
 * @license
 * Copyright 2025 AIbang (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Popover, Tooltip } from '@arco-design/web-react';
import { SettingTwo } from '@icon-park/react';
import classNames from 'classnames';
import { openExternalUrl } from '@/renderer/utils/platform';
import { quotaToCredits } from '@/renderer/utils/common';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import siderStyles from './Sider.module.css';
import WeixinConnectButton from './WeixinConnectButton';

interface SiderFooterProps {
  isMobile: boolean;
  isSettings: boolean;
  collapsed?: boolean;
  siderTooltipProps: SiderTooltipProps;
  onSettingsClick: () => void;
  showLogout?: boolean;
  onLogoutClick?: () => void;
  onCreditsClick?: () => void;
  accountUsername?: string;
  accountQuota?: number;
}

const getAccountInitials = (username: string): string => {
  const words = username.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return username.trim().slice(0, 2).toUpperCase();
};

declare const __APP_VERSION__: string;

const AccountIcon: React.FC<{ children: React.ReactNode; className?: string; filled?: boolean }> = ({
  children,
  className,
  filled = false,
}) => (
  <svg
    aria-hidden='true'
    viewBox='0 0 24 24'
    fill={filled ? 'currentColor' : 'none'}
    stroke={filled ? 'none' : 'currentColor'}
    strokeWidth={1.8}
    strokeLinecap='round'
    strokeLinejoin='round'
    className={className}
  >
    {children}
  </svg>
);

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  isSettings,
  collapsed = false,
  siderTooltipProps,
  onSettingsClick,
  showLogout = false,
  onLogoutClick,
  onCreditsClick,
  accountUsername,
  accountQuota,
}) => {
  const { t } = useTranslation();
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false);

  const hasAccount = showLogout && Boolean(onLogoutClick && accountUsername);
  const settingsLabel = isSettings ? t('common.back') : t('common.settings');
  const accountInitials = getAccountInitials(accountUsername ?? '');

  const closeAccountMenuAnd = (action: () => void) => () => {
    setAccountMenuOpen(false);
    action();
  };

  const accountMenu = (
    <div className={siderStyles.accountPopoverContent} role='menu' data-testid='account-popover-content'>
      <div className={siderStyles.profileHeader}>
        <div className={siderStyles.profileIdentity}>
          <span className={siderStyles.profileAvatar}>{accountInitials}</span>
          <span className={siderStyles.profileName}>{accountUsername}</span>
        </div>
        <Button
          type='text'
          className={siderStyles.creditsButton}
          title={t('settings.accountCredits')}
          onClick={closeAccountMenuAnd(() => onCreditsClick?.())}
        >
          <span className={siderStyles.creditsLabel}>
            <AccountIcon filled className={siderStyles.lightningIcon}>
              <path d='M13 2L3 14h9l-1 8 10-12h-9l1-8z' />
            </AccountIcon>
            {t('settings.accountCredits')}
          </span>
          <span className={siderStyles.creditsValue}>
            {new Intl.NumberFormat().format(quotaToCredits(accountQuota ?? 0))}
            <AccountIcon className={siderStyles.chevronIcon}>
              <polyline points='9 18 15 12 9 6' />
            </AccountIcon>
          </span>
        </Button>
      </div>

      <ul className={siderStyles.accountMenuList}>
        <li>
          <Button type='text' className={siderStyles.accountMenuItem} onClick={closeAccountMenuAnd(onSettingsClick)}>
            <span className={siderStyles.menuLabel}>
              <AccountIcon className={siderStyles.menuIcon}>
                <circle cx='12' cy='12' r='3' />
                <path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' />
              </AccountIcon>
              {settingsLabel}
            </span>
          </Button>
        </li>
        <li>
          <Button
            type='text'
            className={siderStyles.accountMenuItem}
            onClick={closeAccountMenuAnd(() => {
              window.dispatchEvent(new CustomEvent('aibang-open-update-modal', { detail: { source: 'account-menu' } }));
            })}
          >
            <span className={siderStyles.menuLabel}>
              <AccountIcon className={siderStyles.menuIcon}>
                <path d='M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67' />
              </AccountIcon>
              {t('settings.checkForUpdates')}
            </span>
            <span className={siderStyles.versionMeta}>v{__APP_VERSION__}</span>
          </Button>
        </li>
        <li>
          <Button
            type='text'
            className={siderStyles.accountMenuItem}
            onClick={closeAccountMenuAnd(() => {
              void openExternalUrl('https://x.com/WailiVery').catch((error) => {
                console.error('Failed to open developer link:', error);
              });
            })}
          >
            <span className={siderStyles.menuLabel}>
              <AccountIcon className={siderStyles.menuIcon}>
                <path d='M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' />
              </AccountIcon>
              {t('settings.contactDeveloper')}
            </span>
          </Button>
        </li>
        <li className={siderStyles.menuDivider} />
        <li>
          <Button
            type='text'
            className={siderStyles.logoutButton}
            onClick={closeAccountMenuAnd(() => onLogoutClick?.())}
          >
            <AccountIcon className={siderStyles.logoutIcon}>
              <path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' />
              <polyline points='16 17 21 12 16 7' />
              <line x1='21' x2='9' y1='12' y2='12' />
            </AccountIcon>
            {t('settings.googleLogout')}
          </Button>
        </li>
      </ul>
    </div>
  );

  return (
    <div className={classNames('sider-footer', siderStyles.accountFooter, 'mt-auto shrink-0')}>
      <div className={classNames('flex', collapsed ? 'flex-col gap-2px' : 'items-center gap-2px')}>
        {!hasAccount && (
          <Tooltip {...siderTooltipProps} content={settingsLabel} position='right'>
            <div
              onClick={onSettingsClick}
              className={classNames(
                'group h-34px flex items-center rd-0.5rem cursor-pointer transition-colors',
                collapsed ? 'w-full justify-center' : 'flex-1 min-w-0 justify-start gap-8px ps-10px pe-8px',
                isMobile && 'sider-footer-btn-mobile',
                {
                  'bg-fill-3': isSettings,
                  'hover:bg-fill-3 active:bg-fill-4': !isSettings,
                }
              )}
            >
              <span className='size-22px flex items-center justify-center shrink-0 text-t-secondary'>
                <SettingTwo
                  theme='outline'
                  size='16'
                  fill='currentColor'
                  className='block leading-none'
                  style={{ lineHeight: 0 }}
                />
              </span>
              <span className='collapsed-hidden text-t-primary text-14px font-[500] leading-24px truncate'>
                {settingsLabel}
              </span>
            </div>
          </Tooltip>
        )}
        {hasAccount && (
          <Popover
            content={accountMenu}
            trigger='click'
            position='tl'
            triggerProps={{ popupAlign: { top: 6 } }}
            unmountOnExit
            popupVisible={accountMenuOpen}
            onVisibleChange={setAccountMenuOpen}
            className={siderStyles.accountPopover}
          >
            <Button
              type='text'
              data-testid='sider-account-menu-trigger'
              aria-haspopup='menu'
              aria-expanded={accountMenuOpen}
              className={classNames(
                siderStyles.accountTrigger,
                'group',
                collapsed ? 'w-full justify-center' : 'w-full min-w-0 justify-between',
                isMobile && 'sider-footer-btn-mobile'
              )}
            >
              <span className={classNames('flex min-w-0 items-center gap-10px text-start', !collapsed && 'flex-1')}>
                <span className={siderStyles.triggerAvatarWrap}>
                  <span className={siderStyles.triggerAvatar}>{accountInitials}</span>
                  <span className={siderStyles.statusDot} />
                </span>
                <span className='collapsed-hidden min-w-0 flex flex-col'>
                  <span className={siderStyles.triggerName}>{accountUsername}</span>
                  <span className={siderStyles.triggerWorkspace}>{t('settings.personalWorkspace')}</span>
                </span>
              </span>
              <span className={classNames('collapsed-hidden', siderStyles.triggerChevronFrame)}>
                <AccountIcon
                  className={classNames(siderStyles.triggerChevron, accountMenuOpen && siderStyles.triggerChevronOpen)}
                >
                  <polyline points='6 9 12 15 18 9' />
                </AccountIcon>
              </span>
            </Button>
          </Popover>
        )}
        {/* WeChat connect — QR-scan entry to chat with AIbang via WeChat */}
        {hasAccount && <WeixinConnectButton collapsed={collapsed} isMobile={isMobile} />}
      </div>
    </div>
  );
};

export default SiderFooter;
