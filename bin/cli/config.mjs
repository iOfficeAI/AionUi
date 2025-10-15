/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * CLI 配置管理 / CLI Configuration Management
 */

/**
 * CLI 全局配置
 * CLI Global Configuration
 */
export const CLI_CONFIG = {
  // 输出历史限制 / Output history limit
  OUTPUT_HISTORY_LIMIT: 12,

  // 密码配置 / Password configuration
  PASSWORD: {
    BASE_LENGTH: 12,
    LENGTH_VARIANCE: 5,
    CHARSET: {
      LOWERCASE: 'abcdefghijklmnopqrstuvwxyz',
      UPPERCASE: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      DIGITS: '0123456789',
      SPECIAL: '!@#$%^&*',
    },
  },

  // 数据库配置 / Database configuration
  DATABASE: {
    BCRYPT_ROUNDS: 12,
    SYSTEM_USER_ID: 'system_default_user',
    DEFAULT_PATH: '.aionui/aionui.db',
    ENV_KEY: 'AIONUI_DB_PATH',
  },

  // 命令配置 / Command configuration
  COMMANDS: {
    PREFIX: '/',
    AVAILABLE: [
      'start', 
      'resetpass', 
      'users', 
      'help', 
      'clear'
    ],
  },

  // UI 配置 / UI configuration
  UI: {
    COLORS: {
      INPUT: 'magenta',
      SUCCESS: 'green',
      ERROR: 'red',
      WARNING: 'yellow',
      INFO: 'cyan',
      HINT: 'gray',
      PLAIN: 'white',
    },
    ICONS: {
      INPUT: '❯',
      SUCCESS: '✓',
      ERROR: '✗',
      WARNING: '⚠',
      INFO: 'ℹ',
      HINT: '→',
      PLAIN: ' ',
    },
  },
};

/**
 * 获取配置值的辅助函数
 * Helper function to get config value
 */
export function getConfig(path) {
  const keys = path.split('.');
  let value = CLI_CONFIG;
  for (const key of keys) {
    value = value[key];
    if (value === undefined) return null;
  }
  return value;
}
