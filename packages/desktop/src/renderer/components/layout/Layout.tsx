/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import PwaPullToRefresh from '@/renderer/components/layout/PwaPullToRefresh';
import Titlebar from '@/renderer/components/layout/Titlebar';
import { Layout as ArcoLayout, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { setGlobalNavigate } from '@/renderer/utils/navigation';
import { usePreviewContext } from '@renderer/pages/conversation/Preview';
import { ProjectPanelHost } from '@renderer/components/layout/ProjectPanelHost';
import { ProjectPanelMobileOverlay } from '@renderer/components/layout/ProjectPanelMobileOverlay';
import { setCurrentProject, useCurrentProject } from '@renderer/pages/conversation/explorer/currentProjectStore';
import { setCurrentConversation } from '@renderer/pages/conversation/explorer/currentConversationStore';
import { useContainerWidth } from '@renderer/pages/conversation/hooks/useContainerWidth';
import { useProjectExplorerColumnWidth } from '@renderer/hooks/ui/useProjectExplorerColumnWidth';
import { useProjectPreviewRegionWidth } from '@renderer/hooks/ui/useProjectPreviewRegionWidth';
import { useProjectPanelCollapse } from '@renderer/hooks/ui/useProjectPanelCollapse';
import { dispatchWorkspaceToggleEvent } from '@renderer/utils/workspace/workspaceEvents';
import { MIN_PREVIEW_PANEL_PX } from '@renderer/pages/conversation/utils/layoutCalc';
import { PreviewPanel } from '@renderer/pages/conversation/Preview';
import { LayoutContext } from '@renderer/hooks/context/LayoutContext';
import { NavigationHistoryProvider } from '@renderer/hooks/context/NavigationHistoryContext';
import { useDeepLink } from '@renderer/hooks/system/useDeepLink';
import { useNotificationClick } from '@renderer/hooks/system/notification/useNotificationClick';
import { useBrowserNotification } from '@renderer/hooks/system/notification/useBrowserNotification';
import { useDesktopTurnNotification } from '@renderer/hooks/system/notification/useDesktopTurnNotification';
import { cleanupSiderTooltips } from '@renderer/utils/ui/siderTooltip';
import { useConversationShortcuts } from '@renderer/hooks/ui/useConversationShortcuts';
import { isElectronDesktop } from '@renderer/utils/platform';
import { IS_DISCONTINUED_BUILD } from '@/renderer/utils/discontinuedBuild';
import UpdateMigrationDialog from '@/renderer/components/settings/UpdateMigrationDialog';
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

const useDebug = () => {
  const [count, setCount] = useState(0);
  const timer = useRef<any>(null);
  const onClick = () => {
    const open = () => {
      ipcBridge.application.openDevTools.invoke().catch((error) => {
        console.error('Failed to open dev tools:', error);
      });
      setCount(0);
    };
    if (count >= 3) {
      return open();
    }
    setCount((prev) => {
      if (prev >= 2) {
        open();
        return 0;
      }
      return prev + 1;
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      clearTimeout(timer.current);
      setCount(0);
    }, 1000);
  };

  return { onClick };
};

const UpdateModal = React.lazy(() => import('@/renderer/components/settings/UpdateModal'));

const DEFAULT_SIDER_WIDTH = 260;
const DESKTOP_COLLAPSED_WIDTH = 0;
const SIDER_DRAG_SNAP_THRESHOLD = Math.round((DEFAULT_SIDER_WIDTH + DESKTOP_COLLAPSED_WIDTH) / 2);
const SIDER_DRAG_HYSTERESIS = 6;
const MOBILE_SIDER_WIDTH_RATIO = 0.67;
const MOBILE_SIDER_MIN_WIDTH = 260;
const MOBILE_SIDER_MAX_WIDTH = 420;

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
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 390 : window.innerWidth
  );
  const { onClick } = useDebug();
  useDeepLink();
  useNotificationClick();
  useBrowserNotification();
  useDesktopTurnNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const workspaceAvailable =
    location.pathname.startsWith('/conversation/') || (TEAM_MODE_ENABLED && location.pathname.startsWith('/team/'));
  const toggleSider = useCallback(() => {
    setCollapsed((previous) => !previous);
  }, []);
  useConversationShortcuts({ navigate, toggleSider });
  // Expose navigate to code running outside the Router tree (e.g. the globally
  // mounted FeedbackReportModal's "via chat" action).
  useEffect(() => {
    setGlobalNavigate(navigate);
    return () => setGlobalNavigate(null);
  }, [navigate]);
  const { t } = useTranslation();
  // The "AionUi" wordmark acts as Home / Back-to-Chat, but only from settings routes.
  // In non-settings routes the user is already "home", so it is a no-op (and not actionable).
  const isSettingsRoute = location.pathname.startsWith('/settings');
  // Only wired to the wordmark in the isSettingsRoute branch below, so the
  // "no-op outside settings" contract is enforced structurally — no internal
  // route guard needed (the chat-route wordmark is a plain, inert div).
  const handleBrandHome = useCallback(() => {
    // Mirror Titlebar's handleBackToChat convention: return to the last non-settings path.
    let target: string | null = null;
    try {
      target = sessionStorage.getItem('aion:last-non-settings-path');
    } catch {
      // ignore
    }
    if (target && !target.startsWith('/settings')) {
      void navigate(target);
      return;
    }
    void navigate('/guid');
  }, [navigate]);
  // Close preview whenever the user leaves the conversation route entirely
  // (e.g. switches to a team, /guid, or settings). Within /conversation/:id
  // the finer-grained closePreviewIfScopeChanged in conversation/index.tsx
  // handles scope changes, so we only need to act here on route-type changes.
  // Use closePreview directly — closePreviewIfScopeChanged skips the call
  // when lastScopeRef is already null (e.g. on team routes where it was
  // never updated), which would leave the panel open.
  const { closePreview: closePreviewOnRouteChange, isOpen: isPreviewOpen } = usePreviewContext();
  // Layout-level explorer column width engine (stage3 FULL / P2): measure the
  // [content | explorer] row, clamp the explorer width so chat (+ preview) keep
  // their reserve. Active only when a project is bound and on desktop.
  const currentProject = useCurrentProject();
  const { containerRef: mainRowRef, containerWidth: mainRowWidth } = useContainerWidth();
  const explorerActive = Boolean(currentProject) && !isMobile;
  const { widthPx: explorerWidthPx, createDragHandle: createExplorerDragHandle } = useProjectExplorerColumnWidth(
    mainRowWidth,
    isPreviewOpen,
    explorerActive
  );
  // P3: host-level collapse (project-scoped on desktop; overlay on mobile). The
  // explorer stays mounted (width 0) on collapse, so it is not remounted.
  const { collapsed: explorerCollapsed } = useProjectPanelCollapse({
    projectId: currentProject,
    isMobile,
    active: Boolean(currentProject),
  });
  const toggleExplorer = useCallback(() => {
    dispatchWorkspaceToggleEvent();
  }, []);
  // Mobile overlay width: most of the viewport, capped.
  const explorerMobileWidthPx = Math.min(420, Math.max(280, Math.round(viewportWidth * 0.85)));
  // P4 (②B): hoist the preview region to the Layout host for project
  // conversations so it is structurally persistent (no remount on same-project
  // switches). ChatLayout renders chat only in that case (previewHosted).
  const previewRegionActive = Boolean(currentProject) && !isMobile && isPreviewOpen;
  const { widthPx: previewWidthPx, createDragHandle: createPreviewRegionDragHandle } = useProjectPreviewRegionWidth(
    mainRowWidth,
    explorerCollapsed ? 0 : explorerWidthPx,
    previewRegionActive
  );
  const routeLayoutMountedRef = useRef(false);
  useEffect(() => {
    if (!routeLayoutMountedRef.current) {
      routeLayoutMountedRef.current = true;
      return; // skip initial mount — preview starts closed, don't wipe persisted tabs
    }
    if (!workspaceAvailable) {
      closePreviewOnRouteChange();
      // Leaving every project-bearing route (conversation + team) → no active
      // project → hide the Explorer host. Within /conversation/* and /team/* the
      // route itself publishes project_id, so we only clear when leaving both.
      setCurrentProject(null);
    }
    // The active-conversation target is published by the conversation route
    // (mounted conversation) and the team route (active member column). Clear it
    // only when leaving both, so a stale target can't leak to a non-chat route.
    if (!workspaceAvailable) {
      setCurrentConversation(null);
    }
  }, [location.pathname, workspaceAvailable, closePreviewOnRouteChange]);

  const collapsedRef = useRef(collapsed);
  const dragStateRef = useRef<{ active: boolean; startX: number; startWidth: number }>({
    active: false,
    startX: 0,
    startWidth: DEFAULT_SIDER_WIDTH,
  });

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
      const result = await ipcBridge.task.stopAll.invoke();
      if (result?.success) {
        // Navigate to settings page to show task status
        void navigate('/settings/system');
      }
    };

    // Handle check update request from tray / 托盘请求检查更新
    const handleCheckUpdate = () => {
      window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'tray' } }));
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
    : DEFAULT_SIDER_WIDTH;
  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  const beginSiderResizeDrag = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isMobile) return;
      event.preventDefault();
      dragStateRef.current = {
        active: true,
        startX: event.clientX,
        startWidth: collapsedRef.current ? DESKTOP_COLLAPSED_WIDTH : DEFAULT_SIDER_WIDTH,
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [isMobile]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState.active) return;

      const draggedWidth = dragState.startWidth + (event.clientX - dragState.startX);
      // Add a small hysteresis zone to avoid rapid toggling near the snap threshold.
      const shouldCollapse = collapsedRef.current
        ? draggedWidth < SIDER_DRAG_SNAP_THRESHOLD + SIDER_DRAG_HYSTERESIS
        : draggedWidth <= SIDER_DRAG_SNAP_THRESHOLD - SIDER_DRAG_HYSTERESIS;
      if (shouldCollapse !== collapsedRef.current) {
        setCollapsed(shouldCollapse);
      }
    };

    const endDrag = () => {
      if (!dragStateRef.current.active) return;
      dragStateRef.current.active = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
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
    <LayoutContext.Provider value={{ isMobile, siderCollapsed: collapsed, setSiderCollapsed: setCollapsed }}>
      <NavigationHistoryProvider>
        <div className='app-shell flex flex-col size-full min-h-0'>
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
              })}
              style={siderStyle}
            >
              <ArcoLayout.Header
                className={classNames(
                  'flex items-center justify-start pt-8px pb-8px ps-18px pe-16px gap-12px layout-sider-header',
                  isMobile && 'layout-sider-header--mobile',
                  {
                    'cursor-pointer group ': collapsed,
                  }
                )}
              >
                <div
                  className={classNames('bg-black shrink-0 size-32px relative rd-0.5rem', {
                    '!size-24px': collapsed,
                  })}
                  onClick={onClick}
                >
                  <svg
                    className={classNames('w-5.5 h-5.5 absolute inset-0 m-auto', {
                      'scale-140': !collapsed,
                    })}
                    viewBox='0 0 80 80'
                    fill='none'
                  >
                    <path
                      key='logo-path-1'
                      d='M40 20 Q38 22 25 40 Q23 42 26 42 L30 42 Q32 40 40 30 Q48 40 50 42 L54 42 Q57 42 55 40 Q42 22 40 20'
                      fill='white'
                    ></path>
                    <circle key='logo-circle' cx='40' cy='46' r='3' fill='white'></circle>
                    <path
                      key='logo-path-2'
                      d='M18 50 Q40 70 62 50'
                      stroke='white'
                      strokeWidth='3.5'
                      fill='none'
                      strokeLinecap='round'
                    ></path>
                  </svg>
                </div>
                {isSettingsRoute ? (
                  <Tooltip content={t('common.back', { defaultValue: 'Back to Chat' })} position='bottom'>
                    <div
                      className='text-16px text-t-primary collapsed-hidden font-semibold cursor-pointer'
                      role='button'
                      tabIndex={0}
                      aria-label={t('common.back', { defaultValue: 'Back to Chat' })}
                      onClick={handleBrandHome}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleBrandHome();
                        }
                      }}
                    >
                      AionUi
                    </div>
                  </Tooltip>
                ) : (
                  <div className='text-16px text-t-primary collapsed-hidden font-semibold'>AionUi</div>
                )}
                {isMobile && !collapsed && (
                  <button
                    type='button'
                    className='app-titlebar__button app-titlebar__button--mobile'
                    onClick={() => setCollapsed(true)}
                    title='Collapse sidebar'
                    aria-label='Collapse sidebar'
                  >
                    <SidebarIcon size={18} strokeWidth={2.5} />
                  </button>
                )}
                {/* 侧栏折叠改由标题栏统一控制 / Sidebar folding handled by Titlebar toggle */}
              </ArcoLayout.Header>
              <ArcoLayout.Content className='pt-0 px-8px pb-0 layout-sider-content'>
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
                  className='absolute top-0 h-full w-8px z-20 cursor-col-resize group'
                  style={{ right: '-4px' }}
                  onMouseDown={beginSiderResizeDrag}
                  aria-hidden='true'
                >
                  <div className='absolute top-0 left-1/2 h-full w-1px -translate-x-1/2 bg-transparent group-hover:bg-[var(--color-border-2)] transition-colors duration-150' />
                </div>
              )}
            </ArcoLayout.Sider>

            {/* Content + project Explorer share one measured flex row (stage3
                FULL / P2). `mainRowRef` gives the [content|explorer] width for the
                explorer clamp (independent of the split → non-circular). The
                explorer column is a sibling of the route content, above the
                per-conversation subtree → persists across same-project switches. */}
            <div ref={mainRowRef} className='flex flex-1 min-h-0 overflow-hidden'>
              <ArcoLayout.Content
                className={'bg-1 layout-content flex flex-col min-h-0 flex-1'}
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
                <Outlet />
                <PwaPullToRefresh />
                <Suspense fallback={null}>
                  <UpdateModal />
                </Suspense>
                {IS_DISCONTINUED_BUILD && <UpdateMigrationDialog />}
              </ArcoLayout.Content>
              {/* Hoisted preview region (project conversations only). Structurally
                  persistent: lives above the per-conversation subtree, so a
                  same-project conversation switch does not remount it. */}
              {previewRegionActive && (
                <div
                  data-project-preview-region
                  className='preview-panel flex flex-col relative overflow-visible'
                  style={{
                    width: `${Math.round(previewWidthPx)}px`,
                    flexGrow: 0,
                    flexShrink: 0,
                    // 只保留左边框作为与会话区的分界；上/右/下不留边距，
                    // 否则窗口底色会从缝隙里透出来（深色模式下尤其突兀）。
                    // Left border only, as the divider from the chat area. No outer
                    // margins: any gap would expose the window's own background,
                    // which is jarring in dark mode.
                    borderLeft: '1px solid var(--bg-3)',
                    minWidth: `${MIN_PREVIEW_PANEL_PX}px`,
                    boxSizing: 'border-box',
                  }}
                >
                  {createPreviewRegionDragHandle({
                    className: 'absolute top-0 bottom-0 z-30',
                    style: { width: '20px', left: '-20px' },
                    reverse: true,
                    linePlacement: 'end',
                    lineClassName: 'opacity-30 group-hover:opacity-100 group-active:opacity-100',
                    lineStyle: { width: '2px' },
                  })}
                  <div className='h-full w-full overflow-hidden'>
                    <PreviewPanel />
                  </div>
                </div>
              )}
              {!isMobile && (
                <ProjectPanelHost
                  widthPx={explorerWidthPx}
                  collapsed={explorerCollapsed}
                  dragHandle={createExplorerDragHandle({
                    className: 'absolute start-0 top-0 bottom-0 z-20',
                    reverse: true,
                  })}
                />
              )}
            </div>

            {/* Mobile overlay: backdrop + fixed panel + floating collapse handle. */}
            {isMobile && Boolean(currentProject) && (
              <ProjectPanelMobileOverlay
                projectId={currentProject as string}
                collapsed={explorerCollapsed}
                onCollapse={toggleExplorer}
                widthPx={explorerMobileWidthPx}
              />
            )}
          </ArcoLayout>
        </div>
      </NavigationHistoryProvider>
    </LayoutContext.Provider>
  );
};

export default Layout;
