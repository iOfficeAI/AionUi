/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { acpDetector } from '@process/agent/acp/AcpDetector';
import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { ProcessConfig } from '@process/utils/initStorage';
import { conversationServiceSingleton } from '@/process/services/conversationServiceSingleton';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { getChannelMessageService } from '../agent/ChannelMessageService';
import { getChannelManager } from '../core/ChannelManager';
import type { AgentDisplayInfo } from '../plugins/telegram/TelegramKeyboards';
import {
  createAgentSelectionKeyboard,
  createHelpKeyboard,
  createMainMenuKeyboard,
  createSessionControlKeyboard,
} from '../plugins/telegram/TelegramKeyboards';
import { getChannelConversationName, resolveChannelConvType } from '../types';
import {
  createAgentSelectionCard,
  createFeaturesCard,
  createHelpCard,
  createMainMenuCard,
  createPairingGuideCard,
  createSessionStatusCard,
  createSettingsCard,
  createTipsCard,
} from '../plugins/lark/LarkCards';
import {
  createAgentSelectionCard as createDingTalkAgentSelectionCard,
  createFeaturesCard as createDingTalkFeaturesCard,
  createHelpCard as createDingTalkHelpCard,
  createMainMenuCard as createDingTalkMainMenuCard,
  createPairingGuideCard as createDingTalkPairingGuideCard,
  createSessionStatusCard as createDingTalkSessionStatusCard,
  createSettingsCard as createDingTalkSettingsCard,
  createTipsCard as createDingTalkTipsCard,
} from '../plugins/dingtalk/DingTalkCards';
import type { ChannelAgentType, PluginType } from '../types';
import type { ActionHandler, IRegisteredAction } from './types';
import { SystemActionNames, createErrorResponse, createSuccessResponse } from './types';
import { GOOGLE_AUTH_PROVIDER_ID } from '@/common/config/constants';
import { buildChannelConversationExtra } from '../utils';

/**
 * Get the default model for Channel assistant (Telegram/Lark)
 * Reads from saved config or falls back to default Gemini model
 */

export async function getChannelDefaultModel(platform: PluginType): Promise<TProviderWithModel> {
  try {
    const providers = await ProcessConfig.get('model.config');
    const providerList = providers && Array.isArray(providers) ? providers : [];

    // Helper: find a provider with a valid API key
    const findProviderWithApiKey = (providerId: string, modelName: string): TProviderWithModel | null => {
      const provider = providerList.find((p) => p.id === providerId);
      if (provider?.apiKey && provider.model?.includes(modelName)) {
        return { ...provider, useModel: modelName } as TProviderWithModel;
      }
      return null;
    };

    // Try to get saved model selection
    const savedModel =
      platform === 'lark'
        ? await ProcessConfig.get('assistant.lark.defaultModel')
        : platform === 'dingtalk'
          ? await ProcessConfig.get('assistant.dingtalk.defaultModel')
          : platform === 'weixin'
            ? await ProcessConfig.get('assistant.weixin.defaultModel')
            : platform === 'wecom'
              ? await ProcessConfig.get('assistant.wecom.defaultModel')
              : await ProcessConfig.get('assistant.telegram.defaultModel');
    if (savedModel?.id && savedModel?.useModel) {
      if (savedModel.id === GOOGLE_AUTH_PROVIDER_ID) {
        // Google OAuth credentials are stored locally by Gemini CLI (~/.gemini/oauth_creds.json).
        // If the user has already logged in on desktop, we can reuse those credentials in
        // channel mode without requiring a browser flow.
        const credsPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
        let hasLocalCreds = false;
        try {
          const content = await fs.promises.readFile(credsPath, 'utf-8');
          const creds = JSON.parse(content);
          hasLocalCreds = !!(creds?.access_token || creds?.refresh_token);
        } catch {
          // credentials file missing or invalid
        }

        if (hasLocalCreds) {
          // The google-auth-gemini provider is a frontend-only synthetic provider — it is NOT
          // stored in model.config. Construct it directly with platform='gemini-with-google-auth'
          // so that getProviderAuthType() returns AuthType.LOGIN_WITH_GOOGLE, which makes
          // GeminiAgentManager read oauth_creds.json and use OAuth instead of an empty API key.
          return {
            id: GOOGLE_AUTH_PROVIDER_ID,
            name: 'Gemini Google Auth',
            platform: 'gemini-with-google-auth',
            baseUrl: '',
            apiKey: '',
            model: [savedModel.useModel],
            useModel: savedModel.useModel,
            enabled: true,
          } as TProviderWithModel;
        }

        // No local OAuth credentials — try to fall back to an API key provider for the same model.
        console.warn(
          `[SystemActions] Google Auth oauth_creds.json missing or empty for channel mode (${platform}), falling back to API key provider`
        );
        const fallback = providerList.find(
          (p) => p.platform === 'gemini' && p.apiKey && p.model?.includes(savedModel.useModel)
        );
        if (fallback) {
          return {
            ...fallback,
            useModel: savedModel.useModel,
          } as TProviderWithModel;
        }
        // Otherwise fall through to general fallback below
      } else {
        // For regular (API-key-based) providers, look up full config
        const result = findProviderWithApiKey(savedModel.id, savedModel.useModel);
        if (result) return result;
      }
    }

    // Fallback: try to get any Gemini provider with a valid API key
    const geminiProvider = providerList.find((p) => p.platform === 'gemini' && p.apiKey && p.model?.length);
    if (geminiProvider) {
      return {
        ...geminiProvider,
        useModel: geminiProvider.model[0],
      } as TProviderWithModel;
    }

    // Last resort: any provider with a valid API key
    const anyProvider = providerList.find((p) => p.apiKey && p.model?.length);
    if (anyProvider) {
      console.warn(`[SystemActions] No Gemini provider with API key, using ${anyProvider.platform} provider`);
      return {
        ...anyProvider,
        useModel: anyProvider.model[0],
      } as TProviderWithModel;
    }

    // Before giving up: check if the user has Google OAuth credentials from Gemini CLI.
    // This handles the common case where no model/provider is explicitly configured for
    // the channel, but the user has already logged in via `gemini auth login`.
    const credsPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
    try {
      const content = await fs.promises.readFile(credsPath, 'utf-8');
      const creds = JSON.parse(content);
      if (creds?.access_token || creds?.refresh_token) {
        console.warn('[SystemActions] No API key provider found; falling back to Google OAuth credentials.');
        return {
          id: GOOGLE_AUTH_PROVIDER_ID,
          name: 'Gemini Google Auth',
          platform: 'gemini-with-google-auth',
          baseUrl: '',
          apiKey: '',
          model: ['gemini-2.0-flash'],
          useModel: 'gemini-2.0-flash',
          enabled: true,
        } as TProviderWithModel;
      }
    } catch {
      // credentials file missing or unreadable — fall through
    }
  } catch (error) {
    console.warn('[SystemActions] Failed to get saved model, using default:', error);
  }

  // Default fallback - minimal config for Gemini (no API key — will fail with clear error)
  console.error('[SystemActions] No provider with valid API key found. Channel messages will fail.');
  return {
    id: 'gemini_default',
    platform: 'gemini',
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
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

  // Clear existing session and agent for this user+chat
  const existingSession = sessionManager.getSession(context.channelUser.id, context.chatId);
  if (existingSession) {
    // Clear agent cache in ChannelMessageService
    const messageService = getChannelMessageService();
    await messageService.clearContext(existingSession.id);

    // Kill the worker for the old conversation
    if (existingSession.conversationId) {
      try {
        workerTaskManager.kill(existingSession.conversationId);
      } catch (err) {
        console.warn(`[SystemActions] Failed to kill old conversation:`, err);
      }
    }
  }
  await sessionManager.clearSession(context.channelUser.id, context.chatId);

  const platform = context.platform;
  const source =
    platform === 'lark'
      ? 'lark'
      : platform === 'dingtalk'
        ? 'dingtalk'
        : platform === 'weixin'
          ? 'weixin'
          : platform === 'wecom'
            ? 'wecom'
            : 'telegram';

  // Selected agent (defaults to Gemini)
  let savedAgent: unknown = undefined;
  try {
    savedAgent = await (platform === 'lark'
      ? ProcessConfig.get('assistant.lark.agent')
      : platform === 'dingtalk'
        ? ProcessConfig.get('assistant.dingtalk.agent')
        : platform === 'weixin'
          ? ProcessConfig.get('assistant.weixin.agent')
          : platform === 'wecom'
            ? ProcessConfig.get('assistant.wecom.agent')
            : ProcessConfig.get('assistant.telegram.agent'));
  } catch {
    // ignore
  }
  const backend = (
    savedAgent && typeof savedAgent === 'object' && typeof (savedAgent as any).backend === 'string'
      ? (savedAgent as any).backend
      : 'gemini'
  ) as string;
  const customAgentId =
    savedAgent && typeof savedAgent === 'object'
      ? ((savedAgent as any).customAgentId as string | undefined)
      : undefined;
  const agentName =
    savedAgent && typeof savedAgent === 'object' ? ((savedAgent as any).name as string | undefined) : undefined;

  // Provider model is required by typing; ACP/Codex will ignore it.
  const model = await getChannelDefaultModel(platform);

  // Always create a NEW conversation for "session.new" (scoped by chatId)
  const channelChatId = context.chatId;
  const { convType, convBackend } = resolveChannelConvType(backend);
  const name = getChannelConversationName(platform, convType, convBackend, channelChatId);
  const conversationExtra = buildChannelConversationExtra({
    platform,
    backend,
    customAgentId,
    agentName,
  });

  let newConversation: TChatConversation;
  try {
    if (backend === 'gemini') {
      newConversation = await conversationServiceSingleton.createConversation({
        type: 'gemini',
        model,
        source,
        name,
        channelChatId,
        extra: conversationExtra,
      });
    } else if (backend === 'codex') {
      newConversation = await conversationServiceSingleton.createConversation({
        type: 'acp',
        model,
        source,
        name,
        channelChatId,
        extra: { ...conversationExtra, backend: 'codex' },
      });
    } else if (backend === 'openclaw-gateway') {
      newConversation = await conversationServiceSingleton.createConversation({
        type: 'openclaw-gateway',
        model,
        source,
        name,
        channelChatId,
        extra: conversationExtra,
      });
    } else {
      newConversation = await conversationServiceSingleton.createConversation({
        type: 'acp',
        model,
        source,
        name,
        channelChatId,
        extra: conversationExtra,
      });
    }
  } catch (error) {
    return createErrorResponse(`Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Create session with the new conversation ID (scoped by chatId)
  const agentType = convType as ChannelAgentType;
  const session = await sessionManager.createSessionWithConversation(
    context.channelUser,
    newConversation.id,
    agentType,
    undefined,
    channelChatId
  );

  const markup =
    context.platform === 'lark'
      ? createMainMenuCard()
      : context.platform === 'dingtalk'
        ? createDingTalkMainMenuCard()
        : createMainMenuKeyboard();
  return createSuccessResponse({
    type: 'text',
    text: `🆕 <b>New Session Created</b>\n\nSession ID: <code>${session.id.slice(-8)}</code>\n\nYou can start a new conversation now!`,
    parseMode: 'HTML',
    replyMarkup: markup,
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
  const session = userId ? sessionManager.getSession(userId, context.chatId) : null;

  // Use platform-specific markup
  if (context.platform === 'lark') {
    const sessionData = session
      ? {
          id: session.id,
          agentType: session.agentType,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
        }
      : undefined;
    return createSuccessResponse({
      type: 'text',
      text: '', // Lark card includes the text
      replyMarkup: createSessionStatusCard(sessionData),
    });
  }

  if (context.platform === 'dingtalk') {
    const sessionData = session
      ? {
          id: session.id,
          agentType: session.agentType,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
        }
      : undefined;
    return createSuccessResponse({
      type: 'text',
      text: '', // DingTalk card includes the text
      replyMarkup: createDingTalkSessionStatusCard(sessionData),
    });
  }

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
    text: [
      '📊 <b>Session Status</b>',
      '',
      `🤖 Agent: <code>${session.agentType}</code>`,
      `⏱ Duration: ${duration} min`,
      `📝 Last activity: ${lastActivity} sec ago`,
      `🔖 Session ID: <code>${session.id.slice(-8)}</code>`,
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createSessionControlKeyboard(),
  });
};

/**
 * Handle help.show - Show help menu
 */
export const handleHelpShow: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '', // Lark card includes the text
      replyMarkup: createHelpCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkHelpCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: [
      '❓ <b>AionUi Assistant</b>',
      '',
      'A remote assistant to interact with AionUi via Telegram.',
      '',
      '<b>Common Actions:</b>',
      '• 🆕 New Chat - Start a new session',
      '• 📊 Status - View current session status',
      '• ❓ Help - Show this help message',
      '',
      'Send a message to chat with the AI assistant.',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createHelpKeyboard(),
  });
};

/**
 * Handle help.features - Show feature introduction
 */
export const handleHelpFeatures: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createFeaturesCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkFeaturesCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: [
      '🤖 <b>Features</b>',
      '',
      '<b>AI Chat</b>',
      '• Natural language conversation',
      '• Streaming output, real-time display',
      '• Context memory support',
      '',
      '<b>Session Management</b>',
      '• Single session mode',
      '• Clear context anytime',
      '• View session status',
      '',
      '<b>Message Actions</b>',
      '• Copy reply content',
      '• Regenerate reply',
      '• Continue conversation',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createHelpKeyboard(),
  });
};

/**
 * Handle help.pairing - Show pairing guide
 */
export const handleHelpPairing: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createPairingGuideCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkPairingGuideCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: [
      '🔗 <b>Pairing Guide</b>',
      '',
      '<b>First-time Setup:</b>',
      '1. Send any message to the bot',
      '2. Bot displays pairing code',
      '3. Approve pairing in AionUi settings',
      '4. Ready to use after pairing',
      '',
      '<b>Notes:</b>',
      '• Pairing code valid for 10 minutes',
      '• AionUi app must be running',
      '• One Telegram account can only pair once',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createHelpKeyboard(),
  });
};

/**
 * Handle help.tips - Show usage tips
 */
export const handleHelpTips: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createTipsCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkTipsCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: [
      '💬 <b>Tips</b>',
      '',
      '<b>Effective Conversations:</b>',
      '• Be clear and specific',
      '• Feel free to ask follow-ups',
      '• Regenerate if not satisfied',
      '',
      '<b>Quick Actions:</b>',
      '• Use bottom buttons for quick access',
      '• Tap message buttons for actions',
      '• New chat clears history context',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createHelpKeyboard(),
  });
};

/**
 * Handle settings.show - Show settings info
 */
export const handleSettingsShow: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createSettingsCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkSettingsCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: [
      '⚙️ <b>Settings</b>',
      '',
      'Channel settings need to be configured in the AionUi app.',
      '',
      'Open AionUi → WebUI → Channels',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createMainMenuKeyboard(),
  });
};

/**
 * Handle agent.show - Show agent selection keyboard/card
 */
export const handleAgentShow: ActionHandler = async (context) => {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();

  if (!sessionManager) {
    return createErrorResponse('Session manager not available');
  }

  // Get current agent type from session (scoped by chatId)
  const userId = context.channelUser?.id;
  const session = userId ? sessionManager.getSession(userId, context.chatId) : null;
  const currentAgent = session?.agentType || 'gemini';

  // Get available agents dynamically
  const availableAgents = getAvailableChannelAgents();

  if (availableAgents.length === 0) {
    return createErrorResponse('No agents available');
  }

  // Use platform-specific markup
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '', // Lark card includes the text
      replyMarkup: createAgentSelectionCard(availableAgents, currentAgent),
    });
  }

  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkAgentSelectionCard(availableAgents, currentAgent),
    });
  }

  return createSuccessResponse({
    type: 'text',
    text: [
      '🔄 <b>Switch Agent</b>',
      '',
      'Select an AI agent for your conversations:',
      '',
      `Current: <b>${getAgentDisplayName(currentAgent)}</b>`,
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createAgentSelectionKeyboard(availableAgents, currentAgent),
  });
};

/**
 * Handle agent.select - Switch to a different agent
 */
export const handleAgentSelect: ActionHandler = async (context, params) => {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();

  if (!sessionManager) {
    return createErrorResponse('Session manager not available');
  }

  if (!context.channelUser) {
    return createErrorResponse('User not authorized');
  }

  const newAgentType = params?.agentType as ChannelAgentType;

  // Validate agent type is available
  const availableAgents = getAvailableChannelAgents();
  const isValidAgent = availableAgents.some((agent) => agent.type === newAgentType);
  if (!newAgentType || !isValidAgent) {
    return createErrorResponse('Invalid or unavailable agent type');
  }

  // Get current session (scoped by chatId)
  const existingSession = sessionManager.getSession(context.channelUser.id, context.chatId);

  // If same agent, no need to switch
  if (existingSession?.agentType === newAgentType) {
    const markup =
      context.platform === 'lark'
        ? createMainMenuCard()
        : context.platform === 'dingtalk'
          ? createDingTalkMainMenuCard()
          : createMainMenuKeyboard();
    return createSuccessResponse({
      type: 'text',
      text: `✓ Already using <b>${getAgentDisplayName(newAgentType)}</b>`,
      parseMode: 'HTML',
      replyMarkup: markup,
    });
  }

  // Clear existing session and agent (scoped by chatId)
  if (existingSession) {
    const messageService = getChannelMessageService();
    await messageService.clearContext(existingSession.id);

    if (existingSession.conversationId) {
      try {
        workerTaskManager.kill(existingSession.conversationId);
      } catch (err) {
        console.warn(`[SystemActions] Failed to kill old conversation:`, err);
      }
    }
  }
  await sessionManager.clearSession(context.channelUser.id, context.chatId);

  // Create new session with the selected agent type (scoped by chatId)
  const session = await sessionManager.createSession(context.channelUser, newAgentType, undefined, context.chatId);

  const markup =
    context.platform === 'lark'
      ? createMainMenuCard()
      : context.platform === 'dingtalk'
        ? createDingTalkMainMenuCard()
        : createMainMenuKeyboard();
  return createSuccessResponse({
    type: 'text',
    text: [
      `✓ <b>Switched to ${getAgentDisplayName(newAgentType)}</b>`,
      '',
      'A new conversation has been started.',
      '',
      'Send a message to begin!',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: markup,
  });
};

/**
 * Get display name for agent type
 */
function getAgentDisplayName(agentType: ChannelAgentType): string {
  const names: Record<ChannelAgentType, string> = {
    gemini: '🤖 Gemini',
    acp: '🧠 Claude',
    codex: '⚡ Codex',
    'openclaw-gateway': '🦞 OpenClaw',
  };
  return names[agentType] || agentType;
}

/**
 * Map backend type to ChannelAgentType
 * Only returns types that are supported by channels
 */
function backendToChannelAgentType(backend: string): ChannelAgentType | null {
  const mapping: Record<string, ChannelAgentType> = {
    gemini: 'gemini',
    claude: 'acp',
    codex: 'codex',
    'openclaw-gateway': 'openclaw-gateway',
  };
  return mapping[backend] || null;
}

/**
 * Get emoji for agent backend
 */
function getAgentEmoji(backend: string): string {
  const emojis: Record<string, string> = {
    gemini: '🤖',
    claude: '🧠',
    codex: '⚡',
    'openclaw-gateway': '🦞',
  };
  return emojis[backend] || '🤖';
}

/**
 * Get available agents for channel selection
 * Filters detected agents to only those supported by channels
 */
function getAvailableChannelAgents(): AgentDisplayInfo[] {
  const detectedAgents = acpDetector.getDetectedAgents();
  const availableAgents: AgentDisplayInfo[] = [];
  const seenTypes = new Set<ChannelAgentType>();

  // Always include Gemini as it's built-in
  availableAgents.push({ type: 'gemini', emoji: '🤖', name: 'Gemini' });
  seenTypes.add('gemini');

  // Add detected ACP agents (claude, codex, etc.)
  for (const agent of detectedAgents) {
    const channelType = backendToChannelAgentType(agent.backend);
    if (channelType && !seenTypes.has(channelType)) {
      availableAgents.push({
        type: channelType,
        emoji: getAgentEmoji(agent.backend),
        name: agent.name,
      });
      seenTypes.add(channelType);
    }
  }

  return availableAgents;
}

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
  {
    name: SystemActionNames.AGENT_SHOW,
    category: 'system',
    description: 'Show agent selection',
    handler: handleAgentShow,
  },
  {
    name: SystemActionNames.AGENT_SELECT,
    category: 'system',
    description: 'Switch to a different agent',
    handler: handleAgentSelect,
  },
];
