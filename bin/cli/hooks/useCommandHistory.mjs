/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 命令历史管理 Hook / Command History Manager Hook
 * 参考 Gemini CLI 的 useInputHistory 设计
 */

import { useState, useCallback } from 'react';

/**
 * 命令历史管理 Hook
 * Command History Management Hook
 *
 * @param {number} maxHistory - 最大历史记录数 / Maximum history size (default: 100)
 * @returns {Object} - 历史管理方法 / History management methods
 */
export function useCommandHistory(maxHistory = 100) {
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalInput, setOriginalInput] = useState('');

  /**
   * 向上导航历史 (查看更早的命令)
   * Navigate up in history (view older commands)
   *
   * @param {string} currentInput - 当前输入内容 / Current input value
   * @returns {string|null} - 历史命令或 null / History command or null
   */
  const navigateUp = useCallback(
    (currentInput) => {
      if (history.length === 0) {
        return null;
      }

      // 首次导航:保存当前输入
      // First navigation: save current input
      if (historyIndex === -1) {
        setOriginalInput(currentInput);
        setHistoryIndex(0);
        return history[history.length - 1];
      }

      // 继续向上:获取更早的命令
      // Continue up: get older command
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        return history[history.length - 1 - newIndex];
      }

      // 已经在最早的命令
      // Already at oldest command
      return null;
    },
    [history, historyIndex]
  );

  /**
   * 向下导航历史 (查看更新的命令)
   * Navigate down in history (view newer commands)
   *
   * @returns {string|null} - 历史命令或原始输入或 null / History command or original input or null
   */
  const navigateDown = useCallback(() => {
    if (historyIndex === -1) {
      // 不在历史导航中
      // Not currently navigating history
      return null;
    }

    if (historyIndex === 0) {
      // 回到初始状态:恢复原始输入
      // Return to initial state: restore original input
      setHistoryIndex(-1);
      const original = originalInput;
      setOriginalInput('');
      return original;
    }

    // 继续向下:获取更新的命令
    // Continue down: get newer command
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    return history[history.length - 1 - newIndex];
  }, [history, historyIndex, originalInput]);

  /**
   * 添加命令到历史
   * Add command to history
   *
   * @param {string} command - 要添加的命令 / Command to add
   */
  const addToHistory = useCallback(
    (command) => {
      const trimmedCommand = command.trim();

      // 忽略空命令
      // Ignore empty commands
      if (!trimmedCommand) {
        return;
      }

      // 忽略与上一条相同的命令
      // Ignore duplicate of last command
      if (history.length > 0 && history[history.length - 1] === trimmedCommand) {
        return;
      }

      setHistory((prev) => {
        const newHistory = [...prev, trimmedCommand];

        // 限制历史记录数量
        // Limit history size
        if (newHistory.length > maxHistory) {
          return newHistory.slice(-maxHistory);
        }

        return newHistory;
      });

      // 重置导航索引
      // Reset navigation index
      setHistoryIndex(-1);
      setOriginalInput('');
    },
    [history, maxHistory]
  );

  /**
   * 清空历史
   * Clear history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
    setOriginalInput('');
  }, []);

  /**
   * 获取历史记录数量
   * Get history count
   */
  const getHistoryCount = useCallback(() => {
    return history.length;
  }, [history]);

  return {
    navigateUp,
    navigateDown,
    addToHistory,
    clearHistory,
    getHistoryCount,
    isNavigating: historyIndex !== -1,
  };
}
