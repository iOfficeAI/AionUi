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
import { resetPassword, listUsers, showHelp, getUserCount } from './cli/commands.mjs';
import { Logo, WelcomeMessage, StatusBar, renderOutput } from './cli/components.mjs';

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
  const { exit } = useApp();

  // 挂载时加载用户数量 / Load user count on mount
  React.useEffect(() => {
    setUserCount(getUserCount());
  }, []);

  // 处理键盘输入 / Handle keyboard input
  useInput(async (char, key) => {
    if (isProcessing) return;

    // Ctrl+C 退出 / Exit on Ctrl+C
    if (key.ctrl && char === 'c') {
      exit();
      return;
    }

    // 回车键执行命令 / Execute command on Enter
    if (key.return) {
      if (input.trim()) {
        setShowWelcome(false);
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

    let result;

    // 路由到对应的命令处理器 / Route to corresponding command handler
    switch (cmd) {
      case 'resetpass':
        if (args.length === 0) {
          result = {
            success: false,
            messages: [{ type: 'error', text: 'Usage: /resetpass <username>' }],
          };
        } else {
          result = await resetPassword(args[0]);
        }
        break;

      case 'users':
        result = listUsers();
        if (result.userCount !== undefined) {
          setUserCount(result.userCount);
        }
        break;

      case 'help':
        result = showHelp();
        break;

      case 'clear':
        setOutput([]);
        setShowWelcome(true);
        setIsProcessing(false);
        return;

      default:
        result = {
          success: false,
          messages: [
            { type: 'error', text: `Unknown command: ${cmd}` },
            { type: 'hint', text: 'Type /help for available commands' },
          ],
        };
    }

    // 添加命令执行结果到输出 / Add command result to output
    if (result && result.messages) {
      setOutput((prev) => [...prev, ...result.messages]);
    }

    setIsProcessing(false);
  };

  // 只显示最近的 12 条输出 / Only show last 12 output items
  const displayOutput = output.slice(-12);

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
    React.createElement(StatusBar, { userCount, processing: isProcessing })
  );
};

// 启动 CLI / Start CLI
render(React.createElement(AionCLI));
