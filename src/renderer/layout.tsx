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

  // 加载自定义 CSS 配置 / Load custom CSS configuration
  useEffect(() => {
    const loadCustomCss = () => {
      ConfigStorage.get('customCss')
        .then((css) => {
          setCustomCss(css || '');
        })
        .catch((error) => {
          console.error('Failed to load custom CSS:', error);
        });
    };

    // 初始加载 / Initial load
    loadCustomCss();

    // 监听自定义 CSS 更新事件（同一窗口）/ Listen to custom CSS update event (same window)
    const handleCssUpdate = (e: CustomEvent) => {
      if (e.detail?.customCss !== undefined) {
        setCustomCss(e.detail.customCss || '');
      }
    };

    // 监听 storage 变化（跨窗口）/ Listen to storage changes (cross-window)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && e.key.includes('customCss')) {
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

  // 注入自定义 CSS 到页面 / Inject custom CSS to page
  useEffect(() => {
    if (!customCss) {
      // 如果没有自定义 CSS，移除已存在的元素
      const existingElement = document.getElementById('user-defined-custom-css');
      if (existingElement) {
        existingElement.remove();
      }
      return;
    }

    // 使用统一的 CSS 处理工具
    const wrappedCss = processCustomCss(customCss);

    // 确保样式始终在 head 的最后 / Ensure style is always at the end of head
    const ensureStyleAtEnd = () => {
      let customCssElement = document.getElementById('user-defined-custom-css') as HTMLStyleElement;

      // 检查元素是否已经存在且内容正确
      if (customCssElement && customCssElement.textContent === wrappedCss) {
        // 如果元素已经是 head 的最后一个子元素，不需要操作
        if (customCssElement === document.head.lastElementChild) {
          return;
        }
      }

      // 移除已存在的元素
      if (customCssElement) {
        customCssElement.remove();
      }

      // 创建新的 style 元素
      customCssElement = document.createElement('style');
      customCssElement.id = 'user-defined-custom-css';
      customCssElement.type = 'text/css';
      customCssElement.textContent = wrappedCss;

      // 插入到 head 的最后
      document.head.appendChild(customCssElement);
    };

    // 初始注入
    ensureStyleAtEnd();

    // 使用 MutationObserver 监听 head 的变化
    // 当有新的样式被注入时，确保我们的样式始终在最后
    const observer = new MutationObserver((mutations) => {
      // 检查是否有新的 style 或 link 元素被添加到 head
      const hasNewStyleElements = mutations.some((mutation) => {
        return Array.from(mutation.addedNodes).some((node) => {
          return node.nodeName === 'STYLE' || node.nodeName === 'LINK';
        });
      });

      if (hasNewStyleElements) {
        const customElement = document.getElementById('user-defined-custom-css');
        // 如果我们的样式不在最后，重新移到最后
        if (customElement && customElement !== document.head.lastElementChild) {
          ensureStyleAtEnd();
        }
      }
    });

    // 开始观察 head 元素的子元素变化
    observer.observe(document.head, {
      childList: true,
      subtree: false,
    });

    // 清理函数 / Cleanup function
    return () => {
      observer.disconnect();
      const element = document.getElementById('user-defined-custom-css');
      if (element) {
        element.remove();
      }
    };
  }, [customCss]);

  // 检测移动端并响应窗口大小变化
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(true);
      }
    };

    // 初始检测
    checkMobile();

    // 监听窗口大小变化
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  return (
    <LayoutContext.Provider value={{ isMobile, siderCollapsed: collapsed, setSiderCollapsed: setCollapsed }}>
      <ArcoLayout className={'size-full layout'}>
        <ArcoLayout.Sider
          collapsedWidth={isMobile ? 0 : 64}
          collapsed={collapsed}
          width={250}
          className={classNames('!bg-2 layout-sider', {
            collapsed: collapsed,
          })}
          style={
            isMobile
              ? {
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  height: '100vh',
                  zIndex: 100,
                  transform: collapsed ? 'translateX(-100%)' : 'translateX(0)',
                  transition: 'transform 0.3s ease',
                  pointerEvents: collapsed ? 'none' : 'auto',
                }
              : undefined
          }
        >
            })}
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
                  marginLeft: 0,
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
                  marginLeft: 0,
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
