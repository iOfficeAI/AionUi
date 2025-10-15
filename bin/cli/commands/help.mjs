/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 帮助命令 / Help Command
 */

export const helpCommand = {
  name: 'help',
  altNames: ['?', 'h'],
  description: 'Show help information',

  async action(context, _args) {
    // 从 registry 获取所有命令 / Get all commands from registry
    const commands = context.registry.getAll();

    context.ui.addOutput({ type: 'info', text: 'Available commands:' });

    // 显示所有命令 / Display all commands
    for (const [name, command] of commands) {
      const usage = command.usage || `/${name}`;
      const aliases = command.altNames ? ` (${command.altNames.join(', ')})` : '';
      context.ui.addOutput({
        type: 'plain',
        text: `  ${usage.padEnd(25)}${aliases.padEnd(20)} - ${command.description}`,
      });
    }

    // 添加额外的命令 / Add extra commands
    context.ui.addOutput({ type: 'plain', text: `  /clear                    - Clear screen` });
  },
};
