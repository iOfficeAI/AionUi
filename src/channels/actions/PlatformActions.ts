/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IActionContext, IActionResult, IRegisteredAction, ActionHandler } from './types';
import { PlatformActionNames, createSuccessResponse, createErrorResponse } from './types';
import { getPairingService } from '../pairing/PairingService';
import { createPairingCodeKeyboard, createPairingStatusKeyboard, createMainMenuKeyboard } from '../plugins/telegram/TelegramKeyboards';

/**
 * PlatformActions - Handlers for platform-specific actions
 *
 * Currently contains Telegram-specific pairing actions.
 * These actions are handled by the plugin itself, not through the Gateway.
 */

/**
 * Handle pairing.show - Show pairing code to user
 * Called when user sends /start or first message
 */
export const handlePairingShow: ActionHandler = async (context) => {
  const pairingService = getPairingService();

  // Check if user is already authorized
  if (pairingService.isUserAuthorized(context.userId, context.platform)) {
    return createSuccessResponse({
      type: 'text',
      text: ['✅ <b>已授权</b>', '', '您的账号已经完成配对，可以直接使用。', '', '发送消息开始对话，或使用下方按钮进行操作。'].join('\n'),
      parseMode: 'HTML',
      replyMarkup: createMainMenuKeyboard(),
    });
  }

  // Generate pairing code
  try {
    const { code, expiresAt } = await pairingService.generatePairingCode(context.userId, context.platform, context.displayName);

    const expiresInMinutes = Math.ceil((expiresAt - Date.now()) / 1000 / 60);

    return createSuccessResponse({
      type: 'text',
      text: ['🔗 <b>设备配对</b>', '', '请在 AionUi 应用中批准此配对请求：', '', `<code>${code}</code>`, '', `⏱ 有效期: ${expiresInMinutes} 分钟`, '', '<b>步骤:</b>', '1. 打开 AionUi 应用', '2. 进入 设置 → Assistant', '3. 在「待批准配对」中点击「批准」'].join('\n'),
      parseMode: 'HTML',
      replyMarkup: createPairingCodeKeyboard(),
    });
  } catch (error: any) {
    return createErrorResponse(`配对码生成失败: ${error.message}`);
  }
};

/**
 * Handle pairing.refresh - Refresh pairing code
 */
export const handlePairingRefresh: ActionHandler = async (context) => {
  const pairingService = getPairingService();

  // Check if user is already authorized
  if (pairingService.isUserAuthorized(context.userId, context.platform)) {
    return createSuccessResponse({
      type: 'text',
      text: '✅ 您已经完成配对，无需刷新配对码。',
      parseMode: 'HTML',
      replyMarkup: createMainMenuKeyboard(),
    });
  }

  // Generate new pairing code
  try {
    const { code, expiresAt } = await pairingService.refreshPairingCode(context.userId, context.platform, context.displayName);

    const expiresInMinutes = Math.ceil((expiresAt - Date.now()) / 1000 / 60);

    return createSuccessResponse({
      type: 'text',
      text: ['🔄 <b>新配对码</b>', '', `<code>${code}</code>`, '', `⏱ 有效期: ${expiresInMinutes} 分钟`, '', '请在 AionUi 设置中批准此配对请求。'].join('\n'),
      parseMode: 'HTML',
      replyMarkup: createPairingCodeKeyboard(),
    });
  } catch (error: any) {
    return createErrorResponse(`刷新配对码失败: ${error.message}`);
  }
};

/**
 * Handle pairing.check - Check pairing status
 */
export const handlePairingCheck: ActionHandler = async (context) => {
  const pairingService = getPairingService();

  // Check if user is already authorized
  if (pairingService.isUserAuthorized(context.userId, context.platform)) {
    return createSuccessResponse({
      type: 'text',
      text: ['✅ <b>配对成功！</b>', '', '您的账号已完成配对，现在可以开始使用了。', '', '发送消息与 AI 助手对话。'].join('\n'),
      parseMode: 'HTML',
      replyMarkup: createMainMenuKeyboard(),
    });
  }

  // Check for pending request
  const pendingRequest = pairingService.getPendingRequestForUser(context.userId, context.platform);

  if (pendingRequest) {
    const expiresInMinutes = Math.ceil((pendingRequest.expiresAt - Date.now()) / 1000 / 60);

    return createSuccessResponse({
      type: 'text',
      text: ['⏳ <b>等待批准</b>', '', `配对码: <code>${pendingRequest.code}</code>`, `剩余时间: ${expiresInMinutes} 分钟`, '', '请在 AionUi 设置中批准配对请求。'].join('\n'),
      parseMode: 'HTML',
      replyMarkup: createPairingStatusKeyboard(),
    });
  }

  // No pending request - need to generate new code
  return handlePairingShow(context);
};

/**
 * Handle pairing.help - Show pairing help
 */
export const handlePairingHelp: ActionHandler = async (context) => {
  return createSuccessResponse({
    type: 'text',
    text: ['❓ <b>配对帮助</b>', '', '<b>什么是配对？</b>', '配对是将您的 Telegram 账号与本地 AionUi 关联的过程。', '只有配对后才能使用 AI 助手功能。', '', '<b>配对步骤:</b>', '1. 获取配对码（发送任意消息）', '2. 打开 AionUi 应用', '3. 进入 设置 → Assistant', '4. 在待批准列表中点击「批准」', '', '<b>常见问题:</b>', '• 配对码 10 分钟有效，过期请刷新', '• 需要 AionUi 应用在运行中', '• 确保网络连接正常'].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createPairingCodeKeyboard(),
  });
};

/**
 * All platform actions
 */
export const platformActions: IRegisteredAction[] = [
  {
    name: PlatformActionNames.PAIRING_SHOW,
    category: 'platform',
    description: 'Show pairing code',
    handler: handlePairingShow,
  },
  {
    name: PlatformActionNames.PAIRING_REFRESH,
    category: 'platform',
    description: 'Refresh pairing code',
    handler: handlePairingRefresh,
  },
  {
    name: PlatformActionNames.PAIRING_CHECK,
    category: 'platform',
    description: 'Check pairing status',
    handler: handlePairingCheck,
  },
  {
    name: PlatformActionNames.PAIRING_HELP,
    category: 'platform',
    description: 'Show pairing help',
    handler: handlePairingHelp,
  },
];
