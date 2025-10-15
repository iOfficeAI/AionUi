/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 重置密码命令 / Reset Password Command
 */

import crypto from 'crypto';
import { UserRepository, ConfigRepository, PasswordUtils } from '../database.mjs';

export const resetpassCommand = {
  name: 'resetpass',
  altNames: ['reset-password', 'passwd'],
  description: 'Reset user password',
  usage: '/resetpass <username>',

  async action(context, args) {
    // 参数验证 / Validate arguments
    if (args.length === 0) {
      context.ui.addOutput({ type: 'error', text: 'Username is required' });
      context.ui.addOutput({ type: 'hint', text: 'Usage: /resetpass <username>' });
      return;
    }

    const username = args[0];

    try {
      // 查找用户 / Find user
      const user = UserRepository.findByUsername(username);
      if (!user) {
        context.ui.addOutput({ type: 'error', text: `User '${username}' not found` });
        return;
      }

      // 生成新密码 / Generate new password
      const newPassword = PasswordUtils.generate();
      const hashedPassword = await PasswordUtils.hash(newPassword);

      // 更新密码 / Update password
      const updated = UserRepository.updatePassword(user.id, hashedPassword);
      if (!updated) {
        context.ui.addOutput({ type: 'error', text: 'Failed to update password in database' });
        return;
      }

      // 轮换 JWT Secret 使旧 Token 失效 / Rotate JWT secret to invalidate old tokens
      const newJwtSecret = crypto.randomBytes(64).toString('hex');
      ConfigRepository.set('jwt_secret', newJwtSecret);

      // 显示结果 / Display result
      context.ui.addOutput({ type: 'success', text: 'Password reset successfully!' });
      context.ui.addOutput({ type: 'info', text: `Username: ${user.username}` });
      context.ui.addOutput({ type: 'info', text: `New Password: ${newPassword}` });
      context.ui.addOutput({ type: 'warning', text: 'All previous sessions have been invalidated' });
      context.ui.addOutput({ type: 'hint', text: 'Please save this password and login again!' });
    } catch (error) {
      context.ui.addOutput({ type: 'error', text: `Error: ${error.message}` });
    }
  },
};
