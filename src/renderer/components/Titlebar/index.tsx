import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { ExpandLeft, ExpandRight, MenuFold, MenuUnfold } from '@icon-park/react';
import { useTranslation } from 'react-i18next';

import WindowControls from '../WindowControls';
import { WORKSPACE_STATE_EVENT, dispatchWorkspaceToggleEvent } from '@renderer/utils/workspaceEvents';
import type { WorkspaceStateDetail } from '@renderer/utils/workspaceEvents';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { isElectronDesktop, isMacOS } from '@/renderer/utils/platform';

interface TitlebarProps {
  workspaceAvailable: boolean;
}

const Titlebar: React.FC<TitlebarProps> = ({ workspaceAvailable }) => {
  const { t } = useTranslation();
  const appTitle = useMemo(() => t('app.name', { defaultValue: 'AionUi' }), [t]);
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(true);
  const layout = useLayoutContext();

  // 监听工作空间折叠状态，保持按钮图标一致 / Sync workspace collapsed state for toggle button
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<WorkspaceStateDetail>;
      if (typeof customEvent.detail?.collapsed === 'boolean') {
        setWorkspaceCollapsed(customEvent.detail.collapsed);
      }
    };
    window.addEventListener(WORKSPACE_STATE_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(WORKSPACE_STATE_EVENT, handler as EventListener);
    };
  }, []);

  const isDesktopRuntime = isElectronDesktop();
  const isMacRuntime = isDesktopRuntime && isMacOS();
  // Windows/Linux 显示自定义窗口按钮；macOS 在标题栏给工作区一个切换入口
  const showWindowControls = isDesktopRuntime && !isMacRuntime;
  // WebUI 和 macOS 桌面都需要在标题栏放工作区开关
  const showWorkspaceButton = workspaceAvailable && (!isDesktopRuntime || isMacRuntime);

  const workspaceTooltip = workspaceCollapsed ? t('conversation.workspace.expand', { defaultValue: 'Expand workspace' }) : t('conversation.workspace.collapse', { defaultValue: 'Collapse workspace' });
  // 统一在标题栏左侧展示主侧栏开关 / Always expose sidebar toggle on titlebar left side
  const showSiderToggle = Boolean(layout?.setSiderCollapsed);
  const siderTooltip = layout?.siderCollapsed ? t('sidebar.expand', { defaultValue: '展开侧栏' }) : t('sidebar.collapse', { defaultValue: '收起侧栏' });

  const handleSiderToggle = () => {
    if (!showSiderToggle || !layout?.setSiderCollapsed) return;
    layout.setSiderCollapsed(!layout.siderCollapsed);
  };

  const handleWorkspaceToggle = () => {
    if (!workspaceAvailable) {
      return;
    }
    dispatchWorkspaceToggleEvent();
  };

  const menuStyle: React.CSSProperties = useMemo(() => {
    if (!isMacRuntime || !showSiderToggle) return {};

    const marginLeft = layout?.isMobile ? '0px' : layout?.siderCollapsed ? '60px' : '210px';
    return {
      marginLeft,
      transition: 'margin-left 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
    };
  }, [isMacRuntime, showSiderToggle, layout?.isMobile, layout?.siderCollapsed]);

  return (
    <div
      className={classNames('flex items-center gap-8px app-titlebar bg-2 border-b border-[var(--border-base)]', {
        'app-titlebar--desktop': isDesktopRuntime,
        'app-titlebar--mac': isMacRuntime,
      })}
    >
      <div className='app-titlebar__menu' style={menuStyle}>
        {showSiderToggle && (
          <button type='button' className='app-titlebar__button' onClick={handleSiderToggle} aria-label={siderTooltip}>
            {layout?.siderCollapsed ? <MenuUnfold theme='outline' size='18' fill='currentColor' /> : <MenuFold theme='outline' size='18' fill='currentColor' />}
          </button>
        )}
      </div>
      <div className='app-titlebar__brand'>{appTitle}</div>
      <div className='app-titlebar__toolbar'>
        {showWorkspaceButton && (
          <button type='button' className='app-titlebar__button' onClick={handleWorkspaceToggle} aria-label={workspaceTooltip}>
            {workspaceCollapsed ? <ExpandRight theme='outline' size='18' fill='currentColor' /> : <ExpandLeft theme='outline' size='18' fill='currentColor' />}
          </button>
        )}
        {showWindowControls && <WindowControls />}
      </div>
    </div>
  );
};

export default Titlebar;
