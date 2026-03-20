import classNames from 'classnames';
import React, { useEffect, useState } from 'react';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { SettingsViewModeProvider } from '@/renderer/components/settings/SettingsModal/settingsViewContext';
import { isElectronDesktop, resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import {
  Communication,
  Computer,
  Earth,
  Gemini,
  Info,
  LinkCloud,
  Puzzle,
  Robot,
  System,
  Toolkit,
} from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import './settings.css';

interface SettingsPageWrapperProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

const SettingsPageWrapper: React.FC<SettingsPageWrapperProps> = ({ children, className, contentClassName }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();

  const [extensionTabs, setExtensionTabs] = useState<IExtensionSettingsTab[]>([]);

  useEffect(() => {
    void extensionsIpc.getSettingsTabs
      .invoke()
      .then((tabs) => setExtensionTabs(tabs ?? []))
      .catch((err) => console.error('[SettingsPageWrapper] Failed to load extension tabs:', err));
  }, []);

  const { resolveExtTabName } = useExtI18n();

  type NavItem = { label: string; icon: React.ReactElement; path: string; id: string };

  const menuItems = React.useMemo(() => {
    const builtins: NavItem[] = [
      { id: 'gemini', label: t('settings.gemini'), icon: <Gemini theme='outline' size='16' />, path: 'gemini' },
      { id: 'model', label: t('settings.model'), icon: <LinkCloud theme='outline' size='16' />, path: 'model' },
      {
        id: 'agent',
        label: t('settings.assistants', { defaultValue: 'Assistants' }),
        icon: <Robot theme='outline' size='16' />,
        path: 'agent',
      },
      { id: 'tools', label: t('settings.tools'), icon: <Toolkit theme='outline' size='16' />, path: 'tools' },
      { id: 'display', label: t('settings.display'), icon: <Computer theme='outline' size='16' />, path: 'display' },
      {
        id: 'webui',
        label: t('settings.webui'),
        icon: isDesktop ? <Earth theme='outline' size='16' /> : <Communication theme='outline' size='16' />,
        path: 'webui',
      },
      { id: 'system', label: t('settings.system'), icon: <System theme='outline' size='16' />, path: 'system' },
      { id: 'about', label: t('settings.about'), icon: <Info theme='outline' size='16' />, path: 'about' },
    ];

    // Insert extension tabs before system (unanchored default) or at anchor position
    const result = [...builtins];
    const unanchored: IExtensionSettingsTab[] = [];
    const beforeMap = new Map<string, IExtensionSettingsTab[]>();
    const afterMap = new Map<string, IExtensionSettingsTab[]>();

    for (const tab of extensionTabs) {
      if (!tab.position) {
        unanchored.push(tab);
        continue;
      }
      const map = tab.position.placement === 'before' ? beforeMap : afterMap;
      let list = map.get(tab.position.anchor);
      if (!list) {
        list = [];
        map.set(tab.position.anchor, list);
      }
      list.push(tab);
    }

    const toNavItem = (tab: IExtensionSettingsTab): NavItem => {
      const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
      return {
        id: tab.id,
        label: resolveExtTabName(tab),
        icon: resolvedIcon ? (
          <img src={resolvedIcon} alt='' className='w-16px h-16px object-contain' />
        ) : (
          <Puzzle theme='outline' size='16' />
        ),
        path: `ext/${tab.id}`,
      };
    };

    for (let i = result.length - 1; i >= 0; i--) {
      const id = result[i].id;
      const afters = afterMap.get(id);
      if (afters) result.splice(i + 1, 0, ...afters.map(toNavItem));
      const befores = beforeMap.get(id);
      if (befores) result.splice(i, 0, ...befores.map(toNavItem));
    }

    if (unanchored.length > 0) {
      const sysIdx = result.findIndex((item) => item.id === 'system');
      const idx = sysIdx >= 0 ? sysIdx : result.length;
      result.splice(idx, 0, ...unanchored.map(toNavItem));
    }

    return result;
  }, [isDesktop, t, extensionTabs, resolveExtTabName]);

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
              const active = pathname.includes(`/settings/${item.path}`);
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
                  <span className='settings-mobile-top-nav__icon'>{item.icon}</span>
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
