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
    return createErrorResponse(`创建会话失败: ${result.error || 'Unknown error'}`);
  }

  // Create session with the new conversation ID
  // 使用新会话 ID 创建 session
  const session = sessionManager.createSessionWithConversation(context.channelUser, result.conversation.id);

  return createSuccessResponse({
    type: 'text',
    text: `🆕 <b>新会话已创建</b>\n\n会话ID: <code>${session.id.slice(-8)}</code>\n\n现在可以开始新的对话了！`,
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
      text: '📊 <b>会话状态</b>\n\n当前没有活跃会话。\n\n发送消息开始新的对话，或点击「新对话」按钮。',
      parseMode: 'HTML',
      replyMarkup: createSessionControlKeyboard(),
    });
  }

  const duration = Math.floor((Date.now() - session.createdAt) / 1000 / 60);
  const lastActivity = Math.floor((Date.now() - session.lastActivity) / 1000);

  return createSuccessResponse({
    type: 'text',
    text: ['📊 <b>会话状态</b>', '', `🤖 Agent: <code>${session.agentType}</code>`, `⏱ 会话时长: ${duration} 分钟`, `📝 最后活动: ${lastActivity} 秒前`, `🔖 会话ID: <code>${session.id.slice(-8)}</code>`].join('\n'),
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
    text: ['❓ <b>AionUi 个人助手</b>', '', '通过 Telegram 与 AionUi 交互的远程助手。', '', '<b>常用操作:</b>', '• 🆕 新对话 - 开始新的会话', '• 📊 状态 - 查看当前会话状态', '• ❓ 帮助 - 显示此帮助信息', '', '直接发送消息即可与 AI 助手对话。'].join('\n'),
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
    text: ['🤖 <b>功能介绍</b>', '', '<b>AI 对话</b>', '• 支持自然语言对话', '• 流式输出，实时显示', '• 支持上下文记忆', '', '<b>会话管理</b>', '• 单会话模式', '• 随时清空上下文', '• 会话状态查看', '', '<b>消息操作</b>', '• 复制回复内容', '• 重新生成回复', '• 继续对话'].join('\n'),
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
    text: ['🔗 <b>配对指南</b>', '', '<b>首次使用:</b>', '1. 发送任意消息给机器人', '2. 机器人显示配对码', '3. 在 AionUi 设置中批准配对', '4. 配对成功后即可使用', '', '<b>注意事项:</b>', '• 配对码 10 分钟内有效', '• 需要 AionUi 应用运行', '• 一个 Telegram 账号只能配对一次'].join('\n'),
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
    text: ['💬 <b>使用技巧</b>', '', '<b>高效对话:</b>', '• 问题描述清晰具体', '• 可以追问和补充', '• 不满意可重新生成', '', '<b>快捷操作:</b>', '• 使用底部按钮快速操作', '• 点击消息按钮进行操作', '• 新对话清空历史上下文'].join('\n'),
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
    text: ['⚙️ <b>设置</b>', '', '个人助手设置需要在 AionUi 应用中进行配置。', '', '打开 AionUi → 设置 → Assistant'].join('\n'),
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
