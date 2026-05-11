import React, { useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import {
  ArrowCircleLeft,
  ArrowLeft,
  ArrowRight,
  ExpandLeft,
  ExpandRight,
  MenuFold,
  MenuUnfold,
  Plus,
  Search,
} from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { ipcBridge } from '@/common';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import WindowControls from '../WindowControls';
import SidebarToggleIcon from '../SidebarToggleIcon';
import ConversationSearchPopover from '@renderer/pages/conversation/GroupedHistory/ConversationSearchPopover';
import { WORKSPACE_STATE_EVENT, dispatchWorkspaceToggleEvent } from '@renderer/utils/workspace/workspaceEvents';
import type { WorkspaceStateDetail } from '@renderer/utils/workspace/workspaceEvents';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useNavigationHistory } from '@/renderer/hooks/context/NavigationHistoryContext';
import { isElectronDesktop, isMacOS } from '@/renderer/utils/platform';
import { cleanupSiderTooltips } from '@/renderer/utils/ui/siderTooltip';
import { blurActiveElement } from '@/renderer/utils/ui/focus';
import './titlebar.css';

interface TitlebarProps {
  workspaceAvailable: boolean;
}

const AionLogoMark: React.FC = () => (
  <svg className='app-titlebar__brand-logo' viewBox='0 0 80 80' fill='none' aria-hidden='true' focusable='false'>
    <path
      d='M40 20 Q38 22 25 40 Q23 42 26 42 L30 42 Q32 40 40 30 Q48 40 50 42 L54 42 Q57 42 55 40 Q42 22 40 20'
      fill='currentColor'
    ></path>
    <circle cx='40' cy='46' r='3' fill='currentColor'></circle>
    <path d='M18 50 Q40 70 62 50' stroke='currentColor' strokeWidth='3.5' fill='none' strokeLinecap='round'></path>
  </svg>
);

const MacTrafficLightPreview: React.FC = () => (
  <div className='app-titlebar__traffic-preview' aria-hidden='true'>
    <span className='app-titlebar__traffic-dot app-titlebar__traffic-dot--close'></span>
    <span className='app-titlebar__traffic-dot app-titlebar__traffic-dot--minimize'></span>
    <span className='app-titlebar__traffic-dot app-titlebar__traffic-dot--zoom'></span>
  </div>
);

const Titlebar: React.FC<TitlebarProps> = ({ workspaceAvailable }) => {
  const { t } = useTranslation();
  const appTitle = useMemo(() => 'AionUi', []);
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(true);
  const [mobileCenterTitle, setMobileCenterTitle] = useState(appTitle);
  const [mobileCenterOffset, setMobileCenterOffset] = useState(0);
  const layout = useLayoutContext();
  const navigationHistory = useNavigationHistory();
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
  // WebUI/browser preview: simulate macOS traffic lights so Figma captures include the desktop shell.
  const showMacTrafficLightPreview = !isDesktopRuntime && !layout?.isMobile;
  // Titlebar 现在在侧边栏内，工作空间切换由 ChatLayout header 统一处理
  const showWorkspaceButton = workspaceAvailable && !isDesktopRuntime;

  const workspaceTooltip = workspaceCollapsed
    ? t('common.expandMore', { defaultValue: 'Expand workspace' })
    : t('common.collapse', { defaultValue: 'Collapse workspace' });
  const newConversationTooltip = t('conversation.workspace.createNewConversation');
  const backToChatTooltip = t('common.back', { defaultValue: 'Back to Chat' });
  const isSettingsRoute = location.pathname.startsWith('/settings');
  const iconSize = layout?.isMobile ? 24 : 18;
  const historySearchIconSize = layout?.isMobile ? iconSize : 16;
  // Desktop uses slimmer strokes to match macOS-native chrome aesthetics;
  // mobile keeps the default weight so icons stay legible at larger sizes.
  const desktopIconStroke = layout?.isMobile ? undefined : 2.5;
  // 统一在标题栏左侧展示主侧栏开关 / Always expose sidebar toggle on titlebar left side
  const showSiderToggle = Boolean(layout?.setSiderCollapsed) && !(layout?.isMobile && isSettingsRoute);
  const showBackToChatButton = Boolean(layout?.isMobile && isSettingsRoute);
  const showNewConversationButton = Boolean(layout?.isMobile && workspaceAvailable);
  const showHistorySearchButton = Boolean(!layout?.isMobile && !isSettingsRoute);
  const siderTooltip = layout?.siderCollapsed
    ? t('common.expandMore', { defaultValue: 'Expand sidebar' })
    : t('common.collapse', { defaultValue: 'Collapse sidebar' });
  // 前进/后退仅在桌面端显示（移动端空间有限，保留原有的返回到聊天按钮）
  // Show back/forward on desktop only; mobile keeps the existing back-to-chat button.
  const showHistoryNav = Boolean(navigationHistory) && !layout?.isMobile;
  const historyBackTooltip = t('common.historyBack', { defaultValue: 'Back' });
  const historyForwardTooltip = t('common.forward', { defaultValue: 'Forward' });
  const historySearchTooltip = t('conversation.historySearch.tooltip');

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

  const handleSearchConversationSelect = () => {
    cleanupSiderTooltips();
    blurActiveElement();
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

    // Team mode: show team name
    if (TEAM_MODE_ENABLED) {
      const teamMatch = location.pathname.match(/^\/team\/([^/]+)/);
      const team_id = teamMatch?.[1];
      if (team_id) {
        let cancelled = false;
        void ipcBridge.team.get
          .invoke({ id: team_id })
          .then((team) => {
            if (cancelled) return;
            setMobileCenterTitle(team?.name || appTitle);
          })
          .catch(() => {
            if (cancelled) return;
            setMobileCenterTitle(appTitle);
          });
        return () => {
          cancelled = true;
        };
      }
    }

    // Single agent mode: show conversation name
    const match = location.pathname.match(/^\/conversation\/([^/]+)/);
    const conversation_id = match?.[1];
    if (!conversation_id) {
      setMobileCenterTitle(appTitle);
      return;
    }

    let cancelled = false;
    void ipcBridge.conversation.get
      .invoke({ id: conversation_id })
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
    // macOS: reserve native traffic lights plus a small safety gap before custom controls.
    // Mobile keeps its own layout (no traffic lights).
    const marginLeft = layout?.isMobile ? '0px' : 'var(--sider-chrome-menu-offset)';
    return {
      marginLeft,
    };
  }, [isMacRuntime, showSiderToggle, layout?.isMobile]);

  return (
    <div
      ref={containerRef}
      style={mobileCenterStyle}
      className={classNames('flex items-center gap-8px app-titlebar', {
        'app-titlebar--mobile': layout?.isMobile,
        'app-titlebar--mobile-conversation': layout?.isMobile && workspaceAvailable,
        'app-titlebar--desktop': isDesktopRuntime,
        'app-titlebar--mac': isMacRuntime,
        'app-titlebar--mac-preview': showMacTrafficLightPreview,
      })}
    >
      {showMacTrafficLightPreview && <MacTrafficLightPreview />}
      <div ref={menuRef} className='app-titlebar__menu' style={menuStyle}>
        {showBackToChatButton && (
          <button
            type='button'
            className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')}
            onClick={handleBackToChat}
            aria-label={backToChatTooltip}
          >
            <ArrowCircleLeft theme='outline' size={iconSize} fill='currentColor' />
          </button>
        )}
        {showSiderToggle && (
          <button
            type='button'
            className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')}
            onClick={handleSiderToggle}
            aria-label={siderTooltip}
          >
            {layout?.isMobile ? (
              layout?.siderCollapsed ? (
                <MenuUnfold theme='outline' size={iconSize} fill='currentColor' />
              ) : (
                <MenuFold theme='outline' size={iconSize} fill='currentColor' />
              )
            ) : (
              <SidebarToggleIcon size={iconSize} />
            )}
          </button>
        )}
        {showHistorySearchButton && (
          <ConversationSearchPopover
            onConversationSelect={handleSearchConversationSelect}
            renderTrigger={({ onClick, isActive }) => (
              <button
                type='button'
                className={classNames(
                  'app-titlebar__button app-titlebar__button--search',
                  isActive && 'app-titlebar__button--active'
                )}
                onClick={onClick}
                aria-label={historySearchTooltip}
                title={historySearchTooltip}
              >
                <Search
                  theme='outline'
                  size={historySearchIconSize}
                  fill='currentColor'
                  strokeWidth={desktopIconStroke}
                />
              </button>
            )}
          />
        )}
        {showHistoryNav && (
          <>
            <button
              type='button'
              className='app-titlebar__button app-titlebar__button--nav'
              onClick={() => navigationHistory?.back()}
              disabled={!navigationHistory?.canBack}
              aria-label={historyBackTooltip}
              title={historyBackTooltip}
            >
              <ArrowLeft theme='outline' size={iconSize} fill='currentColor' strokeWidth={desktopIconStroke} />
            </button>
            <button
              type='button'
              className='app-titlebar__button app-titlebar__button--nav'
              onClick={() => navigationHistory?.forward()}
              disabled={!navigationHistory?.canForward}
              aria-label={historyForwardTooltip}
              title={historyForwardTooltip}
            >
              <ArrowRight theme='outline' size={iconSize} fill='currentColor' strokeWidth={desktopIconStroke} />
            </button>
          </>
        )}
      </div>
      {layout?.isMobile && (
        <div className='app-titlebar__brand' aria-label={mobileCenterTitle} title={mobileCenterTitle}>
          <span className='app-titlebar__brand-mobile'>
            <AionLogoMark />
            <span className='app-titlebar__brand-text'>{mobileCenterTitle}</span>
          </span>
        </div>
      )}
      <div ref={toolbarRef} className='app-titlebar__toolbar'>
        {showNewConversationButton && (
          <button
            type='button'
            className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')}
            onClick={handleCreateConversation}
            aria-label={newConversationTooltip}
          >
            <Plus theme='outline' size={iconSize} fill='currentColor' />
          </button>
        )}
        {showWorkspaceButton && (
          <button
            type='button'
            className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')}
            onClick={handleWorkspaceToggle}
            aria-label={workspaceTooltip}
          >
            {workspaceCollapsed ? (
              <ExpandRight theme='outline' size={iconSize} fill='currentColor' />
            ) : (
              <ExpandLeft theme='outline' size={iconSize} fill='currentColor' />
            )}
          </button>
        )}
        {showWindowControls && <WindowControls />}
      </div>
    </div>
  );
};

export default Titlebar;
