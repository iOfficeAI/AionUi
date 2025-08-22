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
import { useThemeClasses, useThemeColors, useTextColor } from './themes/index';

const useDebug = () => {
  const [count, setCount] = useState(0);
  const timer = useRef<any>(null);
  const onClick = () => {
    const open = () => {
      ipcBridge.application.openDevTools.invoke();
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
}> = ({ sider }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { onClick } = useDebug();
  const themeClasses = useThemeClasses();
  const themeColors = useThemeColors();
  const getTextColor = useTextColor();

  return (
    <ArcoLayout className={'size-full'}>
      <ArcoLayout.Sider
        collapsedWidth={64}
        collapsed={collapsed}
        width={250}
        className={classNames(themeClasses.sidebarBackground, {
          collapsed: collapsed,
        })}
        style={{ backgroundColor: themeColors.sidebarBackground }}
      >
        <ArcoLayout.Header
          className={classNames('flex items-center justify-start p-16px gap-12px pl-20px', {
            'cursor-pointer group ': collapsed,
          })}
          style={{ backgroundColor: themeColors.sidebarBackground }}
        >
          <div
            className={classNames('shrink-0 size-40px relative rd-0.5rem', {
              '!size-24px': collapsed,
            })}
            style={{ backgroundColor: themeColors.logoBackground }}
            onClick={onClick}
          >
            <svg
              className={classNames('w-5.5 h-5.5 absolute inset-0 m-auto', {
                ' scale-140': !collapsed,
              })}
              viewBox='0 0 80 80'
              fill='none'
            >
              <path d='M40 20 Q38 22 25 40 Q23 42 26 42 L30 42 Q32 40 40 30 Q48 40 50 42 L54 42 Q57 42 55 40 Q42 22 40 20' fill={themeColors.logoForeground}></path>
              <circle cx='40' cy='46' r='3' fill={themeColors.logoForeground}></circle>
              <path d='M18 50 Q40 70 62 50' stroke={themeColors.logoForeground} strokeWidth='3.5' fill='none' strokeLinecap='round'></path>
            </svg>
          </div>
          <div className='flex-1 text-20px collapsed-hidden font-bold' style={{ color: getTextColor('app.title', 'textPrimary') }}>
            AionUi
          </div>
          <MenuFold className='cursor-pointer !collapsed-hidden flex' theme='outline' size='24' fill={themeColors.textSecondary} strokeWidth={3} onClick={() => setCollapsed(true)} />
          {collapsed && (
            <div onClick={() => setCollapsed(false)} className='group-hover:opacity-100 absolute left-8px top-7px transition-all duration-150 p-10px opacity-0' style={{ backgroundColor: themeColors.sidebarBackground }}>
              <MenuUnfold className='cursor-pointer flex' size='24' fill={themeColors.textSecondary} strokeWidth={3} />
            </div>
          )}
        </ArcoLayout.Header>
        <ArcoLayout.Content className='h-[calc(100%-72px-16px)] p-8px'>{sider}</ArcoLayout.Content>
      </ArcoLayout.Sider>
      <ArcoLayout.Content className={themeClasses.background} style={{ backgroundColor: themeColors.background, color: themeColors.textPrimary }}>
        <Outlet></Outlet>
      </ArcoLayout.Content>
    </ArcoLayout>
  );
};

export default Layout;
