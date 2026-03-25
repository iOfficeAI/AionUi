import { ArrowCircleLeft, ListCheckbox, Plus, SettingTwo } from '@icon-park/react';
import { IconMoonFill, IconSunFill } from '@arco-design/web-react/icon';
import classNames from 'classnames';
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { iconColors } from '@renderer/styles/colors';
import { Tooltip } from '@arco-design/web-react';
import { usePreviewContext } from '@renderer/pages/conversation/Preview/context/PreviewContext';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import { blurActiveElement } from '@renderer/utils/ui/focus';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext';
import ConversationSearchPopover from '@renderer/pages/conversation/GroupedHistory/ConversationSearchPopover';

const WorkspaceGroupedHistory = React.lazy(() => import('@renderer/pages/conversation/GroupedHistory'));
const SettingsSider = React.lazy(() => import('@renderer/pages/settings/components/SettingsSider'));

interface SiderProps {
  onSessionClick?: () => void;
  collapsed?: boolean;
}

const Sider: React.FC<SiderProps> = ({ onSessionClick, collapsed = false }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const location = useLocation();
  const { pathname, search, hash } = location;

  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closePreview } = usePreviewContext();
  const { theme, setTheme } = useThemeContext();
  const [isBatchMode, setIsBatchMode] = useState(false);
  const isSettings = pathname.startsWith('/settings');
  const lastNonSettingsPathRef = useRef('/guid');

  useEffect(() => {
    if (!pathname.startsWith('/settings')) {
      lastNonSettingsPathRef.current = `${pathname}${search}${hash}`;
    }
  }, [pathname, search, hash]);

  const handleSettingsClick = () => {
    cleanupSiderTooltips();
    blurActiveElement();
    if (isSettings) {
      const target = lastNonSettingsPathRef.current || '/guid';
      Promise.resolve(navigate(target)).catch((error) => {
        console.error('Navigation failed:', error);
      });
    } else {
      Promise.resolve(navigate('/settings/gemini')).catch((error) => {
        console.error('Navigation failed:', error);
      });
    }
    if (onSessionClick) {
      onSessionClick();
    }
  };

  const handleToggleBatchMode = () => {
    setIsBatchMode((prev) => !prev);
  };
  const handleConversationSelect = () => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
    setIsBatchMode(false);
  };
  const handleQuickThemeToggle = () => {
    void setTheme(theme === 'dark' ? 'light' : 'dark');
  };
  const workspaceHistoryProps = {
    collapsed,
    tooltipEnabled: collapsed && !isMobile,
    onSessionClick,
    batchMode: isBatchMode,
    onBatchModeChange: setIsBatchMode,
  };
  const tooltipEnabled = collapsed && !isMobile;
  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);

  return (
    <div className='size-full flex flex-col'>
      {/* Main content area */}
      <div className='flex-1 min-h-0 overflow-hidden'>
        {isSettings ? (
          <Suspense fallback={<div className='size-full' />}>
            <SettingsSider collapsed={collapsed} tooltipEnabled={tooltipEnabled}></SettingsSider>
          </Suspense>
        ) : (
          <div className='size-full flex flex-col'>
            <div className='mb-8px shrink-0 flex items-center gap-8px'>
              <Tooltip {...siderTooltipProps} content={t('conversation.welcome.newConversation')} position='right'>
                <div
                  className={classNames(
                    'h-40px flex-1 flex items-center justify-start gap-10px px-12px hover:bg-hover rd-0.5rem cursor-pointer group',
                    isMobile && 'sider-action-btn-mobile'
                  )}
                  onClick={() => {
                    cleanupSiderTooltips();
                    blurActiveElement();
                    closePreview();
                    setIsBatchMode(false);
                    Promise.resolve(navigate('/guid')).catch((error) => {
                      console.error('Navigation failed:', error);
                    });
                    // 点击new chat后自动隐藏sidebar / Hide sidebar after starting new chat on mobile
                    if (onSessionClick) {
                      onSessionClick();
                    }
                  }}
                >
                  <Plus
                    theme='outline'
                    size='24'
                    fill={iconColors.primary}
                    className='block leading-none shrink-0'
                    style={{ lineHeight: 0 }}
                  />
                  <span className='collapsed-hidden font-bold text-t-primary leading-24px'>
                    {t('conversation.welcome.newConversation')}
                  </span>
                </div>
              </Tooltip>
              <Tooltip {...siderTooltipProps} content={t('conversation.historySearch.tooltip')} position='right'>
                <div>
                  <ConversationSearchPopover
                    onSessionClick={onSessionClick}
                    onConversationSelect={handleConversationSelect}
                    buttonClassName={classNames(isMobile && 'sider-action-icon-btn-mobile')}
                  />
                </div>
              </Tooltip>
              <Tooltip
                {...siderTooltipProps}
                content={isBatchMode ? t('conversation.history.batchModeExit') : t('conversation.history.batchManage')}
                position='right'
              >
                <div
                  className={classNames(
                    'h-40px w-40px rd-0.5rem flex items-center justify-center cursor-pointer shrink-0 transition-all border border-solid border-transparent',
                    isMobile && 'sider-action-icon-btn-mobile',
                    {
                      'hover:bg-fill-2 hover:border-[var(--color-border-2)]': !isBatchMode,
                      'bg-[rgba(var(--primary-6),0.12)] border-[rgba(var(--primary-6),0.24)] text-primary': isBatchMode,
                    }
                  )}
                  onClick={handleToggleBatchMode}
                >
                  <ListCheckbox
                    theme='outline'
                    size='20'
                    className='block leading-none shrink-0'
                    style={{ lineHeight: 0 }}
                  />
                </div>
              </Tooltip>
            </div>
            <Suspense fallback={<div className='flex-1 min-h-0' />}>
              <WorkspaceGroupedHistory {...workspaceHistoryProps}></WorkspaceGroupedHistory>
            </Suspense>
          </div>
        )}
      </div>
      {/* Footer - settings button */}
      <div className='shrink-0 sider-footer mt-auto pt-8px'>
        <div className='flex flex-col gap-8px'>
          {isSettings && (
            <Tooltip
              {...siderTooltipProps}
              content={theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}
              position='right'
            >
              <div
                onClick={handleQuickThemeToggle}
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
          <Tooltip
            {...siderTooltipProps}
            content={isSettings ? t('common.back') : t('common.settings')}
            position='right'
          >
            <div
              onClick={handleSettingsClick}
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
    </div>
  );
};

export default Sider;
