import classNames from 'classnames';
import React from 'react';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { SettingsViewModeProvider } from '@/renderer/components/SettingsModal/settingsViewContext';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Communication, Computer, Earth, Gemini, Info, LinkCloud, Robot, System, Toolkit } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

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

  const menuItems = React.useMemo(
    () => [
      { label: t('settings.gemini'), icon: <Gemini theme='outline' size='16' />, path: 'gemini' },
      { label: t('settings.model'), icon: <LinkCloud theme='outline' size='16' />, path: 'model' },
      { label: t('settings.assistants', { defaultValue: 'Assistants' }), icon: <Robot theme='outline' size='16' />, path: 'agent' },
      { label: t('settings.tools'), icon: <Toolkit theme='outline' size='16' />, path: 'tools' },
      { label: t('settings.display'), icon: <Computer theme='outline' size='16' />, path: 'display' },
      { label: t('settings.webui'), icon: isDesktop ? <Earth theme='outline' size='16' /> : <Communication theme='outline' size='16' />, path: 'webui' },
      { label: t('settings.system'), icon: <System theme='outline' size='16' />, path: 'system' },
      { label: t('settings.about'), icon: <Info theme='outline' size='16' />, path: 'about' },
    ],
    [isDesktop, t]
  );

  const containerClass = classNames('settings-page-wrapper w-full min-h-full box-border overflow-y-auto', isMobile ? 'px-16px py-14px' : 'px-12px md:px-40px py-32px', className);

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
