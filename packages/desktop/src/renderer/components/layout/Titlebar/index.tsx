import React, { useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { ArrowCircleLeft, ArrowLeft, ArrowRight, ExpandLeft, ExpandRight, Peoples } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { ipcBridge } from '@/common';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import MobileConversationBrand from './MobileConversationBrand';
import WindowControls from '../WindowControls';
import { WORKSPACE_STATE_EVENT, dispatchWorkspaceToggleEvent } from '@renderer/utils/workspace/workspaceEvents';
import type { WorkspaceStateDetail } from '@renderer/utils/workspace/workspaceEvents';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useNavigationHistory } from '@/renderer/hooks/context/NavigationHistoryContext';
import { useFeedback } from '@/renderer/hooks/context/FeedbackContext';
import { isElectronDesktop, isMacOS } from '@/renderer/utils/platform';
import './titlebar.css';

interface TitlebarProps {
  workspaceAvailable: boolean;
}

// Map the current route to a feedback module tag (must match FEEDBACK_MODULES in
// feedbackModules.ts), so the report modal pre-selects the relevant module.
// Unknown routes (e.g. the home page) return undefined, letting the user pick.
const resolveFeedbackModule = (pathname: string): string | undefined => {
  if (pathname.startsWith('/conversation')) return 'conversation-session';
  if (pathname.startsWith('/team')) return 'agent-team';
  if (pathname.startsWith('/settings')) return 'system-settings';
  return undefined;
};

// Bug-report icon: a speech bubble with a centred "?" mark, reading as "report an
// issue". Drawn on a 48-unit viewBox with icon-park-like padding and taking the same
// `strokeWidth` as the neighbouring @icon-park icons / SidebarIcon, so its line weight
// and footprint match the rest of the titlebar toolbar exactly. (@icon-park doesn't
// ship this exact shape, so it's rendered inline.)
//
// The raw artwork fills less of the viewBox than @icon-park's glyphs do, so at the
// same `size` it reads optically smaller. Scale the artwork up about the centre to
// match their footprint, and divide the stroke by the same factor so the rendered
// line weight stays identical to the neighbouring icons.
const FEEDBACK_ICON_SCALE = 1.12;
// The bubble's tail drops to y≈41 (body is y6~38), pulling the optical centre below
// the viewBox midline, so the icon reads slightly low next to the vertically
// symmetric @icon-park neighbours. Nudge the whole glyph up a couple of viewBox
// units to bring its visual centre back onto the shared baseline.
const FEEDBACK_ICON_RISE = 2;
const FeedbackIcon: React.FC<{ size?: number; strokeWidth?: number }> = ({ size = 18, strokeWidth = 4 }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 48 48'
    fill='none'
    stroke='currentColor'
    strokeWidth={strokeWidth / FEEDBACK_ICON_SCALE}
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-hidden='true'
    focusable='false'
  >
    <g
      transform={`translate(0 -${FEEDBACK_ICON_RISE}) translate(24 24) scale(${FEEDBACK_ICON_SCALE}) translate(-24 -24)`}
    >
      {/* Speech bubble with a tail dropping to the bottom-left. Sized to nearly fill
          the viewBox so it reads at the same scale as the neighbouring icons. */}
      <path d='M24 6C34 6 42 13 42 22C42 31 34 38 24 38C21.7 38 19.5 37.7 17.5 37.2L7 41L10 32C7.5 29 6 25.3 6 22C6 13 14 6 24 6Z' />
      {/* Question mark hook + stem, centred at x=24 inside the bubble cavity. */}
      <path d='M18.5 17.5C18.5 14 21 12 24 12C27 12 29.5 14 29.5 17C29.5 20.5 26.5 21.5 25 23.5C24 24.8 24 25.5 24 27' />
      {/* Dot below the stem, drawn as a zero-length round-capped segment. */}
      <path d='M24 31.5L24 31.55' />
    </g>
  </svg>
);

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
  const appTitle = useMemo(() => 'AionUi', []);
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(true);
  const [mobileCenterTitle, setMobileCenterTitle] = useState(appTitle);
  const [mobileCenterOffset, setMobileCenterOffset] = useState(0);
  const layout = useLayoutContext();
  const navigationHistory = useNavigationHistory();
  const { openFeedback } = useFeedback();
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

  const workspaceTooltip = workspaceCollapsed
    ? t('common.expandMore', { defaultValue: 'Expand workspace' })
    : t('common.collapse', { defaultValue: 'Collapse workspace' });
  const backToChatTooltip = t('common.back', { defaultValue: 'Back to Chat' });
  const feedbackTooltip = t('conversation.welcome.quickActionFeedback', { defaultValue: 'Report Issue' });
  const isSettingsRoute = location.pathname.startsWith('/settings');
  const iconSize = 18;
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
    if (!workspaceAvailable) {
      return;
    }
    dispatchWorkspaceToggleEvent();
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
  }, [layout?.isMobile, showBackToChatButton, showWorkspaceButton, mobileCenterTitle]);

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
          'app-titlebar__brand--centered': layout?.isMobile || !location.pathname.match(/^\/(conversation|team)\//),
        })}
        aria-label={layout?.isMobile ? mobileCenterTitle : appTitle}
        title={layout?.isMobile ? mobileCenterTitle : appTitle}
      >
        {layout?.isMobile &&
          (() => {
            const conversationMatch = location.pathname.match(/^\/conversation\/([^/]+)/);
            const conversation_id = conversationMatch?.[1];
            if (conversation_id) {
              return <MobileConversationBrand conversation_id={conversation_id} fallbackTitle={mobileCenterTitle} />;
            }
            const isTeamRoute = TEAM_MODE_ENABLED && /^\/team\/[^/]+/.test(location.pathname);
            return (
              <span className='app-titlebar__brand-mobile'>
                {isTeamRoute && (
                  <span className='app-titlebar__brand-icon' aria-hidden='true'>
                    <Peoples theme='outline' size='16' fill='currentColor' />
                  </span>
                )}
                <span className='app-titlebar__brand-text'>{mobileCenterTitle}</span>
              </span>
            );
          })()}
      </div>
      <div ref={toolbarRef} className='app-titlebar__toolbar'>
        {layout?.isMobile && <div id='app-titlebar-actions-slot' className='app-titlebar__actions-slot' />}
        <button
          type='button'
          className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')}
          onClick={() => void openFeedback({ autoScreenshot: true, module: resolveFeedbackModule(location.pathname) })}
          aria-label={feedbackTooltip}
          title={feedbackTooltip}
        >
          <FeedbackIcon size={iconSize} strokeWidth={desktopIconStroke} />
        </button>
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
