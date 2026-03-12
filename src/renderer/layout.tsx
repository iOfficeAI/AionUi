/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage, type ICssTheme } from '@/common/storage';
import PwaPullToRefresh from '@/renderer/components/PwaPullToRefresh';
import Titlebar from '@/renderer/components/Titlebar';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { MenuFold, MenuUnfold } from '@icon-park/react';
import classNames from 'classnames';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LayoutContext } from './context/LayoutContext';
import { useDeepLink } from './hooks/useDeepLink';
import { useDirectorySelection } from './hooks/useDirectorySelection';
import { useMultiAgentDetection } from './hooks/useMultiAgentDetection';
import { processCustomCss } from './utils/customCssProcessor';
import { cleanupSiderTooltips } from './utils/siderTooltip';
import { isElectronDesktop } from './utils/platform';
import { computeCssSyncDecision, resolveCssByActiveTheme } from './utils/themeCssSync';

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

const UpdateModal = React.lazy(() => import('@/renderer/components/UpdateModal'));

const DEFAULT_SIDER_WIDTH = 250;
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
  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window === 'undefined' ? 390 : window.innerWidth));
  const [customCss, setCustomCss] = useState<string>('');
  const [shouldMountUpdateModal, setShouldMountUpdateModal] = useState(false);
  const { onClick } = useDebug();
  const { contextHolder: multiAgentContextHolder } = useMultiAgentDetection();
  const { contextHolder: directorySelectionContextHolder } = useDirectorySelection();
  useDeepLink();
  const location = useLocation();
  const workspaceAvailable = location.pathname.startsWith('/conversation/');
  const collapsedRef = useRef(collapsed);
  const lastCssRef = useRef('');
  const lastUiCssUpdateAtRef = useRef(0);

  const loadAndHealCustomCss = useCallback(async () => {
    try {
      const [savedCssRaw, activeThemeId, savedThemes] = await Promise.all([ConfigStorage.get('customCss'), ConfigStorage.get('css.activeThemeId'), ConfigStorage.get('css.themes')]);

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
      // (but it no longer matches any known theme), fall back to default and persist.
      if (!effectiveCss && activeThemeId && activeThemeId !== 'default-theme') {
        const defaultCss = resolveCssByActiveTheme('default-theme', (savedThemes || []) as ICssTheme[]);
        effectiveCss = defaultCss;
        // Persist the fallback so Layout doesn't keep retrying
        await Promise.all([ConfigStorage.set('css.activeThemeId', 'default-theme'), ConfigStorage.set('customCss', effectiveCss)]).catch((error) => {
          console.warn('Failed to persist theme fallback:', error);
        });
      } else if (decision.shouldHealStorage) {
        await ConfigStorage.set('customCss', effectiveCss).catch((error) => {
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
      const hasNewStyle = mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => node.nodeName === 'STYLE' || node.nodeName === 'LINK'));

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

  const siderWidth = isMobile ? Math.max(MOBILE_SIDER_MIN_WIDTH, Math.min(MOBILE_SIDER_MAX_WIDTH, Math.round(viewportWidth * MOBILE_SIDER_WIDTH_RATIO))) : DEFAULT_SIDER_WIDTH;
  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);
  return (
    <LayoutContext.Provider value={{ isMobile, siderCollapsed: collapsed, setSiderCollapsed: setCollapsed }}>
      <div className='app-shell flex flex-col size-full min-h-0'>
        <Titlebar workspaceAvailable={workspaceAvailable} />
        {/* 移动端左侧边栏蒙板 / Mobile left sider backdrop */}
        {isMobile && !collapsed && <div className='fixed inset-0 bg-black/30 z-90' onClick={() => setCollapsed(true)} aria-hidden='true' />}

        <ArcoLayout className={'size-full layout flex-1 min-h-0'}>
          <ArcoLayout.Sider
            collapsedWidth={isMobile ? 0 : 64}
            collapsed={collapsed}
            width={siderWidth}
            className={classNames('!bg-2 layout-sider', {
              collapsed: collapsed,
            })}
            style={
              isMobile
                ? {
                    position: 'fixed',
                    left: 0,
                    zIndex: 100,
                    transform: collapsed ? 'translateX(-100%)' : 'translateX(0)',
                    transition: 'none',
                    pointerEvents: collapsed ? 'none' : 'auto',
                  }
                : undefined
            }
          >
            <ArcoLayout.Header
              className={classNames('flex items-center justify-start py-10px px-16px pl-20px gap-12px layout-sider-header', isMobile && 'layout-sider-header--mobile', {
                'cursor-pointer group ': collapsed,
              })}
            >
              <div
                className={classNames('bg-black shrink-0 size-40px relative rd-0.5rem', {
                  '!size-24px': collapsed,
                })}
                onClick={onClick}
              >
                <svg
                  className={classNames('w-5.5 h-5.5 absolute inset-0 m-auto', {
                    ' scale-140': !collapsed,
                  })}
                  viewBox='0 0 80 80'
                  fill='none'
                >
                  <path key='logo-path-1' d='M40 20 Q38 22 25 40 Q23 42 26 42 L30 42 Q32 40 40 30 Q48 40 50 42 L54 42 Q57 42 55 40 Q42 22 40 20' fill='white'></path>
                  <circle key='logo-circle' cx='40' cy='46' r='3' fill='white'></circle>
                  <path key='logo-path-2' d='M18 50 Q40 70 62 50' stroke='white' strokeWidth='3.5' fill='none' strokeLinecap='round'></path>
                </svg>
              </div>
              <div className='flex-1 text-20px text-1 collapsed-hidden font-bold'>AionUi</div>
              {isMobile && !collapsed && (
                <button type='button' className='app-titlebar__button' onClick={() => setCollapsed(true)} aria-label='Collapse sidebar'>
                  {collapsed ? <MenuUnfold theme='outline' size='18' fill='currentColor' /> : <MenuFold theme='outline' size='18' fill='currentColor' />}
                </button>
              )}
              {/* 侧栏折叠改由标题栏统一控制 / Sidebar folding handled by Titlebar toggle */}
            </ArcoLayout.Header>
            <ArcoLayout.Content className={classNames('p-8px layout-sider-content', !isMobile && 'h-[calc(100%-72px-16px)]')}>
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
            <Outlet />
            {multiAgentContextHolder}
            {directorySelectionContextHolder}
            <PwaPullToRefresh />
            <Suspense fallback={null}>
              <UpdateModal />
            </Suspense>
          </ArcoLayout.Content>
        </ArcoLayout>
      </div>
    </LayoutContext.Provider>
  );
};

export default Layout;
