/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { IconLeft, IconRight } from '@arco-design/web-react/icon';
import React, { useRef, useState, useEffect } from 'react';

interface HorizontalFileListProps {
  children: React.ReactNode;
}

/**
 * 横向滚动文件列表组件
 * 支持左右滚动，自动显示/隐藏滚动按钮
 * 用于文件预览列表的横向展示
 */
const HorizontalFileList: React.FC<HorizontalFileListProps> = ({ children }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  /**
   * 检查滚动状态，判断是否需要显示左右滚动按钮
   * 计算容器是否可滚动，以及当前是否在起始/结束位置
   */
  const checkScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // 判断是否有横向滚动
    const hasScroll = container.scrollWidth > container.clientWidth;
    // 是否在起始位置（左边）
    const isAtStart = container.scrollLeft <= 1;
    // 是否在结束位置（右边）
    const isAtEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 1;

    const nextShowScrollButton = hasScroll;
    const nextCanScrollRight = hasScroll && !isAtEnd;
    const nextCanScrollLeft = hasScroll && !isAtStart;

    // 仅在状态确实发生变化时才更新，避免不必要的重渲染
    setShowScrollButton((prev) => (prev !== nextShowScrollButton ? nextShowScrollButton : prev));
    setCanScrollRight((prev) => (prev !== nextCanScrollRight ? nextCanScrollRight : prev));
    setCanScrollLeft((prev) => (prev !== nextCanScrollLeft ? nextCanScrollLeft : prev));
  }, []);

  useEffect(() => {
    checkScroll();
    const container = scrollContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const scheduleCheck = () => {
      if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        rafId = requestAnimationFrame(checkScroll);
      } else {
        checkScroll();
      }
    };

    // 使用 ResizeObserver 监听容器大小变化，自动更新滚动状态
    // ResizeObserver 已经能很好地处理大部分布局变化
    const resizeObserver = new ResizeObserver(scheduleCheck);
    resizeObserver.observe(container);

    // 监听滚动事件，实时更新按钮显示状态
    container.addEventListener('scroll', checkScroll, { passive: true });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
      container.removeEventListener('scroll', checkScroll);
    };
  }, [checkScroll]);

  // 当 children 变化时也需要检查一次，但不需要作为 useEffect 的依赖导致频繁重运行
  useEffect(() => {
    checkScroll();
  }, [children, checkScroll]);

  /**
   * 向右滚动 200px
   */
  const handleScrollRight = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollBy({
      left: 200,
      behavior: 'smooth',
    });
  };

  /**
   * 向左滚动 200px
   */
  const handleScrollLeft = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollBy({
      left: -200,
      behavior: 'smooth',
    });
  };

  return (
    <div className='relative'>
      {/* 横向滚动容器，隐藏滚动条 */}
      <div
        ref={scrollContainerRef}
        className='flex items-center gap-8px overflow-x-auto overflow-y-hidden scrollbar-hide pt-5px pb-5px'
        style={{
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
        }}
      >
        {children}
      </div>
      {/* 左侧滚动按钮 - 在非起始位置时显示 */}
      {showScrollButton && canScrollLeft && (
        <div
          className='absolute left-0 top-0 h-full flex items-center cursor-pointer'
          style={{
            background: 'linear-gradient(to left, transparent, var(--dialog-fill-0) 30%)', // 左侧渐变遮罩
            width: '60px',
            pointerEvents: 'none', // 遮罩层不响应点击
          }}
        >
          <button
            onClick={handleScrollLeft}
            className='ml-0px w-28px h-28px rd-50% bg-1 flex items-center justify-center hover:bg-2 transition-colors border-1 border-solid b-color-border-2'
            style={{
              pointerEvents: 'auto', // 按钮响应点击
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            <IconLeft style={{ fontSize: '14px', color: 'var(--text-t-primary)' }} />
          </button>
        </div>
      )}
      {/* 右侧滚动按钮 - 在非结束位置时显示 */}
      {showScrollButton && canScrollRight && (
        <div
          className='absolute right-0 top-0 h-full flex items-center cursor-pointer'
          style={{
            background: 'linear-gradient(to right, transparent, var(--dialog-fill-0) 30%)', // 右侧渐变遮罩
            width: '60px',
            pointerEvents: 'none', // 遮罩层不响应点击
          }}
        >
          <button
            onClick={handleScrollRight}
            className='ml-auto mr-0px w-28px h-28px rd-50% bg-1 flex items-center justify-center hover:bg-2 transition-colors border-1 border-solid b-color-border-2'
            style={{
              pointerEvents: 'auto', // 按钮响应点击
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            <IconRight style={{ fontSize: '14px', color: 'var(--text-t-primary)' }} />
          </button>
        </div>
      )}
    </div>
  );
};

export default HorizontalFileList;
