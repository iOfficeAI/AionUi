/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef } from 'react';
import { SCROLL_SYNC_DEBOUNCE } from '../constants';

/**
 * 滚动同步 Hook 配置
 * Scroll sync hook configuration
 */
interface UseScrollSyncOptions {
  /**
   * 是否启用滚动同步
   * Whether to enable scroll sync
   */
  enabled: boolean;

  /**
   * 编辑器容器引用
   * Editor container ref
   */
  editorContainerRef: React.RefObject<HTMLDivElement>;

  /**
   * 预览容器引用
   * Preview container ref
   */
  previewContainerRef: React.RefObject<HTMLDivElement>;
}

/**
 * 滚动同步 Hook 返回值
 * Scroll sync hook return value
 */
interface UseScrollSyncReturn {
  /**
   * 处理编辑器滚动事件
   * Handle editor scroll event
   */
  handleEditorScroll: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;

  /**
   * 处理预览器滚动事件
   * Handle preview scroll event
   */
  handlePreviewScroll: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
}

/**
 * 分屏模式下的滚动同步 Hook
 * Scroll synchronization hook for split-screen mode
 *
 * 在编辑器和预览器之间同步滚动位置，基于滚动百分比进行同步
 * Synchronizes scroll position between editor and preview based on scroll percentage
 *
 * 使用防抖机制避免循环触发和性能问题
 * Uses debounce mechanism to avoid circular triggers and performance issues
 *
 * TODO: 考虑使用 requestAnimationFrame 替代 setTimeout 以提升性能
 * TODO: Consider using requestAnimationFrame instead of setTimeout for better performance
 *
 * @param options - 滚动同步配置 / Scroll sync configuration
 * @returns 滚动事件处理函数 / Scroll event handlers
 */
export const useScrollSync = ({ enabled, editorContainerRef, previewContainerRef }: UseScrollSyncOptions): UseScrollSyncReturn => {
  const isSyncingRef = useRef(false);

  const handleEditorScroll = useCallback(
    (scrollTop: number, scrollHeight: number, clientHeight: number) => {
      if (!enabled || isSyncingRef.current) return;

      isSyncingRef.current = true;
      const previewContainer = previewContainerRef.current;
      const scrollPercentage = scrollTop / (scrollHeight - clientHeight || 1);
      if (previewContainer) {
        // 使用 data 属性传递目标滚动百分比，由各组件自行处理
        // Use data attribute to pass target scroll percentage, each component handles it
        previewContainer.dataset.targetScrollPercent = String(scrollPercentage);
        // 同时尝试直接设置 scrollTop（对于支持的组件）
        // Also try to set scrollTop directly (for components that support it)
        const targetScroll = scrollPercentage * (previewContainer.scrollHeight - previewContainer.clientHeight);
        previewContainer.scrollTop = targetScroll;
      }

      setTimeout(() => {
        isSyncingRef.current = false;
      }, SCROLL_SYNC_DEBOUNCE);
    },
    [enabled, previewContainerRef]
  );

  const handlePreviewScroll = useCallback(
    (scrollTop: number, scrollHeight: number, clientHeight: number) => {
      if (!enabled || isSyncingRef.current) return;

      isSyncingRef.current = true;
      const editorContainer = editorContainerRef.current;
      const scrollPercentage = scrollTop / (scrollHeight - clientHeight || 1);
      if (editorContainer) {
        // 使用 data 属性传递目标滚动百分比，由各组件自行处理
        // Use data attribute to pass target scroll percentage, each component handles it
        editorContainer.dataset.targetScrollPercent = String(scrollPercentage);
        // 同时尝试直接设置 scrollTop（对于支持的组件）
        // Also try to set scrollTop directly (for components that support it)
        const targetScroll = scrollPercentage * (editorContainer.scrollHeight - editorContainer.clientHeight);
        editorContainer.scrollTop = targetScroll;
      }

      setTimeout(() => {
        isSyncingRef.current = false;
      }, SCROLL_SYNC_DEBOUNCE);
    },
    [enabled, editorContainerRef]
  );

  return {
    handleEditorScroll,
    handlePreviewScroll,
  };
};
