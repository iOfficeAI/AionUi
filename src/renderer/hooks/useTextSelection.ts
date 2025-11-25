/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';

// 选中文本的位置信息 / Selection position information
export interface SelectionPosition {
  x: number; // 水平位置 / Horizontal position
  y: number; // 垂直位置 / Vertical position
  width: number; // 选中区域宽度 / Selection width
  height: number; // 选中区域高度 / Selection height
}

/**
 * 文本选择 Hook，监听容器内的文本选择事件
 * Text selection Hook that monitors text selection events within a container
 *
 * @param containerRef - 容器引用 / Container reference
 * @returns 选中的文本、位置信息和清除函数 / Selected text, position info, and clear function
 */
export const useTextSelection = (containerRef: React.RefObject<HTMLElement>) => {
  const [selectedText, setSelectedText] = useState('');
  const [selectionPosition, setSelectionPosition] = useState<SelectionPosition | null>(null);

  // 处理选择变化事件 / Handle selection change event
  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';

    // 如果没有选中文本，清空状态 / Clear state if no text selected
    if (!text) {
      setSelectedText('');
      setSelectionPosition(null);
      return;
    }

    // 检查选中的文本是否在容器内 / Check if selected text is within the container
    if (containerRef.current && selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = containerRef.current;

      if (!container.contains(range.commonAncestorContainer)) {
        setSelectedText('');
        setSelectionPosition(null);
        return;
      }

      // 获取选中文本的位置 / Get selection position
      const rect = range.getBoundingClientRect();
      setSelectedText(text);
      setSelectionPosition({
        x: rect.left + rect.width / 2,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    }
  }, [containerRef]);

  // 监听选择变化事件 / Listen to selection change events
  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  // 清除选择 / Clear selection
  const clearSelection = useCallback(() => {
    setSelectedText('');
    setSelectionPosition(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return { selectedText, selectionPosition, clearSelection };
};
