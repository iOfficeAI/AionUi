/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';

interface UseAutoScrollOptions {
  containerRef: React.RefObject<HTMLDivElement>; // 容器引用 / Container ref
  content: string; // 内容（用于监听变化）/ Content (for watching changes)
  enabled?: boolean; // 是否启用自动滚动 / Whether to enable auto-scroll
  threshold?: number; // 触发自动滚动的距离底部阈值（px）/ Distance from bottom threshold to trigger auto-scroll (px)
  behavior?: ScrollBehavior; // 滚动行为 / Scroll behavior
}

/**
 * 智能自动滚动 Hook
 * Smart auto-scroll Hook
 *
 * 当内容更新时，如果用户处于底部附近，则自动滚动到底部
 * When content updates, if user is near bottom, auto-scroll to bottom
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * useAutoScroll({
 *   containerRef,
 *   content: streamingText,
 *   enabled: true,
 *   threshold: 200, // 距离底部 200px 以内时跟随
 * });
 * ```
 */
export const useAutoScroll = ({ containerRef, content, enabled = true, threshold = 200, behavior = 'smooth' }: UseAutoScrollOptions) => {
  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;

    // 计算距离底部的距离 / Calculate distance from bottom
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;

    // 如果距离底部小于阈值，自动滚动到底部
    // If distance from bottom is less than threshold, auto-scroll to bottom
    if (distanceToBottom < threshold) {
      container.scrollTo({ top: scrollHeight, behavior });
    }
  }, [content, enabled, threshold, behavior, containerRef]);
};
