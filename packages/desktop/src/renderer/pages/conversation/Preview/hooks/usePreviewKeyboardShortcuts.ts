/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { isPlatformPrimaryModifier } from '@/renderer/utils/ui/keyboardShortcuts';

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

  /**
   * 关闭当前 tab 回调（Cmd/Ctrl + W）
   * Close the active tab (Cmd/Ctrl + W)
   */
  onCloseActiveTab?: () => void;

  /**
   * 快捷键作用域：只有源自该元素内部的按键才会被处理。
   * Shortcut scope — only keystrokes originating inside this element are handled.
   */
  scopeRef?: RefObject<HTMLElement | null>;
}

/**
 * 处理预览面板快捷键（Cmd/Ctrl + S 保存，Cmd/Ctrl + W 关闭当前 tab）
 * Handle preview panel keyboard shortcuts (Cmd/Ctrl + S to save, Cmd/Ctrl + W to
 * close the active tab)
 *
 * @param options - 快捷键配置 / Keyboard shortcuts configuration
 */
export const usePreviewKeyboardShortcuts = ({
  isDirty,
  onSave,
  onCloseActiveTab,
  scopeRef,
}: UsePreviewKeyboardShortcutsOptions): void => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + S
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault(); // 阻止浏览器默认保存行为 / Prevent default browser save
        if (isDirty) {
          onSave();
        }
        return;
      }

      // Cmd/Ctrl + W —— 关闭当前 tab。
      //
      // 刻意限定在预览面板内部触发：⌘W 是系统级的「关闭」，从聊天区按下时把预览
      // tab 关掉会让人摸不着头脑，而面板内部按下时这就是唯一合理的含义。
      //
      // Deliberately scoped to the preview panel: ⌘W is a system-level "close",
      // so closing a preview tab from the chat area would be baffling, while
      // inside the panel it is the only reasonable reading.
      //
      // 与其它快捷键不同，这里不回避编辑器：正在改文件时按 ⌘W 就是要关掉这个
      // tab，未保存的内容由关闭确认弹窗兜底，而不是靠吞掉快捷键来保护。
      //
      // Unlike the app's other shortcuts this does not yield to the editor:
      // pressing ⌘W mid-edit means close this tab, and unsaved content is
      // protected by the close confirmation rather than by swallowing the key.
      if (!onCloseActiveTab) return;
      if (e.defaultPrevented || e.isComposing || e.repeat || e.altKey || e.shiftKey) return;
      if (!isPlatformPrimaryModifier(e) || e.key.toLowerCase() !== 'w') return;

      const scope = scopeRef?.current;
      const target = e.target as Node | null;
      if (!scope || !target || !scope.contains(target)) return;

      e.preventDefault();
      onCloseActiveTab();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, onSave, onCloseActiveTab, scopeRef]);
};
