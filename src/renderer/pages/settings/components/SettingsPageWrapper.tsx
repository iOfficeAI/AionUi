import classNames from 'classnames';
import React from 'react';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { SettingsViewModeProvider } from '@/renderer/components/SettingsModal/settingsViewContext';

interface SettingsPageWrapperProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

const SettingsPageWrapper: React.FC<SettingsPageWrapperProps> = ({ children, className, contentClassName }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;

  const containerClass = classNames('settings-page-wrapper w-full min-h-full box-border overflow-y-auto', isMobile ? 'px-16px py-20px' : 'px-12px md:px-40px py-32px', className);

  const contentClass = classNames('settings-page-content mx-auto w-full md:max-w-1024px', contentClassName);

  return (
    <SettingsViewModeProvider value='page'>
      <div className={containerClass}>
        <div className={contentClass}>{children}</div>
      </div>
    </SettingsViewModeProvider>
  );
};

export default SettingsPageWrapper;
