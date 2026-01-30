/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionCategory, IChannelUser, IUnifiedIncomingMessage, IUnifiedOutgoingMessage, PluginType } from '../types';

/**
 * Action context passed to action handlers
 */
export interface IActionContext {
  // Platform information
  platform: PluginType;
  pluginId: string;

  // User information (from message)
  userId: string;
  chatId: string;
  displayName?: string;

  // Authorized assistant user (set if user is authorized)
  channelUser?: IChannelUser;

  // Session information
  sessionId?: string;
  conversationId?: string;

  // Original message
  originalMessage: IUnifiedIncomingMessage;
  originalMessageId?: string;

  // Helper functions
  sendMessage: (message: IUnifiedOutgoingMessage) => Promise<string>;
  editMessage: (messageId: string, message: IUnifiedOutgoingMessage) => Promise<void>;
}

/**
 * Action handler function type
 */
export type ActionHandler = (context: IActionContext, params?: Record<string, string>) => Promise<IActionResult>;

/**
 * Result of action execution
 */
export interface IActionResult {
  success: boolean;
  message?: IUnifiedOutgoingMessage;
  error?: string;
}

/**
 * Registered action with metadata
 */
export interface IRegisteredAction {
  name: string;
  category: ActionCategory;
  description: string;
  handler: ActionHandler;
}

/**
 * System action names
 */
export const SystemActionNames = {
  SESSION_NEW: 'session.new',
  SESSION_STATUS: 'session.status',
  HELP_SHOW: 'help.show',
  HELP_FEATURES: 'help.features',
  HELP_PAIRING: 'help.pairing',
  HELP_TIPS: 'help.tips',
  SETTINGS_SHOW: 'settings.show',
  AGENT_SHOW: 'agent.show',
  AGENT_SELECT: 'agent.select',
} as const;

/**
 * Chat action names
 */
export const ChatActionNames = {
  SEND: 'chat.send',
  REGENERATE: 'chat.regenerate',
  CONTINUE: 'chat.continue',
  COPY: 'action.copy',
  TOOL_CONFIRM: 'confirm', // Tool confirmation action
} as const;

/**
 * Platform action names (Telegram-specific)
 */
export const PlatformActionNames = {
  PAIRING_SHOW: 'pairing.show',
  PAIRING_REFRESH: 'pairing.refresh',
  PAIRING_CHECK: 'pairing.check',
  PAIRING_HELP: 'pairing.help',
} as const;

/**
 * Helper function to create a text response
 */
export function createTextResponse(
  text: string,
  options?: {
    parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';
    replyMarkup?: unknown;
  }
): IUnifiedOutgoingMessage {
  return {
    type: 'text',
    text,
    parseMode: options?.parseMode || 'HTML',
    replyMarkup: options?.replyMarkup,
  };
}

/**
 * Helper function to create an error response
 */
export function createErrorResponse(error: string): IActionResult {
  return {
    success: false,
    error,
    message: {
      type: 'text',
      text: `❌ ${error}`,
      parseMode: 'HTML',
    },
  };
}

/**
 * Helper function to create a success response
 */
export function createSuccessResponse(message?: IUnifiedOutgoingMessage): IActionResult {
  return {
    success: true,
    message,
  };
}
