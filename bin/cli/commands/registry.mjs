/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 命令注册中心 (简化版) / Command Registry (Simplified)
 */

import { startCommand } from './start.mjs';
import { resetpassCommand } from './resetpass.mjs';
import { usersCommand } from './users.mjs';
import { helpCommand } from './help.mjs';
import { clearCommand } from './clear.mjs';

/**
 * 命令加载器
 * Command Loader
 */
export class CommandLoader {
  /**
   * 加载所有命令
   * Load all commands
   */
  loadCommands() {
    const commands = [
      startCommand,
      resetpassCommand,
      usersCommand,
      helpCommand,
      clearCommand,
      // 添加条件命令示例 / Example of conditional commands
      // ...(process.env.NODE_ENV === 'development' ? [debugCommand] : []),
    ];

    return commands.filter((cmd) => cmd !== null);
  }
}

/**
 * 命令注册表
 * Command Registry
 */
export class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.aliasMap = new Map(); // 别名映射 / Alias mapping
    this.loadCommands();
  }

  /**
   * 加载所有命令
   * Load all commands
   */
  loadCommands() {
    const loader = new CommandLoader();
    const commands = loader.loadCommands();

    commands.forEach((command) => {
      // 注册主命令名 / Register main command name
      this.commands.set(command.name, command);

      // 注册别名 / Register aliases
      if (command.altNames && Array.isArray(command.altNames)) {
        command.altNames.forEach((alias) => {
          this.aliasMap.set(alias, command.name);
        });
      }
    });
  }

  /**
   * 通过名称或别名获取命令
   * Get command by name or alias
   */
  get(nameOrAlias) {
    // 先尝试直接匹配 / Try direct match first
    if (this.commands.has(nameOrAlias)) {
      return this.commands.get(nameOrAlias);
    }

    // 再尝试别名匹配 / Try alias match
    const realName = this.aliasMap.get(nameOrAlias);
    if (realName) {
      return this.commands.get(realName);
    }

    return undefined;
  }

  /**
   * 检查命令是否存在
   * Check if command exists
   */
  has(nameOrAlias) {
    return this.commands.has(nameOrAlias) || this.aliasMap.has(nameOrAlias);
  }

  /**
   * 执行命令
   * Execute command
   */
  async execute(nameOrAlias, args, context) {
    const command = this.get(nameOrAlias);
    if (!command) {
      throw new Error(`Unknown command: ${nameOrAlias}`);
    }

    // 执行命令的 action 函数 / Execute command action
    return await command.action(context, args);
  }

  /**
   * 获取所有命令
   * Get all commands
   */
  getAll() {
    return this.commands;
  }

  /**
   * 重新加载命令 (用于热重载) / Reload commands (for hot reload)
   */
  reload() {
    this.commands.clear();
    this.aliasMap.clear();
    this.loadCommands();
  }
}

// 导出单例实例 / Export singleton instance
export const registry = new CommandRegistry();
