#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * AionUI CLI 主入口 / AionUI CLI Main Entry
 * 独立的命令行工具，不依赖 Electron 环境
 * Standalone CLI tool, independent from Electron environment
 */

import React from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { registry } from './cli/commands/registry.mjs';
import { Logo, WelcomeMessage, StatusBar, renderOutput } from './cli/components.mjs';
import { UserRepository, cleanup, dbManager, resolveDbPath } from './cli/database.mjs';
import { CLI_CONFIG } from './cli/config.mjs';
import { useCommandHistory } from './cli/hooks/useCommandHistory.mjs';

/**
 * 错误处理 / Global error handling
 */
process.on('unhandledRejection', (error) => {
  cleanup();
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  cleanup();
  process.exit(1);
});

/**
 * 进程退出时清理资源 / Cleanup on process exit
 */
process.on('exit', () => {
  cleanup();
});

/**
 * AionUI CLI 主组件
 * AionUI CLI Main Component
 */
const AionCLI = () => {
  const [input, setInput] = React.useState('');
  const [output, setOutput] = React.useState([]);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [showWelcome, setShowWelcome] = React.useState(true);
  const [userCount, setUserCount] = React.useState(0);
  const [startTime] = React.useState(Date.now());
  const [uptime, setUptime] = React.useState(0);
  const { exit } = useApp();

  // 命令历史管理 / Command history management
  const { navigateUp, navigateDown, addToHistory, getHistoryCount } = useCommandHistory(100);

  // 挂载时加载用户数量和数据库路径 / Load user count and db path on mount
  React.useEffect(() => {
    try {
      setUserCount(UserRepository.count());
    } catch (error) {
      console.error('Failed to load user count:', error.message);
    }
  }, []);

  // 更新运行时间 / Update uptime
  React.useEffect(() => {
    const timer = setInterval(() => {
      setUptime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  // 处理键盘输入 / Handle keyboard input
  useInput(async (char, key) => {
    if (isProcessing) return;

    // Ctrl+C 退出 / Exit on Ctrl+C
    if (key.ctrl && char === 'c') {
      cleanup();
      exit();
      return;
    }

    // 上箭头:向上导航历史 / Up arrow: navigate up in history
    if (key.upArrow) {
      const historyCommand = navigateUp(input);
      if (historyCommand !== null) {
        setInput(historyCommand);
      }
      return;
    }

    // 下箭头:向下导航历史 / Down arrow: navigate down in history
    if (key.downArrow) {
      const historyCommand = navigateDown();
      if (historyCommand !== null) {
        setInput(historyCommand);
      }
      return;
    }

    // 回车键执行命令 / Execute command on Enter
    if (key.return) {
      if (input.trim()) {
        setShowWelcome(false);
        addToHistory(input.trim());  // 添加到历史 / Add to history
        await handleCommand(input.trim());
      }
      setInput('');
      return;
    }

    // 退格键删除字符 / Backspace to delete character
    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    // 添加普通字符 / Add regular character
    if (!key.ctrl && !key.meta && char) {
      setInput((prev) => prev + char);
    }
  });

  /**
   * 处理命令 / Handle command
   */
  const handleCommand = async (command) => {
    setIsProcessing(true);
    setOutput((prev) => [...prev, { type: 'input', text: command }]);

    const parts = command.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase().replace(/^\//, '');
    const args = parts.slice(1);

    try {
      // 创建增强的命令执行上下文 / Create enhanced command execution context
      const context = {
        // 服务层 / Services
        services: {
          db: dbManager,
          config: CLI_CONFIG,
        },

        // UI 交互层 / UI interaction
        ui: {
          addOutput: (item) => {
            setOutput((prev) => [...prev, item]);
          },
          clear: () => {
            setOutput([]);
            setShowWelcome(true);
          },
          exit: () => {
            cleanup();
            exit();
          },
        },

        // 会话状态层 / Session state
        session: {
          setUserCount: (count) => setUserCount(count),
          getUserCount: () => userCount,
        },

        // 命令注册表（用于 help 命令）/ Command registry (for help command)
        registry: registry,
      };

      // 检查命令是否存在 / Check if command exists
      if (!registry.has(cmd)) {
        context.ui.addOutput({ type: 'error', text: `Unknown command: ${cmd}` });
        context.ui.addOutput({ type: 'hint', text: 'Type /help for available commands' });
      } else {
        // 执行命令 / Execute command
        await registry.execute(cmd, args, context);
      }
    } catch (error) {
      setOutput((prev) => [
        ...prev,
        { type: 'error', text: `Command execution failed: ${error.message}` },
        { type: 'hint', text: 'Please try again or type /help for usage' },
      ]);
      console.error('Command error:', error);
    }

    setIsProcessing(false);
  };

  // 只显示最近的 N 条输出 / Only show last N output items
  const displayOutput = output.slice(-CLI_CONFIG.OUTPUT_HISTORY_LIMIT);

  return React.createElement(
    Box,
    { flexDirection: 'column' },

    // Logo
    React.createElement(Logo),

    // 欢迎信息（仅初始显示）/ Welcome message (only shown initially)
    showWelcome && React.createElement(WelcomeMessage),

    // 输出历史 / Output history
    output.length > 0 &&
      React.createElement(Box, { flexDirection: 'column', marginY: 1 }, displayOutput.map(renderOutput)),

    // 输入提示符 / Input prompt
    React.createElement(
      Box,
      { borderStyle: 'round', borderColor: 'cyan', paddingX: 1 },
      React.createElement(Text, { color: 'magenta', bold: true }, '❯ '),
      React.createElement(Text, null, input),
      !isProcessing && React.createElement(Text, { color: 'cyan' }, '█'),
      input.length === 0 && !isProcessing && React.createElement(Text, { dimColor: true }, ' Type your command or /help')
    ),

    // 状态栏 / Status bar
    React.createElement(StatusBar, {
      userCount,
      processing: isProcessing,
      dbPath: resolveDbPath(),
      uptime,
      historyCount: getHistoryCount(),
    })
  );
};

// 启动 CLI / Start CLI
render(React.createElement(AionCLI));
