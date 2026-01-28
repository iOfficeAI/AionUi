/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/storage';
import { ProcessConfig } from '@/process/initStorage';
import { ConversationService } from '@/process/services/conversationService';
import WorkerManage from '@/process/WorkerManage';
import { getChannelMessageService } from '../agent/ChannelMessageService';
import { getChannelManager } from '../core/ChannelManager';
import { createHelpKeyboard, createMainMenuKeyboard, createSessionControlKeyboard } from '../plugins/telegram/TelegramKeyboards';
import type { ActionHandler, IRegisteredAction } from './types';
import { SystemActionNames, createErrorResponse, createSuccessResponse } from './types';

/**
 * Get the default model for Telegram assistant
 * Reads from saved config or falls back to default Gemini model
 */
export async function getTelegramDefaultModel(): Promise<TProviderWithModel> {
  try {
    // Try to get saved model selection
    const savedModel = await ProcessConfig.get('assistant.telegram.defaultModel');
    if (savedModel?.id && savedModel?.useModel) {
      // Get full provider config from model.config
      const providers = await ProcessConfig.get('model.config');
      if (providers && Array.isArray(providers)) {
        const provider = providers.find((p) => p.id === savedModel.id);
        if (provider && provider.model?.includes(savedModel.useModel)) {
          return {
            ...provider,
            useModel: savedModel.useModel,
          } as TProviderWithModel;
        }
      }
    }

    // Fallback: try to get any Gemini provider
    const providers = await ProcessConfig.get('model.config');
    if (providers && Array.isArray(providers)) {
      const geminiProvider = providers.find((p) => p.platform === 'gemini');
      if (geminiProvider && geminiProvider.model?.length > 0) {
        return {
          ...geminiProvider,
          useModel: geminiProvider.model[0],
        } as TProviderWithModel;
      }
    }
  } catch (error) {
    console.warn('[SystemActions] Failed to get saved model, using default:', error);
  }

  // Default fallback - minimal config for Gemini
  return {
    id: 'gemini_default',
    platform: 'gemini',
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: '',
    useModel: 'gemini-2.0-flash',
  };
}

/**
 * SystemActions - Handlers for system-level actions
 *
 * These actions handle session management, help, and settings.
 * They don't require AI processing - just system operations.
 */

/**
 * Handle session.new - Create a new conversation session
 */
export const handleSessionNew: ActionHandler = async (context) => {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();

  if (!sessionManager) {
    return createErrorResponse('Session manager not available');
  }

  if (!context.channelUser) {
    return createErrorResponse('User not authorized');
  }

  // Clear existing session and agent for this user
  // 清除现有会话和 agent
  const existingSession = sessionManager.getSession(context.channelUser.id);
  if (existingSession) {
    // 清除 ChannelMessageService 中的 agent 缓存
    const messageService = getChannelMessageService();
    await messageService.clearContext(existingSession.id);

    // 直接使用 session.conversationId 清理 WorkerManage 中的 agent
    // 确保即使 sessionConversationMap 为空也能正确清理
    if (existingSession.conversationId) {
      try {
        WorkerManage.kill(existingSession.conversationId);
        console.log(`[SystemActions] Killed old conversation: ${existingSession.conversationId}`);
      } catch (err) {
        console.warn(`[SystemActions] Failed to kill old conversation:`, err);
      }
    }
  }
  sessionManager.clearSession(context.channelUser.id);

  // 获取用户选择的模型 / Get user selected model
  const model = await getTelegramDefaultModel();

  // 使用 ConversationService 创建新会话（始终创建新的，不复用）
  // Use ConversationService to create new conversation (always new, don't reuse)
  const result = await ConversationService.createGeminiConversation({
    model,
    source: 'telegram',
    name: 'Telegram Assistant',
  });

  if (!result.success || !result.conversation) {
    return createErrorResponse(`Failed to create session: ${result.error || 'Unknown error'}`);
  }

  // Create session with the new conversation ID
  // 使用新会话 ID 创建 session
  const session = sessionManager.createSessionWithConversation(context.channelUser, result.conversation.id);

  return createSuccessResponse({
    type: 'text',
    text: `🆕 <b>New Session Created</b>\n\nSession ID: <code>${session.id.slice(-8)}</code>\n\nYou can start a new conversation now!`,
    parseMode: 'HTML',
    replyMarkup: createMainMenuKeyboard(),
  });
};

/**
 * Handle session.status - Show current session status
 */
export const handleSessionStatus: ActionHandler = async (context) => {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();

  if (!sessionManager) {
    return createErrorResponse('Session manager not available');
  }

  const userId = context.channelUser?.id;
  const session = userId ? sessionManager.getSession(userId) : null;

  if (!session) {
    return createSuccessResponse({
      type: 'text',
      text: '📊 <b>Session Status</b>\n\nNo active session.\n\nSend a message to start a new conversation, or tap the "New Chat" button.',
      parseMode: 'HTML',
      replyMarkup: createSessionControlKeyboard(),
    });
  }

  const duration = Math.floor((Date.now() - session.createdAt) / 1000 / 60);
  const lastActivity = Math.floor((Date.now() - session.lastActivity) / 1000);

  return createSuccessResponse({
    type: 'text',
    text: ['📊 <b>Session Status</b>', '', `🤖 Agent: <code>${session.agentType}</code>`, `⏱ Duration: ${duration} min`, `📝 Last activity: ${lastActivity} sec ago`, `🔖 Session ID: <code>${session.id.slice(-8)}</code>`].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createSessionControlKeyboard(),
  });
};

/**
 * Handle help.show - Show help menu
 */
export const handleHelpShow: ActionHandler = async (context) => {
  return createSuccessResponse({
    type: 'text',
    text: ['❓ <b>AionUi Assistant</b>', '', 'A remote assistant to interact with AionUi via Telegram.', '', '<b>Common Actions:</b>', '• 🆕 New Chat - Start a new session', '• 📊 Status - View current session status', '• ❓ Help - Show this help message', '', 'Send a message to chat with the AI assistant.'].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createHelpKeyboard(),
  });
};

/**
 * Handle help.features - Show feature introduction
 */
export const handleHelpFeatures: ActionHandler = async (context) => {
  return createSuccessResponse({
    type: 'text',
    text: ['🤖 <b>Features</b>', '', '<b>AI Chat</b>', '• Natural language conversation', '• Streaming output, real-time display', '• Context memory support', '', '<b>Session Management</b>', '• Single session mode', '• Clear context anytime', '• View session status', '', '<b>Message Actions</b>', '• Copy reply content', '• Regenerate reply', '• Continue conversation'].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createHelpKeyboard(),
  });
};

/**
 * Handle help.pairing - Show pairing guide
 */
export const handleHelpPairing: ActionHandler = async (context) => {
  return createSuccessResponse({
    type: 'text',
    text: ['🔗 <b>Pairing Guide</b>', '', '<b>First-time Setup:</b>', '1. Send any message to the bot', '2. Bot displays pairing code', '3. Approve pairing in AionUi settings', '4. Ready to use after pairing', '', '<b>Notes:</b>', '• Pairing code valid for 10 minutes', '• AionUi app must be running', '• One Telegram account can only pair once'].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createHelpKeyboard(),
  });
};

/**
 * Handle help.tips - Show usage tips
 */
export const handleHelpTips: ActionHandler = async (context) => {
  return createSuccessResponse({
    type: 'text',
    text: ['💬 <b>Tips</b>', '', '<b>Effective Conversations:</b>', '• Be clear and specific', '• Feel free to ask follow-ups', '• Regenerate if not satisfied', '', '<b>Quick Actions:</b>', '• Use bottom buttons for quick access', '• Tap message buttons for actions', '• New chat clears history context'].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createHelpKeyboard(),
  });
};

/**
 * Handle settings.show - Show settings info
 */
export const handleSettingsShow: ActionHandler = async (context) => {
  return createSuccessResponse({
    type: 'text',
    text: ['⚙️ <b>Settings</b>', '', 'Channel settings need to be configured in the AionUi app.', '', 'Open AionUi → WebUI → Channels'].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createMainMenuKeyboard(),
  });
};

/**
 * All system actions
 */
export const systemActions: IRegisteredAction[] = [
  {
    name: SystemActionNames.SESSION_NEW,
    category: 'system',
    description: 'Create a new conversation session',
    handler: handleSessionNew,
  },
  {
    name: SystemActionNames.SESSION_STATUS,
    category: 'system',
    description: 'Show current session status',
    handler: handleSessionStatus,
  },
  {
    name: SystemActionNames.HELP_SHOW,
    category: 'system',
    description: 'Show help menu',
    handler: handleHelpShow,
  },
  {
    name: SystemActionNames.HELP_FEATURES,
    category: 'system',
    description: 'Show feature introduction',
    handler: handleHelpFeatures,
  },
  {
    name: SystemActionNames.HELP_PAIRING,
    category: 'system',
    description: 'Show pairing guide',
    handler: handleHelpPairing,
  },
  {
    name: SystemActionNames.HELP_TIPS,
    category: 'system',
    description: 'Show usage tips',
    handler: handleHelpTips,
  },
  {
    name: SystemActionNames.SETTINGS_SHOW,
    category: 'system',
    description: 'Show settings info',
    handler: handleSettingsShow,
  },
];
