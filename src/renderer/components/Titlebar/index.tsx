import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { Tooltip } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight } from '@icon-park/react';
import { useTranslation } from 'react-i18next';

import WindowControls from '../WindowControls';
import { WORKSPACE_STATE_EVENT, dispatchWorkspaceToggleEvent } from '@renderer/utils/workspaceEvents';
import type { WorkspaceStateDetail } from '@renderer/utils/workspaceEvents';

interface TitlebarProps {
  workspaceAvailable: boolean;
}

// 运行环境探测：Electron 桌面 / Desktop runtime detection
const detectDesktop = () => typeof window !== 'undefined' && Boolean(window.electronAPI);
const detectMac = () => typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);

const Titlebar: React.FC<TitlebarProps> = ({ workspaceAvailable }) => {
  const { t } = useTranslation();
  const appTitle = useMemo(() => t('app.name', { defaultValue: 'AionUi' }), [t]);
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(true);

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

  const isDesktopRuntime = detectDesktop();
  const isMacRuntime = isDesktopRuntime && detectMac();
  // Windows/Linux 显示自定义窗口按钮；macOS 在标题栏给工作区一个切换入口
  const showWindowControls = isDesktopRuntime && !isMacRuntime;
  const showWorkspaceButton = workspaceAvailable && isMacRuntime;

  const workspaceTooltip = workspaceCollapsed ? t('conversation.workspace.expand', { defaultValue: 'Expand workspace' }) : t('conversation.workspace.collapse', { defaultValue: 'Collapse workspace' });

  const handleWorkspaceToggle = () => {
    if (!workspaceAvailable) {
      return;
    }
    dispatchWorkspaceToggleEvent();
  };

  return (
    <div
      className={classNames('app-titlebar bg-2 border-b border-[var(--border-base)]', {
        'app-titlebar--desktop': isDesktopRuntime,
        'app-titlebar--mac': isMacRuntime,
      })}
    >
      <div className='app-titlebar__brand'>{appTitle}</div>
      <div className='app-titlebar__toolbar'>
        {showWorkspaceButton && (
          <Tooltip content={workspaceTooltip} position='bottom'>
            <button type='button' className='app-titlebar__button' onClick={handleWorkspaceToggle} aria-label={workspaceTooltip}>
              {workspaceCollapsed ? <ExpandRight theme='outline' size='18' fill='currentColor' /> : <ExpandLeft theme='outline' size='18' fill='currentColor' />}
            </button>
          </Tooltip>
        )}
        {showWindowControls && <WindowControls />}
      </div>
    </div>
  );
};

export default Titlebar;
