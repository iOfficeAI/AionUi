/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import classNames from 'classnames';
import { removeStack } from '@/renderer/utils/common';

// 添加事件监听器的辅助函数 / Helper function for adding event listeners
const addEventListener = <K extends keyof DocumentEventMap>(key: K, handler: (e: DocumentEventMap[K]) => void): (() => void) => {
  document.addEventListener(key, handler);
  return () => {
    document.removeEventListener(key, handler);
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

  // 保存比例到 LocalStorage / Save ratio to LocalStorage
  const setSplitRatio = useCallback(
    (ratio: number) => {
      setSplitRatioState(ratio);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, ratio.toString());
        } catch (error) {
          console.error('Failed to save split ratio to localStorage:', error);
        }
      }
    },
    [storageKey]
  );

  // 处理拖动开始事件 / Handle drag start event
  const handleDragStart = useCallback(
    (reverse = false) =>
      (e: React.MouseEvent) => {
        const startX = e.clientX;
        // 获取最外层容器宽度（拖动句柄的父级的父级）/ Get outermost container width (grandparent of drag handle)
        const dragHandle = e.currentTarget as HTMLElement;
        const chatPanel = dragHandle.parentElement; // 会话面板包裹 div / Chat panel wrapper div
        const outerContainer = chatPanel?.parentElement; // 最外层 flex 容器 / Outermost flex container
        const containerWidth = outerContainer?.offsetWidth || 0;
        const startRatio = splitRatio;

        // 初始化拖动样式 / Initialize drag styles
        const initDragStyle = () => {
          const originalUserSelect = document.body.style.userSelect;
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'col-resize';
          return () => {
            document.body.style.userSelect = originalUserSelect;
            document.body.style.cursor = '';
          };
        };

        const remove = removeStack(
          initDragStyle(),
          // 鼠标移动时更新比例 / Update ratio on mouse move
          addEventListener('mousemove', (e: MouseEvent) => {
            const deltaX = reverse ? startX - e.clientX : e.clientX - startX;
            const deltaRatio = (deltaX / containerWidth) * 100;
            const newRatio = Math.max(minWidth, Math.min(maxWidth, startRatio + deltaRatio));
            setSplitRatioState(newRatio);
          }),
          // 鼠标释放时保存比例 / Save ratio on mouse up
          addEventListener('mouseup', (e: MouseEvent) => {
            const deltaX = reverse ? startX - e.clientX : e.clientX - startX;
            const deltaRatio = (deltaX / containerWidth) * 100;
            const newRatio = Math.max(minWidth, Math.min(maxWidth, startRatio + deltaRatio));
            setSplitRatio(newRatio); // 保存到 LocalStorage / Save to LocalStorage
            remove();
          })
        );
      },
    [splitRatio, minWidth, maxWidth, setSplitRatio]
  );

  const renderHandle = ({ className, style, reverse }: { className?: string; style?: CSSProperties; reverse?: boolean } = {}) => <div className={classNames('resizable-split-handle absolute top-0 bottom-0 cursor-col-resize z-20', className)} style={style} onMouseDown={handleDragStart(reverse)} onDoubleClick={() => setSplitRatio(defaultWidth)} />;

  return { splitRatio, dragHandle: renderHandle({ className: 'right-0' }), setSplitRatio, createDragHandle: renderHandle };
};
