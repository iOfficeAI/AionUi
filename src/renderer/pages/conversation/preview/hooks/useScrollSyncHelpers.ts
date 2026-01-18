/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useCallback, useRef } from 'react';

/**
 * 监听外部滚动同步请求的 Hook
 * Hook for listening to external scroll sync requests
 *
 * 通过 MutationObserver 监听容器的 data-target-scroll-percent 属性变化
 * Uses MutationObserver to listen for data-target-scroll-percent attribute changes
 *
 * @param containerRef - 容器引用 / Container ref
 * @param onTargetScroll - 目标滚动百分比回调 / Target scroll percentage callback
 */
export const useScrollSyncTarget = (containerRef: React.RefObject<HTMLElement> | undefined, onTargetScroll: (targetPercent: number) => void): void => {
  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-target-scroll-percent') {
          const targetPercent = parseFloat(container.dataset.targetScrollPercent || '0');
          if (!isNaN(targetPercent)) {
            onTargetScroll(targetPercent);
          }
        }
      }
    });

    observer.observe(container, { attributes: true, attributeFilter: ['data-target-scroll-percent'] });
    return () => observer.disconnect();
  }, [containerRef, onTargetScroll]);
};

/**
 * CodeMirror 滚动监听和设置的 Hook
 * Hook for CodeMirror scroll listening and setting
 *
 * 监听 CodeMirror 内部 .cm-scroller 元素的滚动事件，并提供设置滚动位置的方法
 * Listens to CodeMirror's internal .cm-scroller element scroll events and provides scroll position setter
 *
 * @param wrapperRef - CodeMirror 包裹元素引用 / CodeMirror wrapper element ref
 * @param onScroll - 滚动回调 / Scroll callback
 * @returns setScrollPercent - 设置滚动百分比的函数 / Function to set scroll percentage
 */
export const useCodeMirrorScroll = (wrapperRef: React.RefObject<HTMLDivElement>, onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void): { setScrollPercent: (percent: number) => void } => {
  // 监听 CodeMirror 内部滚动容器的滚动事件
  // Listen to CodeMirror's internal scroller scroll events
  useEffect(() => {
    if (!onScroll) return;

    // 延迟获取 scroller，等待 CodeMirror 渲染完成
    // Delay getting scroller to wait for CodeMirror to render
    const timer = setTimeout(() => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      // CodeMirror 的滚动容器是 .cm-scroller 元素
      // CodeMirror's scroll container is the .cm-scroller element
      const scroller = wrapper.querySelector('.cm-scroller') as HTMLElement;
      if (!scroller) {
        console.warn('[useCodeMirrorScroll] Could not find .cm-scroller element');
        return;
      }

      const handleScroll = () => {
        onScroll(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight);
      };

      scroller.addEventListener('scroll', handleScroll, { passive: true });

      // 存储清理函数以便在 effect 清理时调用
      // Store cleanup function for effect cleanup
      (wrapperRef.current as HTMLDivElement & { __scrollCleanup?: () => void }).__scrollCleanup = () => {
        scroller.removeEventListener('scroll', handleScroll);
      };
    }, 100);

    return () => {
      clearTimeout(timer);
      const wrapper = wrapperRef.current as (HTMLDivElement & { __scrollCleanup?: () => void }) | null;
      wrapper?.__scrollCleanup?.();
    };
  }, [onScroll, wrapperRef]);

  // 设置滚动百分比
  // Set scroll percentage
  const setScrollPercent = useCallback(
    (percent: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const scroller = wrapper.querySelector('.cm-scroller') as HTMLElement;
      if (scroller) {
        const targetScroll = percent * (scroller.scrollHeight - scroller.clientHeight);
        scroller.scrollTop = targetScroll;
      }
    },
    [wrapperRef]
  );

  return { setScrollPercent };
};

/**
 * 普通容器滚动监听的 Hook
 * Hook for normal container scroll listening
 *
 * @param containerRef - 容器引用 / Container ref
 * @param onScroll - 滚动回调 / Scroll callback
 */
export const useContainerScroll = (containerRef: React.RefObject<HTMLElement>, onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void): void => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onScroll) return;

    const handleScroll = () => {
      onScroll(container.scrollTop, container.scrollHeight, container.clientHeight);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, onScroll]);
};

/**
 * 普通容器的滚动同步目标 Hook（设置 scrollTop）
 * Hook for normal container scroll sync target (sets scrollTop)
 *
 * @param containerRef - 容器引用 / Container ref
 */
export const useContainerScrollTarget = (containerRef: React.RefObject<HTMLElement>): void => {
  const handleTargetScroll = useCallback(
    (targetPercent: number) => {
      const container = containerRef.current;
      if (container) {
        const targetScroll = targetPercent * (container.scrollHeight - container.clientHeight);
        container.scrollTop = targetScroll;
      }
    },
    [containerRef]
  );

  useScrollSyncTarget(containerRef, handleTargetScroll);
};
