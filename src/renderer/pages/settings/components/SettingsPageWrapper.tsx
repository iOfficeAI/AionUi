import classNames from 'classnames';
import React, { useEffect, useMemo, useState } from 'react';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { SettingsViewModeProvider } from '@/renderer/components/settings/SettingsModal/settingsViewContext';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import {
  buildBuiltinSettingsNavItems,
  buildSettingsNavItems,
  isSettingsRouteActive,
} from './SettingsSider/settingsNavigation';
import './settings.css';

interface SettingsPageWrapperProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export const isSettingsNavItemActive = isSettingsRouteActive;

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

export const getBuiltinSettingsNavItems = (isDesktop: boolean, t: TranslateFn) =>
  buildBuiltinSettingsNavItems({ isDesktop, t: t as never });

const SettingsPageWrapper: React.FC<SettingsPageWrapperProps> = ({ children, className, contentClassName }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();

  const [extensionTabs, setExtensionTabs] = useState<IExtensionSettingsTab[]>([]);

  useEffect(() => {
    let disposed = false;

    const syncExtensionTabs = async () => {
      try {
        const tabs = (await extensionsIpc.getSettingsTabs.invoke()) ?? [];
        if (!disposed) {
          setExtensionTabs(tabs);
        }
      } catch (err) {
        if (!disposed) {
          console.error('[SettingsPageWrapper] Failed to load extension tabs:', err);
        }
      }
    };

    void syncExtensionTabs();
    const unsubscribe = extensionsIpc.stateChanged.on(() => {
      void syncExtensionTabs();
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const { resolveExtTabName } = useExtI18n();
  const builtinItems = useMemo(() => buildBuiltinSettingsNavItems({ isDesktop, t }), [isDesktop, t]);
  const menuItems = useMemo(
    () =>
      buildSettingsNavItems({
        builtinItems,
        extensionTabs,
        resolveExtTabName,
      }),
    [builtinItems, extensionTabs, resolveExtTabName]
  );

  const containerClass = classNames(
    'settings-page-wrapper w-full min-h-full box-border overflow-y-auto',
    isMobile ? 'px-16px py-14px' : 'px-12px md:px-40px py-32px',
    className
  );

  const contentClass = classNames('settings-page-content mx-auto w-full md:max-w-1024px', contentClassName);

  return (
    <SettingsViewModeProvider value='page'>
      <div className={containerClass}>
        {isMobile && (
          <div className='settings-mobile-top-nav'>
            {menuItems.map((item) => {
              const active = isSettingsRouteActive(pathname, item.path);
              return (
                <button
                  key={item.path}
                  type='button'
                  className={classNames('settings-mobile-top-nav__item', {
                    'settings-mobile-top-nav__item--active': active,
                  })}
                  onClick={() => {
                    void navigate(`/settings/${item.path}`, { replace: true });
                  }}
                >
                  <span className='settings-mobile-top-nav__icon'>
                    {item.iconUrl ? (
                      <img src={item.iconUrl} alt='' className='w-16px h-16px object-contain' />
                    ) : item.iconComponent ? (
                      React.createElement(item.iconComponent, {
                        theme: 'outline',
                        size: '16',
                      })
                    ) : null}
                  </span>
                  <span className='settings-mobile-top-nav__label'>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className={contentClass}>{children}</div>
      </div>
    </SettingsViewModeProvider>
  );
};

export default SettingsPageWrapper;
