/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * UI 组件 / UI Components
 */

import React from 'react';
import { Box, Text } from 'ink';
import { CLI_CONFIG } from './config.mjs';

/**
 * ASCII Logo 组件
 * ASCII Logo Component
 */
export const Logo = () => {
  return React.createElement(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    React.createElement(
      Text,
      { bold: true },
      React.createElement(Text, { color: 'cyan' }, '    _    _              '),
      React.createElement(Text, { color: 'blue' }, ' _   _  ___ ')
    ),
    React.createElement(
      Text,
      { bold: true },
      React.createElement(Text, { color: 'cyan' }, '  /  \\  (_) ___  _ __  '),
      React.createElement(Text, { color: 'blue' }, ' | | | ||_ _|')
    ),
    React.createElement(
      Text,
      { bold: true },
      React.createElement(Text, { color: 'cyan' }, ' /  _ \\ | |/ _ \\| \'_ \\ '),
      React.createElement(Text, { color: 'blue' }, ' | | | | | | ')
    ),
    React.createElement(
      Text,
      { bold: true },
      React.createElement(Text, { color: 'cyan' }, '/  ___ \\| | (_) | | | |'),
      React.createElement(Text, { color: 'blue' }, ' | |_| | | | ')
    ),
    React.createElement(
      Text,
      { bold: true },
      React.createElement(Text, { color: 'cyan' }, '\\_/   \\_\\_|\\___/|_| |_|'),
      React.createElement(Text, { color: 'blue' }, ' \\__ __/|___|')
    )
  );
};

/**
 * 欢迎信息组件
 * Welcome Message Component
 */
export const WelcomeMessage = () => {
  return React.createElement(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    React.createElement(Text, { bold: true, color: 'white' }, 'Tips for getting started:'),
    React.createElement(Text, { color: 'green' }, '1. Start AionUi WebUI with /start'),
    React.createElement(Text, { color: 'gray' }, '2. Reset user password with /resetpass <username>'),
    React.createElement(Text, { color: 'gray' }, '3. List all users with /users'),
    React.createElement(Text, { color: 'gray' }, '4. Use ↑↓ arrows to navigate command history'),
    React.createElement(Text, { color: 'gray' }, '5. Type /help for more information'),
    React.createElement(Text, { color: 'gray' }, '6. Press Ctrl+C to exit')
  );
};

/**
 * 格式化运行时间
 * Format uptime
 */
function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * 格式化数据库路径 (只显示文件名)
 * Format database path (show only filename)
 */
function formatDbPath(fullPath) {
  const parts = fullPath.split('/');
  const filename = parts[parts.length - 1];
  const parentDir = parts[parts.length - 2];
  return parentDir ? `${parentDir}/${filename}` : filename;
}

/**
 * 状态栏组件
 * Status Bar Component
 */
export const StatusBar = ({ userCount, processing, dbPath, uptime, historyCount }) => {
  return React.createElement(
    Box,
    { marginTop: 1, borderStyle: 'round', borderColor: 'gray', paddingX: 1, justifyContent: 'space-between' },

    // 左侧:用户数和数据库路径 / Left: user count and database path
    React.createElement(
      Box,
      null,
      React.createElement(Text, { dimColor: true }, '👤 '),
      React.createElement(Text, { color: 'cyan' }, userCount.toString()),
      React.createElement(Text, { dimColor: true }, ' user(s)'),
      React.createElement(Text, { dimColor: true }, '  |  '),
      React.createElement(Text, { dimColor: true }, '📁 '),
      React.createElement(Text, { color: 'blue' }, formatDbPath(dbPath))
    ),

    // 右侧:运行时间、历史数量和处理状态 / Right: uptime, history count and processing status
    React.createElement(
      Box,
      null,
      React.createElement(Text, { dimColor: true }, '⏱️ '),
      React.createElement(Text, { color: 'green' }, formatUptime(uptime)),
      React.createElement(Text, { dimColor: true }, '  |  '),
      React.createElement(Text, { dimColor: true }, '📜 '),
      React.createElement(Text, { color: 'magenta' }, historyCount.toString()),
      React.createElement(Text, { dimColor: true }, '  |  '),
      processing
        ? React.createElement(Text, { color: 'yellow' }, '⏳ processing')
        : React.createElement(Text, { color: 'green' }, '✓ ready')
    )
  );
};

/**
 * 渲染输出项
 * Render output item
 */
export const renderOutput = (item, index) => {
  // 从配置获取颜色和图标 / Get colors and icons from config
  const colors = CLI_CONFIG.UI.COLORS;
  const icons = CLI_CONFIG.UI.ICONS;

  return React.createElement(
    Box,
    { key: index },
    item.type !== 'plain' && React.createElement(Text, { color: colors[item.type], bold: true }, `${icons[item.type]} `),
    React.createElement(Text, { color: item.type === 'plain' ? 'white' : colors[item.type] }, item.text)
  );
};
