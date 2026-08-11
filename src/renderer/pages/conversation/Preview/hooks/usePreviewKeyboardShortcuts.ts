/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';

/**
 * 预览面板快捷键配置
 * Preview panel keyboard shortcuts configuration
 */
interface UsePreviewKeyboardShortcutsOptions {
  /**
   * 当前是否有未保存的修改
   * Whether there are unsaved changes
   */
  isDirty?: boolean;

  /**
   * 保存回调函数
   * Save callback function
   */
  onSave: () => void;
}

/**
 * 处理预览面板快捷键（Cmd/Ctrl + S 保存）
 * Handle preview panel keyboard shortcuts (Cmd/Ctrl + S to save)
 *
 * @param options - 快捷键配置 / Keyboard shortcuts configuration
 */
export const usePreviewKeyboardShortcuts = ({ isDirty, onSave }: UsePreviewKeyboardShortcutsOptions): void => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + S
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault(); // 阻止浏览器默认保存行为 / Prevent default browser save
        if (isDirty) {
          onSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, onSave]);
};
