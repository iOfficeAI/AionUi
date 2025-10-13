/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * UI 组件 / UI Components
 */

import React from 'react';
import { Box, Text } from 'ink';

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
    React.createElement(Text, { color: 'gray' }, '4. Type /help for more information'),
    React.createElement(Text, { color: 'gray' }, '5. Press Ctrl+C to exit')
  );
};

/**
 * 状态栏组件
 * Status Bar Component
 */
export const StatusBar = ({ userCount, processing }) => {
  return React.createElement(
    Box,
    { marginTop: 1, borderStyle: 'round', borderColor: 'gray', paddingX: 1 },
    React.createElement(Text, { dimColor: true }, `~ ${userCount} user(s)`),
    React.createElement(Text, { dimColor: true }, '  |  '),
    processing
      ? React.createElement(Text, { color: 'yellow' }, '⏳ processing...')
      : React.createElement(Text, { color: 'green' }, '✓ ready')
  );
};

/**
 * 渲染输出项
 * Render output item
 */
export const renderOutput = (item, index) => {
  // 消息类型对应的颜色 / Colors for message types
  const colors = {
    input: 'magenta',
    success: 'green',
    error: 'red',
    warning: 'yellow',
    info: 'cyan',
    hint: 'gray',
    plain: 'white',
  };

  // 消息类型对应的图标 / Icons for message types
  const icons = {
    input: '❯',
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ',
    hint: '→',
    plain: ' ',
  };

  return React.createElement(
    Box,
    { key: index },
    item.type !== 'plain' && React.createElement(Text, { color: colors[item.type], bold: true }, `${icons[item.type]} `),
    React.createElement(Text, { color: item.type === 'plain' ? 'white' : colors[item.type] }, item.text)
  );
};
