/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import type { TProviderWithModel } from '@/common/storage';
import { ProcessConfig } from '@/process/initStorage';
import WorkerManage from '@/process/WorkerManage';
import { getChannelMessageService } from '../agent/ChannelMessageService';
import { getChannelManager } from '../core/ChannelManager';
import type { AgentDisplayInfo } from '../plugins/telegram/TelegramKeyboards';
import { createAgentSelectionKeyboard, createHelpKeyboard, createMainMenuKeyboard, createSessionControlKeyboard } from '../plugins/telegram/TelegramKeyboards';
import { getChannelConversationName } from '../types';
import { createChannelConversation, loadStoredChannelAgent } from '../utils/channelConversationConfig';
import { createAgentSelectionCard, createFeaturesCard, createHelpCard, createMainMenuCard, createPairingGuideCard, createSessionStatusCard, createSettingsCard, createTipsCard } from '../plugins/lark/LarkCards';
import { createAgentSelectionCard as createDingTalkAgentSelectionCard, createFeaturesCard as createDingTalkFeaturesCard, createHelpCard as createDingTalkHelpCard, createMainMenuCard as createDingTalkMainMenuCard, createPairingGuideCard as createDingTalkPairingGuideCard, createSessionStatusCard as createDingTalkSessionStatusCard, createSettingsCard as createDingTalkSettingsCard, createTipsCard as createDingTalkTipsCard } from '../plugins/dingtalk/DingTalkCards';
import type { ChannelAgentType, PluginType } from '../types';
import type { ActionHandler, IRegisteredAction } from './types';
import { SystemActionNames, createErrorResponse, createSuccessResponse } from './types';
import { GOOGLE_AUTH_PROVIDER_ID } from '@/common/constants';

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
    const savedModel = platform === 'lark' ? await ProcessConfig.get('assistant.lark.defaultModel') : platform === 'dingtalk' ? await ProcessConfig.get('assistant.dingtalk.defaultModel') : await ProcessConfig.get('assistant.telegram.defaultModel');
    if (savedModel?.id && savedModel?.useModel) {
      // Google Auth is frontend-only (OAuth browser flow), not usable in channels.
      // Fall through to find a provider with a valid API key instead.
      if (savedModel.id === GOOGLE_AUTH_PROVIDER_ID) {
        console.warn(`[SystemActions] Google Auth is not supported in channel mode (${platform}), falling back to API key provider`);
        // Try to find any Gemini provider with API key for the same model
        const fallback = providerList.find((p) => p.platform === 'gemini' && p.apiKey && p.model?.includes(savedModel.useModel));
        if (fallback) {
          return { ...fallback, useModel: savedModel.useModel } as TProviderWithModel;
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

const getPluginAgentKey = (pluginId: string) => `assistant.plugin.${pluginId}.agent` as const;

const getPlatformAgentKey = (platform: PluginType) => `assistant.${platform}.agent` as const;

function isDefaultPluginInstance(platform: PluginType, pluginId: string): boolean {
  return pluginId === platform || pluginId === `${platform}_default`;
}

function toStoredChannelAgent(agentType: ChannelAgentType, availableAgents: AgentDisplayInfo[]): { backend: string; customAgentId?: string; name?: string } | null {
  const selectedAgent = availableAgents.find((agent) => agent.type === agentType);
  if (!selectedAgent) {
    return null;
  }

  const backendMap: Record<ChannelAgentType, string> = {
    gemini: 'gemini',
    acp: 'claude',
    codex: 'codex',
    'openclaw-gateway': 'openclaw-gateway',
  };

  return {
    backend: backendMap[agentType],
    name: selectedAgent.name,
  };
}

function isSameStoredAgentSelection(currentAgent: { backend: string; customAgentId?: string }, nextAgent: { backend: string; customAgentId?: string }): boolean {
  return currentAgent.backend === nextAgent.backend && currentAgent.customAgentId === nextAgent.customAgentId;
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
        WorkerManage.kill(existingSession.conversationId);
      } catch (err) {
        console.warn(`[SystemActions] Failed to kill old conversation:`, err);
      }
    }
  }
  sessionManager.clearSession(context.channelUser.id, context.chatId);

  const platform = context.platform;
  const source = platform === 'lark' ? 'lark' : platform === 'dingtalk' ? 'dingtalk' : 'telegram';

  // Provider model is required by typing; ACP/Codex will ignore it.
  const model = await getChannelDefaultModel(platform);

  // Always create a NEW conversation for "session.new" (scoped by chatId)
  const channelChatId = context.chatId;
  const result = await createChannelConversation({
    platform,
    pluginId: context.pluginId,
    source,
    chatId: channelChatId,
    name: getChannelConversationName(platform, undefined, undefined, channelChatId),
    model,
  });

  if (!result.success || !result.conversation || !result.channelAgentType) {
    return createErrorResponse(`Failed to create session: ${result.error || 'Unknown error'}`);
  }

  const workspace = typeof result.conversation.extra?.workspace === 'string' ? result.conversation.extra.workspace : result.workspace;
  const session = sessionManager.createSessionWithConversation(context.channelUser, result.conversation.id, result.channelAgentType, workspace, channelChatId);

  const markup = context.platform === 'lark' ? createMainMenuCard() : context.platform === 'dingtalk' ? createDingTalkMainMenuCard() : createMainMenuKeyboard();
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
    const sessionData = session ? { id: session.id, agentType: session.agentType, createdAt: session.createdAt, lastActivity: session.lastActivity } : undefined;
    return createSuccessResponse({
      type: 'text',
      text: '', // Lark card includes the text
      replyMarkup: createSessionStatusCard(sessionData),
    });
  }

  if (context.platform === 'dingtalk') {
    const sessionData = session ? { id: session.id, agentType: session.agentType, createdAt: session.createdAt, lastActivity: session.lastActivity } : undefined;
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
    text: ['📊 <b>Session Status</b>', '', `🤖 Agent: <code>${session.agentType}</code>`, `⏱ Duration: ${duration} min`, `📝 Last activity: ${lastActivity} sec ago`, `🔖 Session ID: <code>${session.id.slice(-8)}</code>`].join('\n'),
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
    text: ['❓ <b>AionUi Assistant</b>', '', 'A remote assistant to interact with AionUi via Telegram.', '', '<b>Common Actions:</b>', '• 🆕 New Chat - Start a new session', '• 📊 Status - View current session status', '• ❓ Help - Show this help message', '', 'Send a message to chat with the AI assistant.'].join('\n'),
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
    text: ['🤖 <b>Features</b>', '', '<b>AI Chat</b>', '• Natural language conversation', '• Streaming output, real-time display', '• Context memory support', '', '<b>Session Management</b>', '• Single session mode', '• Clear context anytime', '• View session status', '', '<b>Message Actions</b>', '• Copy reply content', '• Regenerate reply', '• Continue conversation'].join('\n'),
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
    text: ['🔗 <b>Pairing Guide</b>', '', '<b>First-time Setup:</b>', '1. Send any message to the bot', '2. Bot displays pairing code', '3. Approve pairing in AionUi settings', '4. Ready to use after pairing', '', '<b>Notes:</b>', '• Pairing code valid for 10 minutes', '• AionUi app must be running', '• One Telegram account can only pair once'].join('\n'),
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
    text: ['💬 <b>Tips</b>', '', '<b>Effective Conversations:</b>', '• Be clear and specific', '• Feel free to ask follow-ups', '• Regenerate if not satisfied', '', '<b>Quick Actions:</b>', '• Use bottom buttons for quick access', '• Tap message buttons for actions', '• New chat clears history context'].join('\n'),
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
    text: ['⚙️ <b>Settings</b>', '', 'Channel settings need to be configured in the AionUi app.', '', 'Open AionUi → WebUI → Channels'].join('\n'),
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
  const savedAgent = session ? null : await loadStoredChannelAgent(context.platform, context.pluginId);
  const currentAgent = session?.agentType ?? (savedAgent ? backendToChannelAgentType(savedAgent.backend) : null) ?? 'gemini';

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
    text: ['🔄 <b>Switch Agent</b>', '', 'Select an AI agent for your conversations:', '', `Current: <b>${getAgentDisplayName(currentAgent)}</b>`].join('\n'),
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
  const selectedAgent = newAgentType ? toStoredChannelAgent(newAgentType, availableAgents) : null;
  if (!newAgentType || !selectedAgent) {
    return createErrorResponse('Invalid or unavailable agent type');
  }

  // Get current session (scoped by chatId)
  const existingSession = sessionManager.getSession(context.channelUser.id, context.chatId);
  const savedAgent = await loadStoredChannelAgent(context.platform, context.pluginId);
  const settingsChanged = !isSameStoredAgentSelection(savedAgent, selectedAgent);

  // If same agent, no need to switch
  if (!settingsChanged && existingSession?.agentType === newAgentType) {
    const markup = context.platform === 'lark' ? createMainMenuCard() : context.platform === 'dingtalk' ? createDingTalkMainMenuCard() : createMainMenuKeyboard();
    return createSuccessResponse({
      type: 'text',
      text: `✓ Already using <b>${getAgentDisplayName(newAgentType)}</b>`,
      parseMode: 'HTML',
      replyMarkup: markup,
    });
  }

  if (settingsChanged) {
    try {
      await ProcessConfig.set(getPluginAgentKey(context.pluginId) as any, selectedAgent);
      if (isDefaultPluginInstance(context.platform, context.pluginId)) {
        await ProcessConfig.set(getPlatformAgentKey(context.platform) as any, selectedAgent);
      }
    } catch (error: any) {
      return createErrorResponse(`Failed to save agent selection: ${error.message || 'Unknown error'}`);
    }

    const syncResult = await manager.syncChannelSettings(context.platform, selectedAgent, undefined, context.pluginId);
    if (!syncResult.success) {
      return createErrorResponse(syncResult.error || 'Failed to sync channel settings');
    }
  }

  // Clear existing session and agent (scoped by chatId)
  if (existingSession) {
    const messageService = getChannelMessageService();
    await messageService.clearContext(existingSession.id);

    if (existingSession.conversationId) {
      try {
        WorkerManage.kill(existingSession.conversationId);
      } catch (err) {
        console.warn(`[SystemActions] Failed to kill old conversation:`, err);
      }
    }
  }
  sessionManager.clearSession(context.channelUser.id, context.chatId);

  const platform = context.platform;
  const source = platform === 'lark' ? 'lark' : platform === 'dingtalk' ? 'dingtalk' : 'telegram';
  const model = await getChannelDefaultModel(platform);
  const result = await createChannelConversation({
    platform,
    pluginId: context.pluginId,
    source,
    chatId: context.chatId,
    name: getChannelConversationName(platform, undefined, undefined, context.chatId),
    model,
  });

  if (!result.success || !result.conversation || !result.channelAgentType) {
    return createErrorResponse(`Failed to switch agent: ${result.error || 'Unknown error'}`);
  }

  const workspace = typeof result.conversation.extra?.workspace === 'string' ? result.conversation.extra.workspace : result.workspace;
  sessionManager.createSessionWithConversation(context.channelUser, result.conversation.id, result.channelAgentType, workspace, context.chatId);

  const markup = context.platform === 'lark' ? createMainMenuCard() : context.platform === 'dingtalk' ? createDingTalkMainMenuCard() : createMainMenuKeyboard();
  return createSuccessResponse({
    type: 'text',
    text: [`✓ <b>Switched to ${getAgentDisplayName(newAgentType)}</b>`, '', 'A new conversation has been started.', '', 'Send a message to begin!'].join('\n'),
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
export function backendToChannelAgentType(backend: string): ChannelAgentType | null {
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
export function getAvailableChannelAgents(): AgentDisplayInfo[] {
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
