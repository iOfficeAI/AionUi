/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { MenuFold, MenuUnfold } from '@icon-park/react';
import classNames from 'classnames';
import React, { useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
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
  const { onClick } = useDebug();
  const { contextHolder: multiAgentContextHolder } = useMultiAgentDetection();
  const { contextHolder: directorySelectionContextHolder } = useDirectorySelection();

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
    <ArcoLayout className={'size-full layout'}>
      <ArcoLayout.Sider
        collapsedWidth={isMobile ? 0 : 64}
        collapsed={collapsed}
        width={250}
        className={classNames('!bg-2 layout-sider', {
          collapsed: collapsed,
        })}
      >
        <ArcoLayout.Header
          className={classNames('flex items-center justify-start p-16px gap-12px pl-20px layout-sider-header', {
            'cursor-pointer group ': collapsed,
          })}
        >
          <div
            className={classNames('bg-#000 shrink-0 size-40px relative rd-0.5rem ', {
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
              } as any)
            : sider}
        </ArcoLayout.Content>
      </ArcoLayout.Sider>

      {/* 移动端toggle按钮 - 与header对齐，调整到与右侧按钮相同大小 */}
      {isMobile && (
        <button onClick={() => setCollapsed(!collapsed)} className='mobile-toggle-btn fixed top-0 left-0 z-50 bg-transparent w-16 h-16 flex items-center justify-center text-gray-600 hover:text-gray-800 transition-all duration-200'>
          {collapsed ? <MenuUnfold theme='outline' size={24} fill={iconColors.secondary} strokeWidth={3} /> : <MenuFold theme='outline' size={24} fill={iconColors.secondary} strokeWidth={3} />}
        </button>
      )}

      <ArcoLayout.Content className={'bg-1 layout-content'}>
        <Outlet></Outlet>
        {multiAgentContextHolder}
        {directorySelectionContextHolder}
      </ArcoLayout.Content>
    </ArcoLayout>
  );
};

export default Layout;
