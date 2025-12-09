/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react';
import { usePreviewContext } from '../../context/PreviewContext';
import type { SelectionPosition } from '@/renderer/hooks/useTextSelection';
import { useTranslation } from 'react-i18next';

interface SelectionToolbarProps {
  selectedText: string; // 选中的文本 / Selected text
  position: SelectionPosition | null; // 选中文本的位置 / Position of selected text
  onClear: () => void; // 清除选择的回调 / Callback to clear selection
}

/**
 * 文本选择浮动工具栏组件
 * Floating toolbar component for text selection
 *
 * 当用户选中文本时显示，提供"添加到会话"功能
 * Displays when user selects text, providing "Add to chat" functionality
 */
const SelectionToolbar: React.FC<SelectionToolbarProps> = ({ selectedText, position, onClear }) => {
  const { t } = useTranslation();
  const { addToSendBox } = usePreviewContext();

  // 使用 Floating UI 定位工具栏（跟随鼠标位置）/ Use Floating UI to position toolbar (follow mouse position)
  const { refs, floatingStyles } = useFloating({
    placement: 'bottom-start', // 显示在鼠标下方 / Display below mouse
    middleware: [
      offset(8), // 与鼠标的距离 / Distance from mouse
      flip(), // 自动翻转避免溢出 / Auto flip to avoid overflow
      shift({ padding: 8 }), // 自动偏移保持在视口内 / Auto shift to stay within viewport
    ],
    whileElementsMounted: autoUpdate, // 自动更新位置 / Auto update position
  });

  // 更新虚拟参考元素的位置 / Update virtual reference element position
  React.useEffect(() => {
    if (position) {
      refs.setReference({
        getBoundingClientRect: () => ({
          x: position.x,
          y: position.y,
          width: position.width,
          height: position.height,
          top: position.y,
          left: position.x,
          right: position.x + position.width,
          bottom: position.y + position.height,
        }),
      });
    }
  }, [position, refs]);

  // 如果没有选中文本或位置，不渲染 / Don't render if no text or position
  if (!selectedText || !position) return null;

  // 处理"添加到会话"按钮点击 / Handle "Add to chat" button click
  // 使用 mousedown 而不是 click，因为 click 之前文本选择可能已被清除
  // Use mousedown instead of click because selection may be cleared before click fires
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToSendBox(selectedText);
    onClear(); // 清除选择状态 / Clear selection state
  };

  return (
    <div ref={refs.setFloating} style={{ ...floatingStyles, zIndex: 99999 }}>
      <div className='flex items-center px-12px py-8px bg-white dark:bg-gray-800 rd-8px shadow-lg border-1 border-solid border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-80 transition-opacity' onMouseDown={handleMouseDown}>
        <span className='text-13px text-t-primary font-medium whitespace-nowrap leading-16px'>{t('preview.addToChat')}</span>
      </div>
    </div>
  );
};

export default SelectionToolbar;
