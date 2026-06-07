/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button, Dropdown, Form, Input, Menu, Message, Tooltip } from '@arco-design/web-react';
import {
  ArrowCircleLeft,
  CloseOne,
  Earth,
  Help,
  Info,
  Moon,
  Peoples,
  Right,
  SettingTwo,
  SunOne,
  Tips,
} from '@icon-park/react';
import classNames from 'classnames';
import { useNavigate } from 'react-router-dom';
import type { NewApiAccountStatus } from '@/common/types/newApiAccount';
import { useFeedback } from '@/renderer/hooks/context/FeedbackContext';
import { changeLanguage } from '@/renderer/services/i18n';
import { useNewApiAccount } from '@renderer/hooks/context/NewApiAccountContext';
import { iconColors } from '@renderer/styles/colors';
import { isElectronDesktop, openExternalUrl } from '@renderer/utils/platform';
import { useDealerConfig } from '@/renderer/hooks/useDealerConfig';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

interface SiderFooterProps {
  isMobile: boolean;
  isSettings: boolean;
  collapsed?: boolean;
  theme: string;
  siderTooltipProps: SiderTooltipProps;
  onSettingsClick: () => void;
  onThemeToggle: () => void;
  showLogout?: boolean;
  onLogoutClick?: () => void;
  showDesktopAccount?: boolean;
  desktopAccountLoggedIn?: boolean;
  desktopAccountStatus?: NewApiAccountStatus;
  onDesktopHelpCenterClick?: () => void;
  onDesktopLogoutClick?: () => void;
  onAccountPanelOpen?: () => void;
}

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  isSettings,
  collapsed = false,
  theme,
  siderTooltipProps,
  onSettingsClick,
  onThemeToggle,
  showLogout = false,
  onLogoutClick,
  showDesktopAccount = false,
  desktopAccountLoggedIn = false,
  desktopAccountStatus,
  onDesktopHelpCenterClick,
  onDesktopLogoutClick,
  onAccountPanelOpen,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useNewApiAccount();
  const { openFeedback } = useFeedback();
  const { openRegisterUrl } = useDealerConfig();
  const [loginLoading, setLoginLoading] = useState(false);
  const [accountPopupVisible, setAccountPopupVisible] = useState(false);
  const [loginForm] = Form.useForm<{ username: string; password: string }>();
  const accountPopupRef = useRef<HTMLDivElement | null>(null);
  const accountTriggerRef = useRef<HTMLDivElement | null>(null);

  const isDesktopAccountMode = showDesktopAccount && isElectronDesktop();
  const settingsIcon = isSettings ? (
    <ArrowCircleLeft
      theme='outline'
      size='20'
      fill={iconColors.primary}
      className='block leading-none'
      style={{ lineHeight: 0 }}
    />
  ) : (
    <SettingTwo
      theme='outline'
      size='20'
      fill={iconColors.primary}
      className='block leading-none'
      style={{ lineHeight: 0 }}
    />
  );
  const showThemeToggle = isSettings && !collapsed && !isDesktopAccountMode;
  const themeTooltip = theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode');
  const accountUsername =
    desktopAccountStatus?.user?.displayName ||
    desktopAccountStatus?.user?.username ||
    t('settings.newApiDefaultUserName');
  const QUOTA_PER_RMB = 73259; // 1 RMB = 73529 quota units
  const formatQuota = (n: number): string => {
    const rmb = n / QUOTA_PER_RMB;
    if (rmb >= 1_000_000) return `¥${(rmb / 10_000).toFixed(0)}万`;
    if (rmb >= 10_000) return `¥${(rmb / 10_000).toFixed(1)}万`;
    if (rmb >= 1_000) return `¥${rmb.toFixed(0)}`;
    return `¥${rmb.toFixed(2)}`;
  };
  const isUnlimited = desktopAccountStatus?.user?.unlimitedQuota === true;
  const remainQuota = desktopAccountStatus?.user?.quota ?? 0;
  // quota IS the remaining balance (not total)
  const remainPercent = isUnlimited ? 100 : remainQuota > 0 ? 100 : 0;
  const [accountPanelStyle, setAccountPanelStyle] = useState<React.CSSProperties>({
    left: 8,
    bottom: 56,
  });

  const updateAccountPanelPosition = useCallback(() => {
    const triggerRect = accountTriggerRef.current?.getBoundingClientRect();
    if (!triggerRect) return;

    const panelWidth = 336;
    const viewportPadding = 8;
    const left = Math.min(
      Math.max(viewportPadding, triggerRect.left),
      Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding)
    );

    setAccountPanelStyle({
      left,
      bottom: Math.max(viewportPadding, window.innerHeight - triggerRect.top + 12),
    });
  }, []);

  useEffect(() => {
    if (!accountPopupVisible) return;

    updateAccountPanelPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (accountPopupRef.current?.contains(target)) return;
      if ((target as HTMLElement | null)?.closest?.('[data-testid="desktop-account-trigger"]')) return;
      setAccountPopupVisible(false);
    };

    const handleViewportChange = () => {
      updateAccountPanelPosition();
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [accountPopupVisible, updateAccountPanelPosition]);

  const closeAccountPopup = () => {
    setAccountPopupVisible(false);
  };

  const handleDesktopLogin = async () => {
    try {
      const values = await loginForm.validate();
      setLoginLoading(true);
      const result = await login(values);
      if (!result.success) {
        Message.error(result.msg || t('login.errors.unknown'));
        return;
      }
      Message.success(t('settings.newApiLoginSuccess'));
      loginForm.resetFields();
      closeAccountPopup();
    } finally {
      setLoginLoading(false);
    }
  };

  const handleMenuNavigate = (path: string) => {
    closeAccountPopup();
    void navigate(path);
  };

  const languageMenu = (
    <Menu
      onClickMenuItem={(key) => {
        void changeLanguage(String(key));
      }}
    >
      {[
        ['zh-CN', '简体中文'],
        ['en-US', 'English'],
        ['ja-JP', '日本語'],
        ['zh-TW', '繁體中文'],
        ['ko-KR', '한국어'],
      ].map(([value, label]) => (
        <Menu.Item key={value}>{label}</Menu.Item>
      ))}
    </Menu>
  );

  const footerEntryClass = classNames(
    'h-40px flex items-center rd-0.5rem cursor-pointer transition-colors hover:bg-[rgba(var(--primary-6),0.14)] active:bg-fill-2',
    collapsed ? 'w-full justify-center' : 'w-full min-w-0 justify-start gap-8px px-10px',
    isMobile && 'sider-footer-btn-mobile'
  );

  const renderDesktopMenuRow = ({
    icon,
    label,
    danger = false,
    onClick,
    withArrow = true,
  }: {
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
    onClick?: () => void;
    withArrow?: boolean;
  }) => (
    <div
      className={classNames(
        'h-48px px-16px flex items-center justify-between cursor-pointer',
        danger ? 'hover:bg-[rgba(var(--danger-6),0.08)]' : 'hover:bg-fill-2'
      )}
      onClick={onClick}
    >
      <div className='flex items-center gap-10px'>
        {icon}
        <span className='text-15px text-t-primary'>{label}</span>
      </div>
      {withArrow && <Right theme='outline' size='18' fill={iconColors.secondary} />}
    </div>
  );

  const desktopSettingsRow = renderDesktopMenuRow({
    icon: isSettings ? (
      <ArrowCircleLeft theme='outline' size='20' fill={iconColors.primary} />
    ) : (
      <SettingTwo theme='outline' size='20' fill={iconColors.primary} />
    ),
    label: isSettings ? t('common.back') : t('common.settings'),
    onClick: () => {
      closeAccountPopup();
      onSettingsClick();
    },
  });

  const desktopAccountPanel = desktopAccountLoggedIn ? (
    <div className='w-336px rd-16px shadow-[0_18px_48px_rgba(0,0,0,0.22)] overflow-hidden border border-[var(--color-border-2)] bg-[var(--color-bg-1)]'>
      <div className='flex justify-center pt-10px pb-2px'>
        <div className='h-4px w-36px rd-full bg-fill-3' />
      </div>
      <div className='px-16px py-14px border-b border-[var(--color-border-2)]'>
        <div className='flex items-center justify-between mb-10px'>
          <span className='text-16px font-bold text-t-primary'>
            {isUnlimited
              ? t('settings.newApiQuotaUnlimited')
              : `${t('settings.newApiQuotaTitle')} ${formatQuota(remainQuota)}`}
          </span>
          <Button
            size='mini'
            type='primary'
            onClick={() => {
              void openExternalUrl('https://api.mxou.cn/console/topup');
            }}
          >
            {t('settings.newApiUpgrade')}
          </Button>
        </div>
        <div className='h-8px rd-999px bg-fill-2 overflow-hidden'>
          <div className='h-full bg-[rgb(var(--primary-6))]' style={{ width: `${remainPercent}%` }} />
        </div>
        <div className='mt-8px text-14px text-t-secondary'>
          {isUnlimited
            ? t('settings.newApiQuotaUnlimitedDesc')
            : `${t('settings.newApiQuotaSummary')} ${formatQuota(remainQuota)}`}
        </div>
      </div>
      <div className='py-4px'>
        <div data-testid='desktop-account-settings-trigger'>{desktopSettingsRow}</div>
        <Dropdown droplist={languageMenu} trigger='click' position='br'>
          {renderDesktopMenuRow({
            icon: <Earth theme='outline' size='20' fill={iconColors.primary} />,
            label: t('settings.language'),
          })}
        </Dropdown>
        {renderDesktopMenuRow({
          icon: <Help theme='outline' size='20' fill={iconColors.primary} />,
          label: t('settings.helpCenter'),
          onClick: () => {
            closeAccountPopup();
            onDesktopHelpCenterClick?.();
          },
        })}
        {renderDesktopMenuRow({
          icon: <Info theme='outline' size='20' fill={iconColors.primary} />,
          label: t('settings.about'),
          onClick: () => handleMenuNavigate('/settings/about'),
        })}
        {renderDesktopMenuRow({
          icon: <CloseOne theme='outline' size='20' fill='rgb(var(--danger-6))' />,
          label: t('settings.newApiLogout'),
          danger: true,
          withArrow: false,
          onClick: () => {
            closeAccountPopup();
            void onDesktopLogoutClick?.();
          },
        })}
      </div>
    </div>
  ) : (
    <div className='w-336px rd-16px shadow-[0_18px_48px_rgba(0,0,0,0.22)] overflow-hidden border border-[var(--color-border-2)] bg-[var(--color-bg-1)]'>
      <div className='flex justify-center pt-10px pb-2px'>
        <div className='h-4px w-36px rd-full bg-fill-3' />
      </div>
      <div className='p-16px'>
        <div className='text-16px font-bold text-t-primary mb-12px'>{t('settings.newApiLogin')}</div>
        <div className='text-14px text-t-secondary mb-12px'>{t('settings.newApiDesktopGateHint')}</div>
        <Form form={loginForm} layout='vertical'>
          <Form.Item field='username' label={t('login.username')} rules={[{ required: true }]}>
            <Input placeholder={t('login.usernamePlaceholder')} />
          </Form.Item>
          <Form.Item field='password' label={t('login.password')} rules={[{ required: true }]}>
            <Input.Password placeholder={t('login.passwordPlaceholder')} />
          </Form.Item>
        </Form>
        <div className='flex gap-8px'>
          <Button type='primary' long loading={loginLoading} onClick={handleDesktopLogin}>
            {t('settings.newApiLogin')}
          </Button>
          <Button
            type='secondary'
            onClick={() => {
              void openRegisterUrl();
            }}
          >
            {t('settings.newApiRegister')}
          </Button>
        </div>
      </div>
    </div>
  );

  const desktopAccountPanelNode =
    isDesktopAccountMode && accountPopupVisible && !collapsed && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={accountPopupRef}
            className='fixed z-40'
            style={accountPanelStyle}
            data-testid='desktop-account-panel-anchor'
          >
            <div data-testid='desktop-account-panel'>{desktopAccountPanel}</div>
          </div>,
          document.body
        )
      : null;

  const desktopAccountTriggerLabel = desktopAccountLoggedIn ? accountUsername : t('settings.newApiLogin');

  return (
    <>
      {desktopAccountPanelNode}
      <div className='shrink-0 sider-footer mt-auto pt-4px pb-8px'>
        <div className='flex flex-col gap-2px relative'>
          <Tooltip {...siderTooltipProps} content={t('settings.bugReport')} position='right'>
            <div
              onClick={() => {
                void openFeedback({ autoScreenshot: true });
              }}
              className={footerEntryClass}
              data-testid='bug-report-trigger'
            >
              <span className='w-28px h-24px flex items-center justify-center shrink-0'>
                <Tips
                  theme='outline'
                  size='18'
                  fill={iconColors.primary}
                  className='block leading-none'
                  style={{ lineHeight: 0 }}
                />
              </span>
              <span className='collapsed-hidden text-t-primary text-14px font-medium leading-24px truncate'>
                {t('settings.bugReport')}
              </span>
            </div>
          </Tooltip>
          {(!isDesktopAccountMode || isSettings) && (
            <Tooltip
              {...siderTooltipProps}
              content={isSettings ? t('common.back') : t('common.settings')}
              position='right'
            >
              <div
                onClick={onSettingsClick}
                className={classNames(
                  'h-40px flex items-center rd-0.5rem cursor-pointer transition-colors',
                  collapsed ? 'w-full justify-center' : 'w-full min-w-0 justify-start gap-8px px-10px',
                  isMobile && 'sider-footer-btn-mobile',
                  {
                    'bg-[rgba(var(--primary-6),0.12)] text-primary': isSettings,
                    'hover:bg-[rgba(var(--primary-6),0.14)] active:bg-fill-2': !isSettings,
                  }
                )}
                data-testid='settings-trigger'
              >
                <span className='w-28px h-24px flex items-center justify-center shrink-0'>{settingsIcon}</span>
                <span className='collapsed-hidden text-t-primary text-14px font-medium leading-24px truncate'>
                  {isSettings ? t('common.back') : t('common.settings')}
                </span>
              </div>
            </Tooltip>
          )}
          {isDesktopAccountMode && (
            <div className={classNames('flex items-center gap-6px', collapsed && 'flex-col gap-2px')}>
              <Tooltip {...siderTooltipProps} content={desktopAccountTriggerLabel} position='right'>
                <div
                  ref={accountTriggerRef}
                  className={classNames(footerEntryClass, !collapsed && 'flex-1', {
                    'bg-[rgba(var(--primary-6),0.12)] text-primary': accountPopupVisible,
                  })}
                  data-testid='desktop-account-trigger'
                  onClick={() => {
                    const opening = !accountPopupVisible;
                    setAccountPopupVisible(opening);
                    if (opening) onAccountPanelOpen?.();
                  }}
                >
                  <span className='w-28px h-24px flex items-center justify-center shrink-0'>
                    <Peoples
                      theme='outline'
                      size='20'
                      fill={iconColors.primary}
                      className='block leading-none'
                      style={{ lineHeight: 0 }}
                    />
                  </span>
                  <span className='collapsed-hidden text-t-primary text-14px font-medium leading-24px truncate'>
                    {desktopAccountTriggerLabel}
                  </span>
                </div>
              </Tooltip>
              <Tooltip {...siderTooltipProps} content={themeTooltip} position='right'>
                <div
                  onClick={onThemeToggle}
                  className={classNames(
                    'h-40px shrink-0 flex items-center justify-center cursor-pointer rd-0.5rem transition-colors text-t-secondary hover:bg-fill-2 hover:text-t-primary active:bg-fill-3',
                    collapsed ? 'w-full' : 'w-40px',
                    isMobile && 'sider-footer-btn-mobile'
                  )}
                  aria-label={themeTooltip}
                  data-testid='desktop-theme-toggle'
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
            </div>
          )}
          {showLogout && onLogoutClick && !isDesktopAccountMode && (
            <Tooltip {...siderTooltipProps} content={t('settings.googleLogout')} position='right'>
              <div onClick={onLogoutClick} className={footerEntryClass}>
                <span className='w-28px h-24px flex items-center justify-center shrink-0'>
                  <CloseOne
                    theme='outline'
                    size='18'
                    fill={iconColors.primary}
                    className='block leading-none'
                    style={{ lineHeight: 0 }}
                  />
                </span>
                <span className='collapsed-hidden text-t-primary text-14px font-medium leading-24px truncate'>
                  {t('settings.googleLogout')}
                </span>
              </div>
            </Tooltip>
          )}
          {showThemeToggle && (
            <Tooltip {...siderTooltipProps} content={themeTooltip} position='right'>
              <div
                onClick={onThemeToggle}
                className={classNames(
                  'h-40px w-40px shrink-0 flex items-center justify-center cursor-pointer rd-0.5rem transition-colors text-t-secondary hover:bg-fill-2 hover:text-t-primary active:bg-fill-3',
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
    </>
  );
};

export default SiderFooter;
