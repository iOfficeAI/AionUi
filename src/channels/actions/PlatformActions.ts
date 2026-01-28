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
      text: ['✅ <b>Authorized</b>', '', 'Your account is already paired and ready to use.', '', 'Send a message to start chatting, or use the buttons below.'].join('\n'),
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
      text: ['🔗 <b>Device Pairing</b>', '', 'Please approve this pairing request in the AionUi app:', '', `<code>${code}</code>`, '', `⏱ Valid for: ${expiresInMinutes} minutes`, '', '<b>Steps:</b>', '1. Open AionUi app', '2. Go to WebUI → Channels', '3. Click "Approve" in pending pairing requests'].join('\n'),
      parseMode: 'HTML',
      replyMarkup: createPairingCodeKeyboard(),
    });
  } catch (error: any) {
    return createErrorResponse(`Failed to generate pairing code: ${error.message}`);
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
      text: '✅ You are already paired. No need to refresh the pairing code.',
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
      text: ['🔄 <b>New Pairing Code</b>', '', `<code>${code}</code>`, '', `⏱ Valid for: ${expiresInMinutes} minutes`, '', 'Please approve this pairing request in AionUi settings.'].join('\n'),
      parseMode: 'HTML',
      replyMarkup: createPairingCodeKeyboard(),
    });
  } catch (error: any) {
    return createErrorResponse(`Failed to refresh pairing code: ${error.message}`);
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
      text: ['✅ <b>Pairing Successful!</b>', '', 'Your account is now paired and ready to use.', '', 'Send a message to chat with the AI assistant.'].join('\n'),
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
      text: ['⏳ <b>Waiting for Approval</b>', '', `Pairing code: <code>${pendingRequest.code}</code>`, `Time remaining: ${expiresInMinutes} minutes`, '', 'Please approve the pairing request in AionUi settings.'].join('\n'),
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
    text: ['❓ <b>Pairing Help</b>', '', '<b>What is pairing?</b>', 'Pairing links your Telegram account with the local AionUi application.', 'You need to pair before using the AI assistant.', '', '<b>Pairing steps:</b>', '1. Get pairing code (send any message)', '2. Open AionUi app', '3. Go to WebUI → Channels', '4. Click "Approve" in pending requests', '', '<b>FAQ:</b>', '• Pairing code valid for 10 minutes, refresh if expired', '• AionUi app must be running', '• Ensure network connection is stable'].join('\n'),
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
