/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 用户列表命令 / Users List Command
 */

import { UserRepository } from '../database.mjs';

/**
 * 格式化数据库中的时间戳
 * Format database timestamps
 */
function formatDate(timestamp) {
  if (!timestamp) {
    return 'N/A';
  }
  try {
    return new Date(Number(timestamp)).toLocaleDateString();
  } catch (error) {
    return 'Invalid date';
  }
}

export const usersCommand = {
  name: 'users',
  altNames: ['list-users', 'ls'],
  description: 'List all users',

  async action(context, _args) {
    try {
      const users = UserRepository.fetchAll();

      context.ui.addOutput({ type: 'info', text: `Found ${users.length} user(s):` });

      users.forEach((user) => {
        const createdDate = formatDate(user.created_at);
        context.ui.addOutput({
          type: 'plain',
          text: `  ${user.username} (ID: ${user.id}, Created: ${createdDate})`,
        });
      });

      // 更新会话中的用户数量 / Update user count in session
      context.session.setUserCount(users.length);
    } catch (error) {
      context.ui.addOutput({ type: 'error', text: `Error: ${error.message}` });
    }
  },
};
