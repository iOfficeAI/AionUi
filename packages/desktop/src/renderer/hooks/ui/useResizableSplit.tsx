/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import classNames from 'classnames';
import { removeStack } from '@/renderer/utils/common';

const addWindowEventListener = <K extends keyof WindowEventMap>(
  key: K,
  handler: (e: WindowEventMap[K]) => void
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener(key, handler);
  return () => {
    window.removeEventListener(key, handler);
  };
};

interface UseResizableSplitOptions {
  /** 默认宽度。`unit: 'ratio'` 时为百分比 (0-100)，`unit: 'px'` 时为像素值 */
  defaultWidth?: number;
  /** 最小宽度（同 defaultWidth 的单位） */
  minWidth?: number;
  /** 最大宽度（同 defaultWidth 的单位） */
  maxWidth?: number;
  /** LocalStorage 存储键名（用于记录偏好） */
  storageKey?: string;
  /** 单位：百分比或像素。默认 'ratio'（向后兼容） */
  unit?: 'ratio' | 'px';
  /**
   * 收起吸附阈值（仅 px 模式；不传则关闭 collapse 语义，退化为纯 clamp）。
   * 拖拽实时宽度 < 此值时进入收起预览态：面板吸到 `collapsedWidth`，松手即收起，
   * 且**不写盘**（保留最后一次合法宽度）。≥ 此值恢复正常跟手 + 写盘。
   */
  collapseThreshold?: number;
  /** 收起态的显示宽度（配合 collapseThreshold，通常为 0） */
  collapsedWidth?: number;
  /** 外部持有的收起态：hook 读它决定拖拽起点（收起时从 collapsedWidth 起拖） */
  collapsed?: boolean;
  /** 跨阈值 / 松手时回调收起态变化 */
  onCollapsedChange?: (collapsed: boolean) => void;
}

/**
 * 可拖动分割面板 Hook，支持记录用户偏好
 * Resizable split panel Hook with user preference persistence
 *
 * @param options - 配置选项 / Configuration options
 * @returns 分割比例、拖动句柄和设置函数 / Split ratio, drag handle, and setter function
 */
export const useResizableSplit = (options: UseResizableSplitOptions = {}) => {
  const { defaultWidth = 50, minWidth = 20, maxWidth = 80, storageKey, unit = 'ratio' } = options;
  const { collapseThreshold, collapsedWidth = 0, collapsed = false, onCollapsedChange } = options;
  const isPx = unit === 'px';
  // Collapse 语义仅在 px 模式且显式给出阈值时启用；否则完全退化为原 clamp 行为。
  const collapseEnabled = isPx && typeof collapseThreshold === 'number';

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
        if (!isPx && !containerWidth) {
          return;
        }

        const startX = event.clientX;
        // 收起态从收起宽度起拖（复刻旧 beginSiderResizeDrag 的 startWidth 语义），
        // 否则从当前面板宽度起拖。
        const startRatio = collapseEnabled && collapsed ? collapsedWidth : splitRatio;
        const pointerId = event.pointerId;
        // px 模式下拖动直接换算为像素差，不再除以容器宽度。
        // 原始追踪值：上侧始终 clamp 到 maxWidth；下侧在启用 collapse 时可下探到
        // collapsedWidth（用于探测收起意图），否则沿用旧行为 clamp 到 minWidth。
        const computeRaw = (clientX: number): number => {
          const deltaX = reverse ? startX - clientX : clientX - startX;
          const base = isPx ? startRatio + deltaX : startRatio + (deltaX / containerWidth) * 100;
          const floor = collapseEnabled ? collapsedWidth : minWidth;
          return Math.max(floor, Math.min(maxWidth, base));
        };
        let rafId: number | null = null;
        let pendingRatio: number | null = null;
        // latestRatio 只跟踪「最后一次合法展开宽度」，收起预览不更新它 → 无 clientX
        // 的兜底提交（blur）恢复到最后合法值而非预览值。
        let latestRatio = collapseEnabled && collapsed ? splitRatio : startRatio;
        let collapsedNow = collapseEnabled ? collapsed : false;
        let isDragging = true;
        let cleanupListeners: (() => void) | null = null;

        // 把一个原始追踪值应用为实时视图（拖拽中）。
        const applyLiveRatio = (raw: number) => {
          if (collapseEnabled && raw < (collapseThreshold as number)) {
            // 收起预览：不写 state（保留最后合法宽度），仅切收起态。
            if (!collapsedNow) {
              collapsedNow = true;
              onCollapsedChange?.(true);
            }
            return;
          }
          const legal = collapseEnabled ? Math.max(minWidth, raw) : raw;
          latestRatio = legal;
          setSplitRatioState(legal);
          dispatchSplitResizeEvent(legal);
          if (collapseEnabled && collapsedNow) {
            collapsedNow = false;
            onCollapsedChange?.(false);
          }
        };

        const flushPendingRatio = () => {
          if (pendingRatio === null) {
            return;
          }
          applyLiveRatio(pendingRatio);
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

          // 松手终值：优先用真实指针位置重算；缺 clientX（blur）则用跟踪态兜底。
          const raw = e && 'clientX' in e && typeof e.clientX === 'number' ? computeRaw(e.clientX) : null;
          const committedCollapsed =
            raw !== null ? collapseEnabled && raw < (collapseThreshold as number) : collapsedNow;

          if (committedCollapsed) {
            // 提交收起：不调 setSplitRatio → localStorage 保留最后合法宽度。
            onCollapsedChange?.(true);
          } else {
            const legal = raw !== null ? (collapseEnabled ? Math.max(minWidth, raw) : raw) : latestRatio;
            setSplitRatio(legal);
            if (collapseEnabled) onCollapsedChange?.(false);
          }
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
          pendingRatio = computeRaw(e.clientX);
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
    [
      splitRatio,
      minWidth,
      maxWidth,
      setSplitRatio,
      dispatchSplitResizeEvent,
      isPx,
      collapseEnabled,
      collapseThreshold,
      collapsedWidth,
      collapsed,
      onCollapsedChange,
    ]
  );

  const renderHandle = ({
    className,
    style,
    reverse,
    linePlacement,
    lineClassName,
    lineStyle,
  }: {
    className?: string;
    style?: CSSProperties;
    reverse?: boolean;
    linePlacement?: 'start' | 'end';
    lineClassName?: string;
    lineStyle?: CSSProperties;
  } = {}) => (
    <div
      className={classNames(
        'group absolute top-0 bottom-0 z-20 cursor-col-resize flex items-center',
        linePlacement
          ? linePlacement === 'start'
            ? 'justify-start'
            : 'justify-end'
          : reverse
            ? 'justify-start'
            : 'justify-end',
        className
      )}
      style={{ width: '12px', ...style }}
      onPointerDown={handleDragStart(reverse)}
      onDoubleClick={() => {
        setSplitRatio(defaultWidth);
        onCollapsedChange?.(false);
      }}
    >
      <span
        className={classNames(
          'pointer-events-none block h-full w-2px bg-bg-3 opacity-90 rd-full transition-all duration-150 group-hover:w-6px group-hover:bg-aou-6 group-active:w-6px group-active:bg-aou-6',
          lineClassName
        )}
        style={lineStyle}
      />
    </div>
  );

  return {
    splitRatio,
    dragHandle: renderHandle({ className: 'end-0' }),
    setSplitRatio,
    createDragHandle: renderHandle,
  };
};
