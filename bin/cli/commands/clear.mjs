/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 清屏命令 / Clear Command
 */

export const clearCommand = {
  name: 'clear',
  altNames: ['cls'],
  description: 'Clear screen and conversation history',

  async action(context, _args) {
    context.ui.clear();
  },
};
