/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import classNames from 'classnames';
import { removeStack } from '@/renderer/utils/common';

const addWindowEventListener = <K extends keyof WindowEventMap>(key: K, handler: (e: WindowEventMap[K]) => void): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener(key, handler);
  return () => {
    window.removeEventListener(key, handler);
  };
};

interface UseResizableSplitOptions {
  defaultWidth?: number; // 默认宽度百分比（0-100） / Default width percentage (0-100)
  minWidth?: number; // 最小宽度百分比 / Minimum width percentage
  maxWidth?: number; // 最大宽度百分比 / Maximum width percentage
  storageKey?: string; // LocalStorage 存储键名（用于记录偏好） / LocalStorage key for saving user preference
}

/**
 * 可拖动分割面板 Hook，支持记录用户偏好
 * Resizable split panel Hook with user preference persistence
 *
 * @param options - 配置选项 / Configuration options
 * @returns 分割比例、拖动句柄和设置函数 / Split ratio, drag handle, and setter function
 */
export const useResizableSplit = (options: UseResizableSplitOptions = {}) => {
  const { defaultWidth = 50, minWidth = 20, maxWidth = 80, storageKey } = options;

  // 从 LocalStorage 读取保存的比例 / Read saved ratio from LocalStorage
  const getStoredRatio = (): number => {
    if (!storageKey) return defaultWidth;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const ratio = parseFloat(stored);
        if (!isNaN(ratio) && ratio >= minWidth && ratio <= maxWidth) {
          return ratio;
        }
      }
    } catch (error) {
      console.error('Failed to read split ratio from localStorage:', error);
    }
    return defaultWidth;
  };

  const [splitRatio, setSplitRatioState] = useState(() => getStoredRatio());

  const dispatchSplitResizeEvent = useCallback((ratio: number) => {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
      return;
    }
    window.dispatchEvent(new CustomEvent('preview-panel-resize', { detail: { ratio } }));
  }, []);

  // 保存比例到 LocalStorage / Save ratio to LocalStorage
  const setSplitRatio = useCallback(
    (ratio: number) => {
      setSplitRatioState(ratio);
      dispatchSplitResizeEvent(ratio);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, ratio.toString());
        } catch (error) {
          console.error('Failed to save split ratio to localStorage:', error);
        }
      }
    },
    [storageKey, dispatchSplitResizeEvent]
  );

  // 处理拖动开始事件 / Handle drag start event
  const handleDragStart = useCallback(
    (reverse = false) =>
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== 'touch' && event.button !== 0) {
          return;
        }
        event.preventDefault();

        const dragHandle = event.currentTarget as HTMLElement;
        const parent = dragHandle.parentElement;
        const outerContainer = parent?.parentElement;
        const containerWidth = outerContainer?.offsetWidth || 0;
        if (!containerWidth) {
          return;
        }

        const startX = event.clientX;
        const startRatio = splitRatio;
        const pointerId = event.pointerId;
        let rafId: number | null = null;
        let pendingRatio: number | null = null;
        let latestRatio = startRatio;
        let isDragging = true;
        let cleanupListeners: (() => void) | null = null;

        const flushPendingRatio = () => {
          if (pendingRatio === null) {
            return;
          }
          latestRatio = pendingRatio;
          setSplitRatioState(pendingRatio);
          dispatchSplitResizeEvent(pendingRatio);
        };

        // 初始化拖动样式 / Initialize drag styles
        const initDragStyle = () => {
          const originalUserSelect = document.body.style.userSelect;
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'col-resize';

          const layoutSider = dragHandle.closest('.layout-sider');
          if (layoutSider) {
            layoutSider.classList.add('layout-sider--dragging');
          }

          return () => {
            document.body.style.userSelect = originalUserSelect;
            document.body.style.cursor = '';
            if (rafId !== null) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            if (layoutSider) {
              layoutSider.classList.remove('layout-sider--dragging');
            }
          };
        };

        const finishDrag = (e?: PointerEvent | MouseEvent | FocusEvent) => {
          if (!isDragging) {
            return;
          }
          isDragging = false;

          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          flushPendingRatio();

          let finalRatio = latestRatio;
          if (e && 'clientX' in e && typeof e.clientX === 'number') {
            const deltaX = reverse ? startX - e.clientX : e.clientX - startX;
            const deltaRatio = (deltaX / containerWidth) * 100;
            finalRatio = Math.max(minWidth, Math.min(maxWidth, startRatio + deltaRatio));
            latestRatio = finalRatio;
          }

          setSplitRatio(finalRatio);
          cleanupListeners?.();
        };

        const handlePointerMove = (e: PointerEvent) => {
          if (!isDragging) {
            return;
          }
          if (e.buttons === 0) {
            finishDrag(e);
            return;
          }
          const deltaX = reverse ? startX - e.clientX : e.clientX - startX;
          const deltaRatio = (deltaX / containerWidth) * 100;
          pendingRatio = Math.max(minWidth, Math.min(maxWidth, startRatio + deltaRatio));
          if (rafId === null) {
            rafId = requestAnimationFrame(() => {
              rafId = null;
              flushPendingRatio();
            });
          }
        };

        const handleLostPointerCapture = () => finishDrag();

        const handlePointerUp = (e: PointerEvent) => finishDrag(e);
        const handlePointerCancel = (e: PointerEvent) => finishDrag(e);
        const handleMouseUp = (e: MouseEvent) => finishDrag(e);

        if (dragHandle.setPointerCapture) {
          try {
            dragHandle.setPointerCapture(pointerId);
            dragHandle.addEventListener('lostpointercapture', handleLostPointerCapture);
          } catch (error) {
            // 忽略 pointer capture 失败，继续使用备用逻辑 / Ignore failures silently
          }
        }

        const releasePointerCapture = () => {
          if (dragHandle.releasePointerCapture && dragHandle.hasPointerCapture?.(pointerId)) {
            dragHandle.releasePointerCapture(pointerId);
          }
          dragHandle.removeEventListener('lostpointercapture', handleLostPointerCapture);
        };

        cleanupListeners = removeStack(
          initDragStyle(),
          releasePointerCapture,
          addWindowEventListener('pointermove', handlePointerMove),
          addWindowEventListener('pointerup', handlePointerUp),
          addWindowEventListener('pointercancel', handlePointerCancel),
          addWindowEventListener('mouseup', handleMouseUp),
          addWindowEventListener('blur', () => finishDrag())
        );
      },
    [splitRatio, minWidth, maxWidth, setSplitRatio, dispatchSplitResizeEvent]
  );

  const renderHandle = ({ className, style, reverse }: { className?: string; style?: CSSProperties; reverse?: boolean } = {}) => (
    <div className={classNames('group absolute top-0 bottom-0 z-20 cursor-col-resize flex items-center', reverse ? 'justify-start' : 'justify-end', className)} style={{ width: '12px', ...style }} onPointerDown={handleDragStart(reverse)} onDoubleClick={() => setSplitRatio(defaultWidth)}>
      <span className='pointer-events-none block h-full w-2px bg-bg-3 opacity-90 rd-full transition-all duration-150 group-hover:w-6px group-hover:bg-aou-6 group-active:w-6px group-active:bg-aou-6' />
    </div>
  );

  return { splitRatio, dragHandle: renderHandle({ className: 'right-0' }), setSplitRatio, createDragHandle: renderHandle };
};
