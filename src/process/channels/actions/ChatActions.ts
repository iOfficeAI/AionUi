/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IRegisteredAction, ActionHandler } from './types';
import { ChatActionNames, createSuccessResponse, createErrorResponse } from './types';
import { createResponseActionsKeyboard, createErrorRecoveryKeyboard } from '../plugins/telegram/TelegramKeyboards';
import { getChannelMessageService } from '../agent/ChannelMessageService';

/**
 * ChatActions - Handlers for chat/AI-related actions
 *
 * These actions involve AI processing through Gemini or other agents.
 * They handle message sending, regeneration, and continuation.
 */

/**
 * Handle chat.send - Send a message to AI and get response
 * Note: The actual AI processing is handled by ActionExecutor
 * This handler just prepares the response format
 */
export const handleChatSend: ActionHandler = async (_context) => {
  // This action is special - it triggers AI processing
  // The ActionExecutor will handle the actual AI call
  // This handler is a placeholder for the action registration

  return createSuccessResponse({
    type: 'text',
    text: '⏳ Thinking...',
    parseMode: 'HTML',
  });
};

/**
 * Handle chat.regenerate - Regenerate the last AI response
 */
export const handleChatRegenerate: ActionHandler = async (context, params) => {
  const originalMessageId = params?.originalMessageId;

  if (!originalMessageId) {
    return createErrorResponse('Cannot find original message');
  }

  // This will trigger a regeneration
  // The ActionExecutor will handle the actual AI call
  return createSuccessResponse({
    type: 'text',
    text: '🔄 Regenerating...',
    parseMode: 'HTML',
  });
};

/**
 * Handle chat.continue - Continue the AI response
 */
export const handleChatContinue: ActionHandler = async (_context, _params) => {
  // This will trigger a continuation
  // The ActionExecutor will handle the actual AI call
  return createSuccessResponse({
    type: 'text',
    text: '💬 Continuing...',
    parseMode: 'HTML',
  });
};

/**
 * Handle action.copy - Copy response content
 * Note: Copy is handled client-side in Telegram
 */
export const handleCopy: ActionHandler = async (_context, _params) => {
  // Telegram doesn't support programmatic copy
  // We just show a toast message
  return {
    success: true,
    message: {
      type: 'text',
      text: '💡 Long press the message text to copy',
      parseMode: 'HTML',
    },
  };
};

/**
 * Handle tool confirmation from Telegram buttons
 * Callback data format: confirm:{callId}:{value}
 */
export const handleToolConfirm: ActionHandler = async (context, params) => {
  const callId = params?.callId;
  const value = params?.value;
  const conversationId = context.conversationId;

  if (!callId || !value || !conversationId) {
    console.error(
      `[ChatActions] Missing params - callId: ${callId}, value: ${value}, conversationId: ${conversationId}`
    );
    return createErrorResponse('Missing confirmation parameters');
  }

  try {
    // 只调用 confirm，不发送消息
    // Only call confirm, don't send message - agent will continue and send updates
    await getChannelMessageService().confirm(conversationId, callId, value);

    // 返回成功但不带消息，agent 会继续执行并通过流回调更新消息
    // Return success without message, agent will continue and update via stream callback
    return { success: true };
  } catch (error: any) {
    console.error('[ChatActions] Tool confirmation failed:', error);
    return createErrorResponse(`Confirmation failed: ${error.message}`);
  }
};

/**
 * All chat actions
 */
export const chatActions: IRegisteredAction[] = [
  {
    name: ChatActionNames.SEND,
    category: 'chat',
    description: 'Send a message to AI',
    handler: handleChatSend,
  },
  {
    name: ChatActionNames.REGENERATE,
    category: 'chat',
    description: 'Regenerate the last AI response',
    handler: handleChatRegenerate,
  },
  {
    name: ChatActionNames.CONTINUE,
    category: 'chat',
    description: 'Continue the AI response',
    handler: handleChatContinue,
  },
  {
    name: ChatActionNames.COPY,
    category: 'chat',
    description: 'Copy response content',
    handler: handleCopy,
  },
  {
    name: ChatActionNames.TOOL_CONFIRM,
    category: 'chat',
    description: 'Confirm tool execution',
    handler: handleToolConfirm,
  },
];

/**
 * Build a chat response with action buttons
 */
export function buildChatResponse(
  text: string,
  isComplete: boolean = true
): {
  text: string;
  parseMode: 'HTML' | 'MarkdownV2' | 'Markdown';
  replyMarkup?: unknown;
} {
  return {
    text,
    parseMode: 'HTML',
    replyMarkup: isComplete ? createResponseActionsKeyboard() : undefined,
  };
}

/**
 * Build an error response for chat failures
 */
export function buildChatErrorResponse(error: string): {
  text: string;
  parseMode: 'HTML' | 'MarkdownV2' | 'Markdown';
  replyMarkup?: unknown;
} {
  return {
    text: `❌ <b>Processing Failed</b>\n\n${error}\n\nPlease retry or start a new conversation.`,
    parseMode: 'HTML',
    replyMarkup: createErrorRecoveryKeyboard(),
  };
}

/**
 * Build a streaming indicator
 */
export function buildStreamingIndicator(partialText: string): {
  text: string;
  parseMode: 'HTML' | 'MarkdownV2' | 'Markdown';
} {
  return {
    text: partialText + ' ⏳',
    parseMode: 'HTML',
  };
}
