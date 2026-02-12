/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import type { TProviderWithModel } from '@/common/storage';
import { ProcessConfig } from '@/process/initStorage';
import { ConversationService } from '@/process/services/conversationService';
import WorkerManage from '@/process/WorkerManage';
import { getChannelMessageService } from '../agent/ChannelMessageService';
import { getChannelManager } from '../core/ChannelManager';
import type { AgentDisplayInfo } from '../plugins/telegram/TelegramKeyboards';
import { createAgentSelectionKeyboard, createHelpKeyboard, createMainMenuKeyboard, createSessionControlKeyboard } from '../plugins/telegram/TelegramKeyboards';
import { createAgentSelectionCard, createFeaturesCard, createHelpCard, createMainMenuCard, createPairingGuideCard, createSessionStatusCard, createSettingsCard, createTipsCard } from '../plugins/lark/LarkCards';
import type { ChannelAgentType, PluginType } from '../types';
import type { ActionHandler, IRegisteredAction } from './types';
import { SystemActionNames, createErrorResponse, createSuccessResponse } from './types';
import type { AcpBackend } from '@/types/acpTypes';

/**
 * Get the default model for Channel assistant (Telegram/Lark)
 * Reads from saved config or falls back to default Gemini model
 */
export async function getChannelDefaultModel(platform: PluginType): Promise<TProviderWithModel> {
  try {
    // Try to get saved model selection
    const savedModel = platform === 'lark' ? await ProcessConfig.get('assistant.lark.defaultModel') : await ProcessConfig.get('assistant.telegram.defaultModel');
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
      } catch (err) {
        console.warn(`[SystemActions] Failed to kill old conversation:`, err);
      }
    }
  }
  sessionManager.clearSession(context.channelUser.id);

  const platform = context.platform;
  const source = platform === 'lark' ? 'lark' : 'telegram';
  const name = platform === 'lark' ? 'Lark Assistant' : 'Telegram Assistant';

  // Selected agent (defaults to Gemini)
  let savedAgent: unknown = undefined;
  try {
    savedAgent = await (platform === 'lark' ? ProcessConfig.get('assistant.lark.agent') : ProcessConfig.get('assistant.telegram.agent'));
  } catch {
    // ignore
  }
  const backend = (savedAgent && typeof savedAgent === 'object' && typeof (savedAgent as any).backend === 'string' ? (savedAgent as any).backend : 'gemini') as string;
  const customAgentId = savedAgent && typeof savedAgent === 'object' ? ((savedAgent as any).customAgentId as string | undefined) : undefined;
  const agentName = savedAgent && typeof savedAgent === 'object' ? ((savedAgent as any).name as string | undefined) : undefined;

  // Provider model is required by typing; ACP/Codex will ignore it.
  const model = await getChannelDefaultModel(platform);

  // Always create a NEW conversation for "session.new"
  const result =
    backend === 'codex'
      ? await ConversationService.createConversation({
          type: 'codex',
          model,
          source,
          name,
          extra: {},
        })
      : backend === 'gemini'
        ? await ConversationService.createGeminiConversation({
            model,
            source,
            name,
          })
        : await ConversationService.createConversation({
            type: 'acp',
            model,
            source,
            name,
            extra: {
              backend: backend as AcpBackend,
              customAgentId,
              agentName,
            },
          });

  if (!result.success || !result.conversation) {
    return createErrorResponse(`Failed to create session: ${result.error || 'Unknown error'}`);
  }

  // Create session with the new conversation ID
  // 使用新会话 ID 创建 session
  const agentType: ChannelAgentType = backend === 'codex' ? 'codex' : backend === 'gemini' ? 'gemini' : 'acp';
  const session = sessionManager.createSessionWithConversation(context.channelUser, result.conversation.id, agentType);

  const markup = context.platform === 'lark' ? createMainMenuCard() : createMainMenuKeyboard();
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
  const session = userId ? sessionManager.getSession(userId) : null;

  // Use platform-specific markup
  if (context.platform === 'lark') {
    const sessionData = session ? { id: session.id, agentType: session.agentType, createdAt: session.createdAt, lastActivity: session.lastActivity } : undefined;
    return createSuccessResponse({
      type: 'text',
      text: '', // Lark card includes the text
      replyMarkup: createSessionStatusCard(sessionData),
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

  // Get current agent type from session
  const userId = context.channelUser?.id;
  const session = userId ? sessionManager.getSession(userId) : null;
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
  const isValidAgent = availableAgents.some((agent) => agent.type === newAgentType);
  if (!newAgentType || !isValidAgent) {
    return createErrorResponse('Invalid or unavailable agent type');
  }

  // Get current session
  const existingSession = sessionManager.getSession(context.channelUser.id);

  // If same agent, no need to switch
  if (existingSession?.agentType === newAgentType) {
    const markup = context.platform === 'lark' ? createMainMenuCard() : createMainMenuKeyboard();
    return createSuccessResponse({
      type: 'text',
      text: `✓ Already using <b>${getAgentDisplayName(newAgentType)}</b>`,
      parseMode: 'HTML',
      replyMarkup: markup,
    });
  }

  // Clear existing session and agent
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
  sessionManager.clearSession(context.channelUser.id);

  // Create new session with the selected agent type
  const session = sessionManager.createSession(context.channelUser, newAgentType);

  const markup = context.platform === 'lark' ? createMainMenuCard() : createMainMenuKeyboard();
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
