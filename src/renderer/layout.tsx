/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useCallback, useEffect } from "react";
import { Layout as ArcoLayout } from "@arco-design/web-react";
import {
  ExpandLeft,
  ExpandRight,
  MenuFold,
  MenuUnfold,
} from "@icon-park/react";
import classNames from "classnames";
import FlexFullContainer from "./components/FlexFullContainer";
import { ipcBridge } from "@/common";

// 右侧面板宽度配置
const RIGHT_SIDER_CONFIG = {
  DEFAULT_WIDTH: 266,
  MIN_WIDTH: 200,
  MAX_WIDTH: 500,
};

const useDebug = () => {
  const [count, setCount] = useState(0);
  const timer = useRef<any>(null);
  const onClick = () => {
    const open = () => {
      ipcBridge.openDevTools.invoke();
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
  children: React.ReactNode;
  rightSider?: React.ReactNode;
  rightSiderTitle: React.ReactNode;
  title: React.ReactNode;
}> = ({ sider, children, ...props }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(false);
  const [rightSiderWidth, setRightSiderWidth] = useState(RIGHT_SIDER_CONFIG.DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const { onClick } = useDebug();

  // 拖拽开始处理
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = rightSiderWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [rightSiderWidth]);

  // 拖拽过程处理
  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = dragStartX.current - e.clientX;
    const newWidth = Math.max(
      RIGHT_SIDER_CONFIG.MIN_WIDTH, 
      Math.min(RIGHT_SIDER_CONFIG.MAX_WIDTH, dragStartWidth.current + deltaX)
    );
    setRightSiderWidth(newWidth);
  }, [isDragging]);

  // 拖拽结束处理
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [isDragging]);

  // 监听全局鼠标事件
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  return (
    <ArcoLayout className={"size-full"}>
      <ArcoLayout.Sider
        collapsedWidth={64}
        collapsed={collapsed}
        width={250}
        className={classNames("!bg-#f2f3f5", {
          collapsed: collapsed,
        })}
      >
        <ArcoLayout.Header
          className={classNames(
            "flex items-center justify-start p-16px gap-12px pl-20px",
            {
              "cursor-pointer group ": collapsed,
            }
          )}
        >
          <div
            className={classNames(
              "bg-#000 shrink-0 size-40px relative rd-0.5rem ",
              {
                "!size-24px": collapsed,
              }
            )}
            onClick={onClick}
          >
            <svg
              className={classNames("w-5.5 h-5.5 absolute inset-0 m-auto", {
                " scale-140": !collapsed,
              })}
              viewBox="0 0 80 80"
              fill="none"
            >
              <path
                d="M40 20 Q38 22 25 40 Q23 42 26 42 L30 42 Q32 40 40 30 Q48 40 50 42 L54 42 Q57 42 55 40 Q42 22 40 20"
                fill="white"
              ></path>
              <circle cx="40" cy="46" r="3" fill="white"></circle>
              <path
                d="M18 50 Q40 70 62 50"
                stroke="white"
                stroke-width="3.5"
                fill="none"
                stroke-linecap="round"
              ></path>
            </svg>
          </div>
          <div className=" flex-1 text-20px collapsed-hidden font-bold">
            AionUi
          </div>
          <MenuFold
            className="cursor-pointer !collapsed-hidden flex"
            theme="outline"
            size="24"
            fill="#86909C"
            strokeWidth={3}
            onClick={() => setCollapsed(true)}
          />
          {collapsed && (
            <div
              onClick={() => setCollapsed(false)}
              className="group-hover:opacity-100 absolute bg-#f2f3f5 left-8px top-7px transition-all duration-150 p-10px opacity-0"
            >
              <MenuUnfold
                className="cursor-pointer flex"
                size="24"
                fill="#86909C"
                strokeWidth={3}
              />
            </div>
          )}
        </ArcoLayout.Header>
        <ArcoLayout.Content className="h-[calc(100%-72px-16px)] p-8px">
          {sider}
        </ArcoLayout.Content>
      </ArcoLayout.Sider>
      <ArcoLayout.Content>
        <ArcoLayout.Header
          className={
            "flex items-center justify-between p-16px gap-16px h-56px !bg-#F7F8FA"
          }
        >
          <FlexFullContainer className="h-full">
            {props.title}
          </FlexFullContainer>
          <div className="flex items-center gap-16px">
            {props.rightSider && rightSiderCollapsed && (
              <ExpandRight
                className="cursor-pointer flex"
                theme="outline"
                size="24"
                fill="#86909C"
                strokeWidth={3}
                onClick={() => setRightSiderCollapsed(!rightSiderCollapsed)}
              />
            )}
          </div>
        </ArcoLayout.Header>
        <ArcoLayout.Content className={"h-[calc(100%-66px)] bg-#F9FAFB"}>
          {children}
        </ArcoLayout.Content>
      </ArcoLayout.Content>
      {props.rightSider && (
        <>
          {/* 拖拽手柄 */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-transparent hover:bg-#E5E6EB cursor-col-resize z-10"
            style={{ 
              left: `calc(100% - ${rightSiderWidth}px - 1px)`,
              right: `${rightSiderWidth}px`
            }}
            onMouseDown={handleDragStart}
          />
          <ArcoLayout.Sider
            width={rightSiderWidth}
            collapsedWidth={0}
            collapsed={rightSiderCollapsed}
            className={"!bg-#F7F8FA"}
          >
            <ArcoLayout.Header
              className={"flex items-center justify-start p-16px gap-16px h-56px"}
            >
              <div className="flex-1">{props.rightSiderTitle}</div>
              <ExpandLeft
                theme="outline"
                size="24"
                fill="#86909C"
                className="cursor-pointer"
                strokeWidth={3}
                onClick={() => setRightSiderCollapsed(true)}
              />
            </ArcoLayout.Header>
            {/* <Divider className="!m-0"></Divider> */}
            <ArcoLayout.Content className="h-[calc(100%-66px)]">
              {props.rightSider}
            </ArcoLayout.Content>
          </ArcoLayout.Sider>
        </>
      )}
    </ArcoLayout>
  );
};

export default Layout;
