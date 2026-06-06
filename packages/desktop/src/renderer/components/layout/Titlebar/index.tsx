import React, { useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import {
  ArrowCircleLeft,
  ArrowLeft,
  ArrowRight,
  Command,
  ExpandLeft,
  ExpandRight,
  GithubOne,
  MessageOne,
  Peoples,
  Terminal,
} from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { ipcBridge } from '@/common';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import MobileConversationBrand from './MobileConversationBrand';
import WindowControls from '../WindowControls';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useNavigationHistory } from '@/renderer/hooks/context/NavigationHistoryContext';
import { useEditorContextSafe } from '@/renderer/pages/conversation/Editor';
import { useTerminalPanelSafe } from '@/renderer/hooks/context/TerminalPanelContext';
import { useLayoutModeSafe } from '@/renderer/hooks/context/LayoutModeContext';
import { isElectronDesktop, isMacOS } from '@/renderer/utils/platform';
import './titlebar.css';

interface TitlebarProps {
  workspaceAvailable: boolean;
}

// Claude-desktop-style sidebar toggle icon: a rounded rectangle with a vertical divider
// near the left edge, indicating a collapsible side panel. Rendered as inline SVG since
// @icon-park doesn't ship this exact shape.
//
// Uses a 48-unit viewBox to match @icon-park's stroke scale, so passing the same
// `strokeWidth` value here and to @icon-park icons produces visually identical lines.
//
// The rect spans y=10..38 (height 28), slightly taller than @icon-park's
// ArrowLeft/ArrowRight (which span y=12..36) so the sidebar icon reads a
// touch larger. The rect remains centered at y=24, matching the arrows'
// centerline so all three icons stay on the same visual baseline.
const SidebarIcon: React.FC<{ size?: number; strokeWidth?: number }> = ({ size = 18, strokeWidth = 4 }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 48 48'
    fill='none'
    stroke='currentColor'
    strokeWidth={strokeWidth}
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-hidden='true'
    focusable='false'
  >
    <rect x='6' y='10' width='36' height='28' rx='5' />
    <line x1='18' y1='10' x2='18' y2='38' />
  </svg>
);

const Titlebar: React.FC<TitlebarProps> = ({ workspaceAvailable }) => {
  const { t } = useTranslation();
  const appTitle = useMemo(() => 'Chisl', []);
  const [activeWorkspaceName, setActiveWorkspaceName] = useState(appTitle);
  const [mobileCenterOffset, setMobileCenterOffset] = useState(0);
  const layout = useLayoutContext();
  const navigationHistory = useNavigationHistory();
  const location = useLocation();
  const navigate = useNavigate();
  // Layout panes are global concerns driven from the titlebar's four-button
  // control. Safe context variants are used so the titlebar still renders if a
  // provider is ever absent (e.g. isolated test mounts).
  const editorCtx = useEditorContextSafe();
  const terminalPanel = useTerminalPanelSafe();
  const layoutModeCtx = useLayoutModeSafe();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const lastNonSettingsPathRef = useRef('/guid');

  // The right-side ConversationPane collapsed state comes straight from the
  // layout context (single source of truth) — no local mirror, no init race.
  const conversationPaneCollapsed = layout?.conversationPaneCollapsed ?? true;

  const isDesktopRuntime = isElectronDesktop();
  const isMacRuntime = isDesktopRuntime && isMacOS();
  // Windows/Linux 显示自定义窗口按钮；macOS 在标题栏给工作区一个切换入口
  const showWindowControls = isDesktopRuntime && !isMacRuntime;

  const workspaceTooltip = conversationPaneCollapsed ? t('common.expandMore') : t('common.collapse');
  const backToChatTooltip = t('common.back', { defaultValue: 'Back to Chat' });
  const isSettingsRoute = location.pathname.startsWith('/settings');
  // Conversation-pane toggle: available on every route except Settings, on
  // all platforms (the pane is now the only way to manage chats).
  const showWorkspaceButton = !isSettingsRoute;
  const iconSize = 16;
  // Desktop uses slimmer strokes to match macOS-native chrome aesthetics;
  // mobile keeps the default weight so icons stay legible at larger sizes.
  const desktopIconStroke = layout?.isMobile ? undefined : 2.5;
  // 统一在标题栏左侧展示主侧栏开关 / Always expose sidebar toggle on titlebar left side
  const showSiderToggle = Boolean(layout?.setSiderCollapsed) && !(layout?.isMobile && isSettingsRoute);
  const showBackToChatButton = Boolean(layout?.isMobile && isSettingsRoute);
  const siderTooltip = layout?.siderCollapsed
    ? t('common.expandMore', { defaultValue: 'Expand sidebar' })
    : t('common.collapse', { defaultValue: 'Collapse sidebar' });
  // 前进/后退仅在桌面端显示（移动端空间有限，保留原有的返回到聊天按钮）
  // Show back/forward on desktop only; mobile keeps the existing back-to-chat button.
  const showHistoryNav = Boolean(navigationHistory) && !layout?.isMobile;
  const historyBackTooltip = t('common.historyBack', { defaultValue: 'Back' });
  const historyForwardTooltip = t('common.forward', { defaultValue: 'Forward' });

  const handleSiderToggle = () => {
    if (!showSiderToggle || !layout?.setSiderCollapsed) return;
    layout.setSiderCollapsed(!layout.siderCollapsed);
  };

  const handleWorkspaceToggle = () => {
    layout?.setConversationPaneCollapsed?.(!conversationPaneCollapsed);
  };

  const handleBackToChat = () => {
    const target = lastNonSettingsPathRef.current;
    if (target && !target.startsWith('/settings')) {
      void navigate(target);
      return;
    }
    void navigate(-1);
  };

  // --- Layout pane controls (titlebar four-button cluster) ---
  // Replaces the rejected layout-mode dropdown with discrete, button-driven
  // toggle states. The diff view is the only mode-driven surface; the editor
  // and terminal are peer panes controlled directly via their contexts.
  const isDiffActive = layoutModeCtx?.mode === 'diff-focused';
  const isTerminalActive = Boolean(terminalPanel?.open);
  const isEditorActive = Boolean(editorCtx?.isOpen) && !editorCtx?.isCollapsed && !isDiffActive;
  const isCommandCenterActive = isEditorActive && isTerminalActive;
  // Chat mode is now anchored to the right-hand ConversationPane (the primary
  // navigation surface). It's "active" when the right pane is open and no
  // content pane (editor / terminal / diff) is taking over. The left sider is
  // demoted to an optional, independently-toggled surface and no longer gates
  // this state.
  const isChatActive = !isDiffActive && !isTerminalActive && !editorCtx?.isOpen && !conversationPaneCollapsed;

  // Chat: focus the conversation. Force the right-hand ConversationPane open
  // and clear the content panes (editor / diff / terminal). The left sider is
  // left untouched — it's optional and user-controlled.
  const handleChatView = () => {
    layoutModeCtx?.setMode('default');
    editorCtx?.requestCloseEditor();
    terminalPanel?.close();
    layout?.setConversationPaneCollapsed?.(false);
  };

  // Command Center: open the terminal and the (expanded) editor together.
  const handleCommandCenter = () => {
    layoutModeCtx?.setMode('default');
    if (editorCtx) {
      if (editorCtx.buffers.length === 0) {
        editorCtx.openUntitledEditor();
      } else {
        editorCtx.expandEditor();
      }
    }
    terminalPanel?.open_();
  };

  // Terminal: toggle the bottom terminal panel independently.
  const handleToggleTerminal = () => {
    terminalPanel?.toggle();
  };

  // Diff: show the diff view (hides the editor pane while active).
  const handleDiffView = () => {
    layoutModeCtx?.setMode('diff-focused');
  };

  const layoutActions = [
    {
      key: 'chat',
      label: t('terminal.layout.actionChat', { defaultValue: 'Chat' }),
      Icon: MessageOne,
      onClick: handleChatView,
      active: isChatActive,
    },
    {
      key: 'command-center',
      label: t('terminal.layout.actionCommandCenter', { defaultValue: 'Command Center' }),
      Icon: Command,
      onClick: handleCommandCenter,
      active: isCommandCenterActive,
    },
    {
      key: 'terminal',
      label: t('terminal.layout.actionTerminal', { defaultValue: 'Terminal' }),
      Icon: Terminal,
      onClick: handleToggleTerminal,
      active: isTerminalActive,
    },
    {
      key: 'diff',
      label: t('terminal.layout.actionDiff', { defaultValue: 'Diff' }),
      Icon: GithubOne,
      onClick: handleDiffView,
      active: isDiffActive,
    },
  ];

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
            setActiveWorkspaceName(team?.name || appTitle);
          })
          .catch(() => {
            if (cancelled) return;
            setActiveWorkspaceName(appTitle);
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
      setActiveWorkspaceName(appTitle);
      return;
    }

    let cancelled = false;
    void ipcBridge.conversation.get
      .invoke({ id: conversation_id })
      .then((conversation) => {
        if (cancelled) return;
        setActiveWorkspaceName(conversation?.name || appTitle);
      })
      .catch(() => {
        if (cancelled) return;
        setActiveWorkspaceName(appTitle);
      });

    return () => {
      cancelled = true;
    };
  }, [appTitle, location.pathname]);

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
  }, [layout?.isMobile, showBackToChatButton, showWorkspaceButton, activeWorkspaceName]);

  const mobileCenterStyle = layout?.isMobile
    ? ({
        '--app-titlebar-mobile-center-offset': `${workspaceAvailable ? mobileCenterOffset : 0}px`,
      } as React.CSSProperties)
    : undefined;

  const menuStyle: React.CSSProperties = useMemo(() => {
    if (!isMacRuntime || !showSiderToggle) return {};
    // macOS: sit the menu buttons right next to the traffic lights (which occupy ~70px).
    // Mobile keeps its own layout (no traffic lights).
    const marginLeft = layout?.isMobile ? '0px' : '76px';
    return {
      marginLeft,
    };
  }, [isMacRuntime, showSiderToggle, layout?.isMobile]);

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
            <SidebarIcon size={iconSize} strokeWidth={desktopIconStroke} />
          </button>
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
      <div
        className={classNames('app-titlebar__brand', {
          'app-titlebar__brand--centered': !location.pathname.match(/^\/(conversation|team)\//),
        })}
        aria-label={activeWorkspaceName}
      >
        {layout?.isMobile ? (
          (() => {
            const conversationMatch = location.pathname.match(/^\/conversation\/([^/]+)/);
            const conversation_id = conversationMatch?.[1];
            if (conversation_id) {
              return <MobileConversationBrand conversation_id={conversation_id} fallbackTitle={activeWorkspaceName} />;
            }
            const isTeamRoute = TEAM_MODE_ENABLED && /^\/team\/[^/]+/.test(location.pathname);
            return (
              <span className='app-titlebar__brand-mobile'>
                {isTeamRoute && (
                  <span className='app-titlebar__brand-icon' aria-hidden='true'>
                    <Peoples theme='outline' size='16' fill='currentColor' />
                  </span>
                )}
                <span className='app-titlebar__brand-text'>{activeWorkspaceName}</span>
              </span>
            );
          })()
        ) : (
          <span className='app-titlebar__brand-desktop' title={activeWorkspaceName}>
            {activeWorkspaceName}
          </span>
        )}
      </div>
      <div ref={toolbarRef} className='app-titlebar__toolbar'>
        {layout?.isMobile && <div id='app-titlebar-actions-slot' className='app-titlebar__actions-slot' />}
        {!layout?.isMobile && (
          <div
            className='app-titlebar__layout-actions'
            role='group'
            aria-label={t('terminal.layout.selectorLabel', { defaultValue: 'Layout mode' })}
          >
            {layoutActions.map(({ key, label, Icon, onClick, active }) => (
              <button
                key={key}
                type='button'
                className={classNames('app-titlebar__mode-btn', { 'app-titlebar__mode-btn--active': active })}
                onClick={onClick}
                aria-label={label}
                aria-pressed={active}
                title={label}
              >
                <Icon theme='outline' size={14} fill='currentColor' strokeWidth={desktopIconStroke} />
                <span className='app-titlebar__mode-btn-label'>{label}</span>
              </button>
            ))}
          </div>
        )}
        {showWorkspaceButton && (
          <button
            type='button'
            className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')}
            onClick={handleWorkspaceToggle}
            aria-label={workspaceTooltip}
            aria-pressed={!conversationPaneCollapsed}
          >
            {conversationPaneCollapsed ? (
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
