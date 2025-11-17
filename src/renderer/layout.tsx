/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import PwaPullToRefresh from '@/renderer/components/PwaPullToRefresh';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { MenuFold, MenuUnfold } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { LayoutContext } from './context/LayoutContext';
import { useDirectorySelection } from './hooks/useDirectorySelection';
import { useMultiAgentDetection } from './hooks/useMultiAgentDetection';
import { iconColors } from './theme/colors';
import { processCustomCss } from './utils/customCssProcessor';

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

const DEFAULT_SIDER_WIDTH = 250;
const MOBILE_COLLAPSE_DURATION = 320;

const Layout: React.FC<{
  sider: React.ReactNode;
  onSessionClick?: () => void;
}> = ({ sider, onSessionClick }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [customCss, setCustomCss] = useState<string>('');
  const { onClick } = useDebug();
  const { contextHolder: multiAgentContextHolder } = useMultiAgentDetection();
  const { contextHolder: directorySelectionContextHolder } = useDirectorySelection();
  const collapsedRef = useRef(collapsed);
  // 自动/手动折叠的状态与定时器 / Timers & states for auto/manual sidebar folding
  const autoCollapseTimer = useRef<number | undefined>(undefined);
  const manualCollapseTimer = useRef<number | undefined>(undefined);
  const [autoCollapsing, setAutoCollapsing] = useState(false);
  const [manualCollapsing, setManualCollapsing] = useState(false);

  // 加载并监听自定义 CSS 配置 / Load & watch custom CSS configuration
  useEffect(() => {
    const loadCustomCss = () => {
      ConfigStorage.get('customCss')
        .then((css) => setCustomCss(css || ''))
        .catch((error) => {
          console.error('Failed to load custom CSS:', error);
        });
    };

    loadCustomCss();

    const handleCssUpdate = (event: CustomEvent) => {
      if (event.detail?.customCss !== undefined) {
        setCustomCss(event.detail.customCss || '');
      }
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key && event.key.includes('customCss')) {
        loadCustomCss();
      }
    };

    window.addEventListener('custom-css-updated', handleCssUpdate as EventListener);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('custom-css-updated', handleCssUpdate as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

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
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };

    // 初始检测
    checkMobile();

    // 监听窗口大小变化
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 进入移动端后触发自动折叠动画 / Auto-collapse when switching to mobile
  useEffect(() => {
    if (!isMobile || collapsedRef.current) {
      setAutoCollapsing(false);
      if (autoCollapseTimer.current !== undefined) {
        window.clearTimeout(autoCollapseTimer.current);
        autoCollapseTimer.current = undefined;
      }
      return;
    }

    setAutoCollapsing(true);
    if (autoCollapseTimer.current !== undefined) {
      window.clearTimeout(autoCollapseTimer.current);
    }
    autoCollapseTimer.current = window.setTimeout(() => {
      setAutoCollapsing(false);
      setCollapsed(true);
      autoCollapseTimer.current = undefined;
    }, MOBILE_COLLAPSE_DURATION);

    return () => {
      if (autoCollapseTimer.current !== undefined) {
        window.clearTimeout(autoCollapseTimer.current);
        autoCollapseTimer.current = undefined;
      }
    };
  }, [isMobile]);
  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  // 手动折叠时为内容提供淡出动画 / Provide fade-out when user collapses manually
  useEffect(() => {
    if (!collapsed) {
      setManualCollapsing(false);
      if (manualCollapseTimer.current !== undefined) {
        window.clearTimeout(manualCollapseTimer.current);
        manualCollapseTimer.current = undefined;
      }
      return;
    }

    setManualCollapsing(true);
    if (manualCollapseTimer.current !== undefined) {
      window.clearTimeout(manualCollapseTimer.current);
    }
    // Delay collapsing pointer events until fade-out completes / 延迟到淡出结束再关闭交互
    manualCollapseTimer.current = window.setTimeout(() => {
      setManualCollapsing(false);
      manualCollapseTimer.current = undefined;
    }, MOBILE_COLLAPSE_DURATION);

    return () => {
      if (manualCollapseTimer.current !== undefined) {
        window.clearTimeout(manualCollapseTimer.current);
        manualCollapseTimer.current = undefined;
      }
    };
  }, [collapsed]);
  return (
    <LayoutContext.Provider value={{ isMobile, siderCollapsed: collapsed, setSiderCollapsed: setCollapsed }}>
      <ArcoLayout className={'size-full layout'}>
        <ArcoLayout.Sider
          collapsedWidth={isMobile ? 0 : 64}
          collapsed={collapsed}
          width={DEFAULT_SIDER_WIDTH}
          className={classNames('!bg-2 layout-sider', {
            collapsed: collapsed,
            'layout-sider--folding': autoCollapsing || manualCollapsing,
          })}
          style={
            isMobile
              ? {
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  height: '100vh',
                  zIndex: 100,
                  transform: collapsed || autoCollapsing ? 'translateX(-100%)' : 'translateX(0)',
                  transition: `transform ${MOBILE_COLLAPSE_DURATION}ms ease`,
                  pointerEvents: collapsed || autoCollapsing ? 'none' : 'auto',
                }
              : undefined
          }
        >
          <ArcoLayout.Header
            className={classNames('flex items-center justify-start p-16px gap-12px pl-20px layout-sider-header', {
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
                <path d='M40 20 Q38 22 25 40 Q23 42 26 42 L30 42 Q32 40 40 30 Q48 40 50 42 L54 42 Q57 42 55 40 Q42 22 40 20' fill='white'></path>
                <circle cx='40' cy='46' r='3' fill='white'></circle>
                <path d='M18 50 Q40 70 62 50' stroke='white' strokeWidth='3.5' fill='none' strokeLinecap='round'></path>
              </svg>
            </div>
            <div className=' flex-1 text-20px collapsed-hidden font-bold'>AionUi</div>
            <MenuFold className='cursor-pointer !collapsed-hidden flex' theme='outline' size='24' fill={iconColors.secondary} strokeWidth={3} onClick={() => setCollapsed(true)} />
            {collapsed && !isMobile && (
              <div onClick={() => setCollapsed(false)} className='group-hover:opacity-100 absolute bg-2 left-8px top-7px transition-all duration-150 p-10px opacity-0'>
                <MenuUnfold className='cursor-pointer flex' size='24' fill={iconColors.secondary} strokeWidth={3} />
              </div>
            )}
          </ArcoLayout.Header>
          <ArcoLayout.Content className='h-[calc(100%-72px-16px)] p-8px layout-sider-content'>
            {React.isValidElement(sider)
              ? React.cloneElement(sider, {
                  onSessionClick: () => {
                    if (isMobile) setCollapsed(true);
                  },
                  collapsed,
                } as any)
              : sider}
          </ArcoLayout.Content>
        </ArcoLayout.Sider>

        <ArcoLayout.Content
          className={'bg-1 layout-content'}
          onClick={() => {
            if (isMobile && !collapsed) setCollapsed(true);
          }}
          style={
            isMobile
              ? {
                  width: '100vw',
                }
              : undefined
          }
        >
          <Outlet></Outlet>
          {multiAgentContextHolder}
          {directorySelectionContextHolder}
          <PwaPullToRefresh />
        </ArcoLayout.Content>
      </ArcoLayout>
    </LayoutContext.Provider>
  );
};

export default Layout;
