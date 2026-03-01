import React, { useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { ArrowCircleLeft, ExpandLeft, ExpandRight, MenuFold, MenuUnfold, Plus } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { ipcBridge } from '@/common';
import WindowControls from '../WindowControls';
import { WORKSPACE_STATE_EVENT, dispatchWorkspaceToggleEvent } from '@renderer/utils/workspaceEvents';
import type { WorkspaceStateDetail } from '@renderer/utils/workspaceEvents';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { isElectronDesktop, isMacOS } from '@/renderer/utils/platform';

interface TitlebarProps {
  workspaceAvailable: boolean;
}

const AionLogoMark: React.FC = () => (
  <svg className='app-titlebar__brand-logo' viewBox='0 0 80 80' fill='none' aria-hidden='true' focusable='false'>
    <path d='M40 20 Q38 22 25 40 Q23 42 26 42 L30 42 Q32 40 40 30 Q48 40 50 42 L54 42 Q57 42 55 40 Q42 22 40 20' fill='currentColor'></path>
    <circle cx='40' cy='46' r='3' fill='currentColor'></circle>
    <path d='M18 50 Q40 70 62 50' stroke='currentColor' strokeWidth='3.5' fill='none' strokeLinecap='round'></path>
  </svg>
);

const Titlebar: React.FC<TitlebarProps> = ({ workspaceAvailable }) => {
  const { t } = useTranslation();
  const appTitle = useMemo(() => t('app.name', { defaultValue: 'AionUi' }), [t]);
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(true);
  const [mobileCenterTitle, setMobileCenterTitle] = useState(appTitle);
  const [mobileCenterOffset, setMobileCenterOffset] = useState(0);
  const layout = useLayoutContext();
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const lastNonSettingsPathRef = useRef('/guid');

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
  const newConversationTooltip = t('conversation.workspace.createNewConversation');
  const backToChatTooltip = t('common.back', { defaultValue: 'Back to Chat' });
  const isSettingsRoute = location.pathname.startsWith('/settings');
  const iconSize = layout?.isMobile ? 24 : 18;
  // 统一在标题栏左侧展示主侧栏开关 / Always expose sidebar toggle on titlebar left side
  const showSiderToggle = Boolean(layout?.setSiderCollapsed) && !(layout?.isMobile && isSettingsRoute);
  const showBackToChatButton = Boolean(layout?.isMobile && isSettingsRoute);
  const showNewConversationButton = Boolean(layout?.isMobile && workspaceAvailable);
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

  const handleCreateConversation = () => {
    void navigate('/guid');
  };

  const handleBackToChat = () => {
    const target = lastNonSettingsPathRef.current;
    if (target && !target.startsWith('/settings')) {
      void navigate(target);
      return;
    }
    void navigate(-1);
  };

  useEffect(() => {
    if (!isSettingsRoute) {
      const path = `${location.pathname}${location.search}${location.hash}`;
      lastNonSettingsPathRef.current = path;
      try {
        sessionStorage.setItem('aion:last-non-settings-path', path);
      } catch {
        // ignore
      }
      return;
    }
    try {
      const stored = sessionStorage.getItem('aion:last-non-settings-path');
      if (stored) {
        lastNonSettingsPathRef.current = stored;
      }
    } catch {
      // ignore
    }
  }, [isSettingsRoute, location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!layout?.isMobile) {
      setMobileCenterTitle(appTitle);
      return;
    }

    const match = location.pathname.match(/^\/conversation\/([^/]+)/);
    const conversationId = match?.[1];
    if (!conversationId) {
      setMobileCenterTitle(appTitle);
      return;
    }

    let cancelled = false;
    void ipcBridge.conversation.get
      .invoke({ id: conversationId })
      .then((conversation) => {
        if (cancelled) return;
        setMobileCenterTitle(conversation?.name || appTitle);
      })
      .catch(() => {
        if (cancelled) return;
        setMobileCenterTitle(appTitle);
      });

    return () => {
      cancelled = true;
    };
  }, [appTitle, layout?.isMobile, location.pathname]);

  useEffect(() => {
    if (!layout?.isMobile) {
      setMobileCenterOffset(0);
      return;
    }

    const updateOffset = () => {
      const leftWidth = menuRef.current?.offsetWidth || 0;
      const rightWidth = toolbarRef.current?.offsetWidth || 0;
      setMobileCenterOffset((leftWidth - rightWidth) / 2);
    };

    updateOffset();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateOffset);
      return () => window.removeEventListener('resize', updateOffset);
    }

    const observer = new ResizeObserver(() => updateOffset());
    if (containerRef.current) observer.observe(containerRef.current);
    if (menuRef.current) observer.observe(menuRef.current);
    if (toolbarRef.current) observer.observe(toolbarRef.current);

    return () => observer.disconnect();
  }, [layout?.isMobile, showBackToChatButton, showNewConversationButton, showWorkspaceButton, mobileCenterTitle]);

  const mobileCenterStyle = layout?.isMobile
    ? ({
        '--app-titlebar-mobile-center-offset': `${workspaceAvailable ? mobileCenterOffset : 0}px`,
      } as React.CSSProperties)
    : undefined;

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
      ref={containerRef}
      style={mobileCenterStyle}
      className={classNames('flex items-center gap-8px app-titlebar bg-2 border-b border-[var(--border-base)]', {
        'app-titlebar--mobile': layout?.isMobile,
        'app-titlebar--mobile-conversation': layout?.isMobile && workspaceAvailable,
        'app-titlebar--desktop': isDesktopRuntime,
        'app-titlebar--mac': isMacRuntime,
      })}
    >
      <div ref={menuRef} className='app-titlebar__menu' style={menuStyle}>
        {showBackToChatButton && (
          <button type='button' className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')} onClick={handleBackToChat} aria-label={backToChatTooltip}>
            <ArrowCircleLeft theme='outline' size={iconSize} fill='currentColor' />
          </button>
        )}
        {showSiderToggle && (
          <button type='button' className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')} onClick={handleSiderToggle} aria-label={siderTooltip}>
            {layout?.siderCollapsed ? <MenuUnfold theme='outline' size={iconSize} fill='currentColor' /> : <MenuFold theme='outline' size={iconSize} fill='currentColor' />}
          </button>
        )}
      </div>
      <div className='app-titlebar__brand' aria-label={layout?.isMobile ? mobileCenterTitle : appTitle} title={layout?.isMobile ? mobileCenterTitle : appTitle}>
        {layout?.isMobile ? (
          <span className='app-titlebar__brand-mobile'>
            <AionLogoMark />
            <span className='app-titlebar__brand-text'>{mobileCenterTitle}</span>
          </span>
        ) : (
          appTitle
        )}
      </div>
      <div ref={toolbarRef} className='app-titlebar__toolbar'>
        {showNewConversationButton && (
          <button type='button' className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')} onClick={handleCreateConversation} aria-label={newConversationTooltip}>
            <Plus theme='outline' size={iconSize} fill='currentColor' />
          </button>
        )}
        {showWorkspaceButton && (
          <button type='button' className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')} onClick={handleWorkspaceToggle} aria-label={workspaceTooltip}>
            {workspaceCollapsed ? <ExpandRight theme='outline' size={iconSize} fill='currentColor' /> : <ExpandLeft theme='outline' size={iconSize} fill='currentColor' />}
          </button>
        )}
        {showWindowControls && <WindowControls />}
      </div>
    </div>
  );
};

export default Titlebar;
