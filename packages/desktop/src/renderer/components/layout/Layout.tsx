/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import { configService } from '@/common/config/configService';
import type { ICssTheme } from '@/common/config/storage';
import PwaPullToRefresh from '@/renderer/components/layout/PwaPullToRefresh';
import Titlebar from '@/renderer/components/layout/Titlebar';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutContext } from '@renderer/hooks/context/LayoutContext';
import { LayoutModeProvider } from '@renderer/hooks/context/LayoutModeContext';
import { NavigationHistoryProvider } from '@renderer/hooks/context/NavigationHistoryContext';
import { TerminalPanelProvider } from '@renderer/hooks/context/TerminalPanelContext';
import TerminalPanelHost from '@renderer/components/layout/TerminalPanel/TerminalPanelHost';
import { useDeepLink } from '@renderer/hooks/system/useDeepLink';
import { useNotificationClick } from '@renderer/hooks/system/useNotificationClick';
import { useDirectorySelection } from '@renderer/hooks/file/useDirectorySelection';
import { processCustomCss } from '@renderer/utils/theme/customCssProcessor';
import { cleanupSiderTooltips } from '@renderer/utils/ui/siderTooltip';
import { useConversationShortcuts } from '@renderer/hooks/ui/useConversationShortcuts';
import { isElectronDesktop } from '@renderer/utils/platform';
import { computeCssSyncDecision, resolveCssByActiveTheme } from '@renderer/utils/theme/themeCssSync';
import { DEFAULT_THEME_ID } from '@renderer/pages/settings/DisplaySettings/presets';
import { dispatchConversationPaneStateEvent } from '@renderer/utils/conversationPane/events';
import ConversationPane from '@renderer/components/layout/ConversationPane';
import { useTerminalPanelSafe } from '@renderer/hooks/context/TerminalPanelContext';
import { useLayoutModeSafe } from '@renderer/hooks/context/LayoutModeContext';
import { useEditorContextSafe } from '@renderer/pages/conversation/Editor';
import { dispatchWorkspaceSetCollapsedEvent } from '@renderer/utils/workspace/workspaceEvents';
import '@renderer/styles/layout.css';

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
    style={{ display: 'inline-block', verticalAlign: 'middle' }}
  >
    <rect x='6' y='10' width='36' height='28' rx='5' />
    <line x1='18' y1='10' x2='18' y2='38' />
  </svg>
);

const UpdateModal = React.lazy(() => import('@/renderer/components/settings/UpdateModal'));
// App-wide editor pane (Monaco is heavy → lazy). Mounted only on routes where
// ChatLayout is absent, so the titlebar's Command Center can open the editor
// anywhere (e.g. /guid) without a second editor on conversation/team routes.
const EditorPane = React.lazy(() => import('@/renderer/components/layout/EditorPane'));

const LayoutModeOrchestrator: React.FC<{
  setCollapsed: (val: boolean) => void;
  isDesktop: boolean;
}> = ({ setCollapsed, isDesktop }) => {
  const layoutMode = useLayoutModeSafe();
  const terminalCtx = useTerminalPanelSafe();
  const editorCtx = useEditorContextSafe();

  const activeMode = layoutMode?.mode;
  const prevModeRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isDesktop || !activeMode) return;
    if (activeMode === prevModeRef.current) return;
    prevModeRef.current = activeMode;

    if (activeMode === 'command-center') {
      setCollapsed(false);
      dispatchWorkspaceSetCollapsedEvent(false);
      terminalCtx?.open_();
      if (!editorCtx?.buffers?.length) {
        editorCtx?.openUntitledEditor();
      } else {
        editorCtx?.expandEditor();
      }
    }
    if (activeMode === 'chat') {
      setCollapsed(true);
      dispatchWorkspaceSetCollapsedEvent(true);
      editorCtx?.hideEditor();
      if (!terminalCtx?.pinned) {
        terminalCtx?.close();
      }
    }
  }, [activeMode, isDesktop, setCollapsed, terminalCtx, editorCtx]);

  return null;
};

const DEFAULT_SIDER_WIDTH = 200;
const SIDER_MIN_WIDTH = 56;
const SIDER_MAX_WIDTH = 380;
const SIDER_ICON_ONLY_THRESHOLD = 90;
const SIDER_COLLAPSE_THRESHOLD = 36;
const SIDER_WIDTH_STORAGE_KEY = 'aionui.siderWidth';
const MOBILE_SIDER_WIDTH_RATIO = 0.7;
const MOBILE_SIDER_MIN_WIDTH = 240;
const MOBILE_SIDER_MAX_WIDTH = 320;

const readStoredSiderWidth = (): number => {
  if (typeof window === 'undefined') return DEFAULT_SIDER_WIDTH;
  try {
    const raw = window.localStorage.getItem(SIDER_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed)) {
      return Math.min(SIDER_MAX_WIDTH, Math.max(SIDER_MIN_WIDTH, parsed));
    }
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_SIDER_WIDTH;
};

const persistSiderWidth = (value: number): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SIDER_WIDTH_STORAGE_KEY, String(Math.round(value)));
  } catch {
    /* localStorage unavailable */
  }
};

const CONVERSATION_PANE_COLLAPSE_KEY = 'aionui.conversationPaneCollapsed';

// Default: OPEN on desktop so the conversation list is immediately usable.
const readStoredConversationPaneCollapsed = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CONVERSATION_PANE_COLLAPSE_KEY) === 'true';
  } catch {
    return false;
  }
};

const persistConversationPaneCollapsed = (value: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONVERSATION_PANE_COLLAPSE_KEY, String(value));
  } catch {
    /* localStorage unavailable */
  }
};

const detectMobileViewportOrTouch = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isElectronDesktop()) {
    return window.innerWidth < 768;
  }
  const width = window.innerWidth;
  const byWidth = width < 768;
  // 仅在小屏时才将 coarse/touch 视为移动端，避免触控笔记本被误判
  // Treat touch/coarse pointer as mobile only on smaller viewports
  const smallScreen = width < 1024;
  const byMedia = window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches;
  const byTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  return byWidth || (smallScreen && (byMedia || byTouchPoints));
};

const Layout: React.FC<{
  sider: React.ReactNode;
  onSessionClick?: () => void;
}> = ({ sider, onSessionClick: _onSessionClick }) => {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const [conversationPaneCollapsed, setConversationPaneCollapsedState] = useState<boolean>(readStoredConversationPaneCollapsed);
  const [isMobile, setIsMobile] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 390 : window.innerWidth
  );
  const [desktopSiderWidth, setDesktopSiderWidth] = useState<number>(readStoredSiderWidth);
  const [siderDragging, setSiderDragging] = useState(false);
  const [customCss, setCustomCss] = useState<string>('');
  const [shouldMountUpdateModal, setShouldMountUpdateModal] = useState(false);
  const { contextHolder: directorySelectionContextHolder } = useDirectorySelection();
  useDeepLink();
  useNotificationClick();
  const navigate = useNavigate();
  useConversationShortcuts({ navigate });
  const location = useLocation();
  const workspaceAvailable =
    location.pathname.startsWith('/conversation/') || (TEAM_MODE_ENABLED && location.pathname.startsWith('/team/'));
  const isSettingsRoute = location.pathname.startsWith('/settings');
  // The conversation pane is available everywhere except the Settings menu.
  const conversationPaneEnabled = !isSettingsRoute;

  const setConversationPaneCollapsed = useCallback((value: boolean) => {
    setConversationPaneCollapsedState(value);
    persistConversationPaneCollapsed(value);
  }, []);
  const collapsedRef = useRef(collapsed);
  const desktopSiderWidthRef = useRef(desktopSiderWidth);
  const lastCssRef = useRef('');
  const lastUiCssUpdateAtRef = useRef(0);
  const dragStateRef = useRef<{ active: boolean; startX: number; startWidth: number }>({
    active: false,
    startX: 0,
    startWidth: DEFAULT_SIDER_WIDTH,
  });

  const loadAndHealCustomCss = useCallback(async () => {
    try {
      const [savedCssRaw, activeThemeId, savedThemes] = await Promise.all([
        configService.get('customCss'),
        configService.get('css.activeThemeId'),
        configService.get('css.themes'),
      ]);

      const decision = computeCssSyncDecision({
        savedCss: savedCssRaw || '',
        activeThemeId: activeThemeId || '',
        savedThemes: (savedThemes || []) as ICssTheme[],
        currentUiCss: customCss,
        lastUiCssUpdateAt: lastUiCssUpdateAtRef.current,
      });

      if (decision.shouldSkipApply) {
        return;
      }

      let effectiveCss = decision.effectiveCss;

      // If the active theme resolved to empty CSS and there IS a saved activeThemeId
      // (but it no longer matches any known theme), fall back to the built-in default and persist.
      if (!effectiveCss && activeThemeId && activeThemeId !== DEFAULT_THEME_ID) {
        const defaultCss = resolveCssByActiveTheme(DEFAULT_THEME_ID, (savedThemes || []) as ICssTheme[]);
        effectiveCss = defaultCss;
        // Persist the fallback so Layout doesn't keep retrying
        await Promise.all([
          configService.set('css.activeThemeId', DEFAULT_THEME_ID),
          configService.set('customCss', effectiveCss),
        ]).catch((error) => {
          console.warn('Failed to persist theme fallback:', error);
        });
      } else if (decision.shouldHealStorage) {
        await configService.set('customCss', effectiveCss).catch((error) => {
          console.warn('Failed to heal custom CSS from active theme:', error);
        });
      }

      setCustomCss(effectiveCss);
      if (lastCssRef.current !== effectiveCss) {
        lastCssRef.current = effectiveCss;
        window.dispatchEvent(new CustomEvent('custom-css-updated', { detail: { customCss: effectiveCss } }));
      }
    } catch (error) {
      console.error('Failed to load or heal custom CSS:', error);
    }
  }, [customCss]);

  // 加载并监听自定义 CSS 配置 / Load & watch custom CSS configuration
  useEffect(() => {
    void loadAndHealCustomCss();

    const handleCssUpdate = (event: CustomEvent) => {
      if (event.detail?.customCss !== undefined) {
        const css = event.detail.customCss || '';
        lastCssRef.current = css;
        lastUiCssUpdateAtRef.current = Date.now();
        setCustomCss(css);
      }
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key && (event.key.includes('customCss') || event.key.includes('css.activeThemeId'))) {
        void loadAndHealCustomCss();
      }
    };

    window.addEventListener('custom-css-updated', handleCssUpdate as EventListener);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('custom-css-updated', handleCssUpdate as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [loadAndHealCustomCss]);

  // Re-sync theme css on route changes, because some settings pages do not mount CssThemeSettings.
  useEffect(() => {
    void loadAndHealCustomCss();
  }, [location.pathname, location.search, location.hash, loadAndHealCustomCss]);

  // 注入自定义 CSS / Inject custom CSS into document head
  useEffect(() => {
    const styleId = 'user-defined-custom-css';

    if (!customCss) {
      document.getElementById(styleId)?.remove();
      return;
    }

    const wrappedCss = processCustomCss(customCss);

    const ensureStyleAtEnd = () => {
      let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;

      if (styleEl && styleEl.textContent === wrappedCss && styleEl === document.head.lastElementChild) {
        return;
      }

      styleEl?.remove();
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.type = 'text/css';
      styleEl.textContent = wrappedCss;
      document.head.appendChild(styleEl);
    };

    ensureStyleAtEnd();

    const observer = new MutationObserver((mutations) => {
      const hasNewStyle = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some((node) => node.nodeName === 'STYLE' || node.nodeName === 'LINK')
      );

      if (hasNewStyle) {
        const element = document.getElementById(styleId);
        if (element && element !== document.head.lastElementChild) {
          ensureStyleAtEnd();
        }
      }
    });

    observer.observe(document.head, { childList: true });

    return () => {
      observer.disconnect();
      document.getElementById(styleId)?.remove();
    };
  }, [customCss]);

  // 检测移动端并响应窗口大小变化
  useEffect(() => {
    const checkMobile = () => {
      const mobile = detectMobileViewportOrTouch();
      setIsMobile(mobile);
      setViewportWidth(window.innerWidth);
    };

    // 初始检测
    checkMobile();

    // 监听窗口大小变化
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 进入移动端后立即折叠 / Collapse immediately when switching to mobile
  useEffect(() => {
    if (!isMobile || collapsedRef.current) {
      return;
    }
    setCollapsed(true);
  }, [isMobile]);

  // Broadcast the new ConversationPane state to the event bus so decoupled
  // listeners (e.g. mobile overlay animations, third-party widgets) can
  // mirror it. Direct tree descendants should read from LayoutContext.
  useEffect(() => {
    dispatchConversationPaneStateEvent(conversationPaneCollapsed);
  }, [conversationPaneCollapsed]);

  // Mobile: force-collapse the ConversationPane by default so it never
  // opens over a fresh chat unless the user explicitly invokes it.
  useEffect(() => {
    if (isMobile) {
      setConversationPaneCollapsed(true);
    }
  }, [isMobile]);

  // 清理侧栏 Tooltip 残留节点，避免移动端路由切换后浮层卡在左上角
  useEffect(() => {
    cleanupSiderTooltips();
  }, [isMobile, collapsed, location.pathname, location.search, location.hash]);

  // Bridge Main Process logs to F12 Console
  useEffect(() => {
    const unsubscribe = ipcBridge.application.logStream.on((entry) => {
      const prefix = `%c[Main:${entry.tag}]%c ${entry.message}`;
      const style = 'color:#7c3aed;font-weight:bold';
      if (entry.level === 'error') {
        console.error(prefix, style, 'color:inherit', ...(entry.data !== undefined ? [entry.data] : []));
      } else if (entry.level === 'warn') {
        console.warn(prefix, style, 'color:inherit', ...(entry.data !== undefined ? [entry.data] : []));
      } else {
        console.log(prefix, style, 'color:inherit', ...(entry.data !== undefined ? [entry.data] : []));
      }
    });
    return () => unsubscribe();
  }, []);

  // Handle tray events from main process / 处理来自主进程的托盘事件
  useEffect(() => {
    if (!isElectronDesktop()) return;

    // Navigate to guid page when requested from tray / 托盘请求导航到 guid 页面
    const handleNavigateToGuid = () => {
      void navigate('/guid');
    };

    // Navigate to conversation when requested from tray / 托盘请求导航到对话页面
    const handleNavigateToConversation = (event: CustomEvent<{ conversation_id: string }>) => {
      void navigate(`/conversation/${event.detail.conversation_id}`);
    };

    // Open about dialog when requested from tray / 托盘请求打开关于对话框
    const handleOpenAbout = () => {
      // Navigate to settings/about page / 导航到设置/关于页面
      void navigate('/settings/about');
    };

    // Handle pause all tasks request from tray / 托盘请求暂停所有任务
    const handlePauseAllTasks = async () => {
      const { ipcBridge } = await import('@/common');
      const result = await ipcBridge.task.stopAll.invoke();
      if (result?.success) {
        // Navigate to settings page to show task status
        void navigate('/settings/system');
      }
    };

    // Handle check update request from tray / 托盘请求检查更新
    // 1. Navigate to about page / 导航到关于页面
    // 2. Trigger update modal check / 触发更新模态框检查
    const handleCheckUpdate = () => {
      void navigate('/settings/about');
      // Trigger update modal after a short delay to ensure page is loaded
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'tray' } }));
      }, 100);
    };

    // Listen for tray events / 监听托盘事件
    window.addEventListener('tray:navigate-to-guid', handleNavigateToGuid as EventListener);
    window.addEventListener('tray:navigate-to-conversation', handleNavigateToConversation as EventListener);
    window.addEventListener('tray:open-about', handleOpenAbout as EventListener);
    window.addEventListener('tray:pause-all-tasks', handlePauseAllTasks as EventListener);
    window.addEventListener('tray:check-update', handleCheckUpdate as EventListener);

    return () => {
      window.removeEventListener('tray:navigate-to-guid', handleNavigateToGuid as EventListener);
      window.removeEventListener('tray:navigate-to-conversation', handleNavigateToConversation as EventListener);
      window.removeEventListener('tray:open-about', handleOpenAbout as EventListener);
      window.removeEventListener('tray:pause-all-tasks', handlePauseAllTasks as EventListener);
      window.removeEventListener('tray:check-update', handleCheckUpdate as EventListener);
    };
  }, [navigate]);

  const siderWidth = isMobile
    ? Math.max(
        MOBILE_SIDER_MIN_WIDTH,
        Math.min(MOBILE_SIDER_MAX_WIDTH, Math.round(viewportWidth * MOBILE_SIDER_WIDTH_RATIO))
      )
    : desktopSiderWidth;
  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);
  useEffect(() => {
    desktopSiderWidthRef.current = desktopSiderWidth;
  }, [desktopSiderWidth]);

  const beginSiderResizeDrag = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isMobile) return;
      event.preventDefault();
      dragStateRef.current = {
        active: true,
        startX: event.clientX,
        startWidth: collapsedRef.current ? 0 : desktopSiderWidthRef.current,
      };
      setSiderDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [isMobile]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState.active) return;

      const rawWidth = dragState.startWidth + (event.clientX - dragState.startX);

      if (rawWidth < SIDER_COLLAPSE_THRESHOLD) {
        if (!collapsedRef.current) {
          setCollapsed(true);
        }
        return;
      }

      const clamped = Math.min(SIDER_MAX_WIDTH, Math.max(SIDER_MIN_WIDTH, rawWidth));
      if (collapsedRef.current) {
        setCollapsed(false);
      }
      if (clamped !== desktopSiderWidthRef.current) {
        setDesktopSiderWidth(clamped);
      }
    };

    const endDrag = () => {
      if (!dragStateRef.current.active) return;
      dragStateRef.current.active = false;
      setSiderDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (!collapsedRef.current) {
        persistSiderWidth(desktopSiderWidthRef.current);
      }
    };

    const handleBlur = () => endDrag();
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('blur', handleBlur);
      endDrag();
    };
  }, []);

  const siderStyle = isMobile
    ? {
        position: 'fixed' as const,
        left: 0,
        zIndex: 100,
        transform: collapsed ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'none',
        pointerEvents: collapsed ? ('none' as const) : ('auto' as const),
      }
    : {
        position: 'relative' as const,
        overflow: 'visible' as const,
      };

  return (
    <LayoutContext.Provider
      value={{
        isMobile,
        siderCollapsed: collapsed,
        setSiderCollapsed: setCollapsed,
        siderWidth: isMobile ? 0 : desktopSiderWidth,
        siderIconOnly: !isMobile && !collapsed && desktopSiderWidth < SIDER_ICON_ONLY_THRESHOLD,
        conversationPaneCollapsed,
        setConversationPaneCollapsed,
      }}
    >
      <NavigationHistoryProvider>
        <TerminalPanelProvider>
          <LayoutModeProvider isMobile={isMobile} editorAvailable={!isMobile} diffAvailable={!isMobile}>
            <div className='app-shell flex flex-col size-full min-h-0' role='application'>
              <LayoutModeOrchestrator setCollapsed={setCollapsed} isDesktop={!isMobile} />
              <Titlebar workspaceAvailable={workspaceAvailable} />
              {/* 移动端左侧边栏蒙板 / Mobile left sider backdrop */}
              {isMobile && !collapsed && (
                <div className='fixed inset-0 bg-black/30 z-90' onClick={() => setCollapsed(true)} aria-hidden='true' />
              )}

              <ArcoLayout className={'size-full layout flex-1 min-h-0'}>
                <ArcoLayout.Sider
                  collapsedWidth={isMobile ? 0 : 0}
                  collapsed={collapsed}
                  width={siderWidth}
                  className={classNames('!bg-2 layout-sider', {
                    collapsed: collapsed,
                    'layout-sider--dragging': siderDragging,
                    'layout-sider--icon-only': !isMobile && !collapsed && desktopSiderWidth < SIDER_ICON_ONLY_THRESHOLD,
                  })}
                  style={siderStyle}
                >
                  <div
                    role='navigation'
                    data-layout-region='sider'
                    tabIndex={-1}
                    className='size-full flex flex-col min-h-0'
                  >
                    {isMobile && !collapsed ? (
                      <ArcoLayout.Header
                        className={classNames(
                          'flex items-center justify-end pt-6px pb-6px pl-10px pr-8px gap-8px layout-sider-header layout-sider-header--mobile'
                        )}
                      >
                        <button
                          type='button'
                          className='app-titlebar__button app-titlebar__button--mobile'
                          onClick={() => setCollapsed(true)}
                          title={t('terminal.layout.regionSider', { defaultValue: 'Sidebar navigation' })}
                          aria-label={t('common.collapse', { defaultValue: 'Collapse' })}
                        >
                          <SidebarIcon size={18} strokeWidth={2.5} />
                        </button>
                      </ArcoLayout.Header>
                    ) : null}
                    <ArcoLayout.Content className='pt-0 px-4px pb-0 layout-sider-content'>
                      {React.isValidElement(sider)
                        ? React.cloneElement(sider, {
                            onSessionClick: () => {
                              cleanupSiderTooltips();
                              if (isMobile) setCollapsed(true);
                            },
                            collapsed,
                          } as any)
                        : sider}
                    </ArcoLayout.Content>
                    {!isMobile && (
                      <div
                        className='absolute top-0 h-full w-12px z-20 cursor-col-resize group flex items-center justify-center'
                        style={{ right: '-6px' }}
                        onMouseDown={beginSiderResizeDrag}
                        aria-hidden='true'
                        title='Drag to resize sidebar'
                      >
                        <div
                          className={classNames(
                            'pointer-events-none block h-full w-2px bg-bg-3 opacity-90 rd-full transition-all duration-150 group-hover:w-6px group-hover:bg-brand group-active:w-6px group-active:bg-brand',
                            siderDragging && '!w-6px !bg-brand'
                          )}
                        />
                      </div>
                    )}
                  </div>
                </ArcoLayout.Sider>

                <ArcoLayout.Content
                  className={'bg-1 layout-content flex flex-col min-h-0'}
                  onClick={() => {
                    if (isMobile && !collapsed) setCollapsed(true);
                  }}
                  style={
                    isMobile
                      ? {
                          width: '100%',
                        }
                      : undefined
                  }
                >
                  <div role='main' data-layout-region='content' tabIndex={-1} className='flex flex-col flex-1 min-h-0'>
                    <TerminalPanelHost isMobile={isMobile}>
                      <Outlet />
                    </TerminalPanelHost>
                    {directorySelectionContextHolder}
                    <PwaPullToRefresh />
                    <Suspense fallback={null}>
                      <UpdateModal />
                    </Suspense>
                  </div>
                </ArcoLayout.Content>

                {/* App-wide editor pane — only where ChatLayout isn't already
                    hosting one (i.e. not on conversation/team routes). Lets
                    Command Center open the editor on /guid and elsewhere. */}
                {!workspaceAvailable && !isMobile && (
                  <Suspense fallback={null}>
                    <EditorPane />
                  </Suspense>
                )}

                {/* Right-side conversation navigation pane — app-wide peer of
                    the main content (replaces the old left-Sider chat list).
                    Hidden on Settings routes. Visibility within an enabled
                    route is driven by LayoutContext.conversationPaneCollapsed. */}
                {conversationPaneEnabled && <ConversationPane />}
              </ArcoLayout>
            </div>
          </LayoutModeProvider>
        </TerminalPanelProvider>
      </NavigationHistoryProvider>
    </LayoutContext.Provider>
  );
};

export default Layout;
