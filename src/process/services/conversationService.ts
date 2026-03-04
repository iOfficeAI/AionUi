/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getChannelConversationName, isChannelPlatform } from '@/channels/types';
import type { ICreateConversationParams } from '@/common/ipcBridge';
import type { ConversationSource, TChatConversation, TProviderWithModel } from '@/common/storage';
import { getDatabase } from '@process/database';
import path from 'path';
import { createAcpAgent, createCodexAgent, createGeminiAgent, createNanobotAgent, createOpenClawAgent, createSwarmConversation } from '../initAgent';
import WorkerManage from '../WorkerManage';

/**
 * 创建 Gemini 会话的参数
 * Parameters for creating a Gemini conversation
 */
export interface ICreateGeminiConversationParams {
  model: TProviderWithModel;
  workspace?: string;
  defaultFiles?: string[];
  webSearchEngine?: 'google' | 'default';
  customWorkspace?: boolean;
  contextFileName?: string;
  presetRules?: string;
  enabledSkills?: string[];
  presetAssistantId?: string;
  isHealthCheck?: boolean;
  /** 会话来源 / Conversation source */
  source?: ConversationSource;
  /** 自定义会话 ID / Custom conversation ID */
  id?: string;
  /** 自定义会话名称 / Custom conversation name */
  name?: string;
  /** Channel chat isolation ID (e.g. user:xxx, group:xxx) */
  channelChatId?: string;
}

/**
 * 创建会话的通用参数（基于 IPC 参数扩展）
 * Common parameters for creating conversation (extends IPC params)
 */
export interface ICreateConversationOptions extends ICreateConversationParams {
  /** 会话来源 / Conversation source */
  source?: ConversationSource;
  /** Channel chat isolation ID (e.g. user:xxx, group:xxx) */
  channelChatId?: string;
}

/**
 * 创建会话的返回结果
 * Result of creating a conversation
 */
export interface ICreateConversationResult {
  success: boolean;
  conversation?: TChatConversation;
  error?: string;
}

/**
 * 通用会话创建服务
 * Common conversation creation service
 *
 * 提供统一的会话创建逻辑，供 AionUI、Telegram 及其他 IM 使用
 * Provides unified conversation creation logic for AionUI, Telegram and other IMs
 */
export class ConversationService {
  /**
   * 创建 Gemini 会话
   * Create a Gemini conversation
   */
  static async createGeminiConversation(params: ICreateGeminiConversationParams): Promise<ICreateConversationResult> {
    try {
      // Resolve context file path if needed
      let contextFileName = params.contextFileName;
      if (contextFileName && !path.isAbsolute(contextFileName)) {
        contextFileName = path.resolve(process.cwd(), contextFileName);
      }

      // Create conversation object
      const conversation = await createGeminiAgent(params.model, params.workspace, params.defaultFiles, params.webSearchEngine, params.customWorkspace, contextFileName, params.presetRules, params.enabledSkills, params.presetAssistantId, undefined, params.isHealthCheck);

      // Apply custom ID and name if provided
      if (params.id) {
        conversation.id = params.id;
      }
      if (params.name) {
        conversation.name = params.name;
      }

      // Set source and channelChatId
      if (params.source) {
        conversation.source = params.source;
      }
      if (params.channelChatId) {
        conversation.channelChatId = params.channelChatId;
      }

      // Save to database
      const db = getDatabase();
      const result = db.createConversation(conversation);
      if (!result.success) {
        console.error('[ConversationService] Failed to create conversation in database:', result.error);
        return { success: false, error: result.error };
      }

      // Register with WorkerManage after DB save so early emitted messages can be persisted reliably.
      WorkerManage.buildConversation(conversation);

      console.log(`[ConversationService] Created conversation ${conversation.id} with source=${params.source || 'aionui'}, chatId=${params.channelChatId || 'none'}`);
      return { success: true, conversation };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ConversationService] Failed to create Gemini conversation:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 创建会话（通用方法，支持所有类型）
   * Create conversation (common method, supports all types)
   */
  static async createConversation(params: ICreateConversationOptions): Promise<ICreateConversationResult> {
    const { type, extra, name, model, id, source } = params;

    try {
      // Load assistant config early if presetAssistantId is provided
      let assistantConfig: import('@/assistant/types').AssistantMetadata | null = null;
      if (extra.presetAssistantId) {
        const { loadAssistantConfig } = await import('@/assistant/loadAssistantConfig');
        assistantConfig = await loadAssistantConfig(extra.presetAssistantId);
      }

      let conversation: TChatConversation;

      if (type === 'gemini') {
        const extraWithPresets = extra as typeof extra & {
          presetRules?: string;
          enabledSkills?: string[];
          presetAssistantId?: string;
        };

        let contextFileName = extra.contextFileName;
        if (contextFileName && !path.isAbsolute(contextFileName)) {
          contextFileName = path.resolve(process.cwd(), contextFileName);
        }

        const presetRules = extraWithPresets.presetRules || extraWithPresets.presetContext || extraWithPresets.context;
        const enabledSkills = extraWithPresets.enabledSkills;
        const presetAssistantId = extraWithPresets.presetAssistantId;

        conversation = await createGeminiAgent(model, extra.workspace, extra.defaultFiles, extra.webSearchEngine, extra.customWorkspace, contextFileName, presetRules, enabledSkills, presetAssistantId, extra.sessionMode, extra.isHealthCheck);
      } else if (type === 'acp') {
        // Check if this is a swarm assistant
        const isSwarmAssistant = assistantConfig?.mode === 'swarm' && !!assistantConfig?.swarm;

        if (isSwarmAssistant) {
          console.log(`[ConversationService] Creating swarm conversation for ${extra.presetAssistantId}`);
          conversation = await createSwarmConversation(params, assistantConfig!);
        } else {
          conversation = await createAcpAgent(params, assistantConfig);
        }
      } else if (type === 'codex') {
        conversation = await createCodexAgent(params, assistantConfig);
      } else if (type === 'openclaw-gateway') {
        conversation = await createOpenClawAgent(params);
      } else if (type === 'nanobot') {
        conversation = await createNanobotAgent(params);
      } else {
        return { success: false, error: 'Invalid conversation type' };
      }

      // Apply custom ID, name, source, and channelChatId
      if (name) {
        conversation.name = name;
      }
      if (id) {
        conversation.id = id;
      }
      if (source) {
        conversation.source = source;
      }
      if (params.channelChatId) {
        conversation.channelChatId = params.channelChatId;
      }

      // Save to database
      const db = getDatabase();
      const result = db.createConversation(conversation);
      if (!result.success) {
        console.error('[ConversationService] Failed to create conversation in database:', result.error);
        return { success: false, error: result.error };
      }

      // Register with WorkerManage after DB save so early emitted messages can be persisted reliably.
      // Note: Don't call initAgent() here - let it be lazy initialized when sendMessage() is called.
      // For swarm conversations, skip building task manager (swarm registers its own manager)
      if (conversation.type !== 'swarm') {
        console.log(`[ConversationService] Building conversation ${conversation.id} of type ${conversation.type}`);
        WorkerManage.buildConversation(conversation);
      } else {
        console.log(`[ConversationService] Skipping build for swarm conversation ${conversation.id}`);
      }

      console.log(`[ConversationService] Created ${conversation.type} conversation ${conversation.id} with source=${source || 'aionui'}`);
      return { success: true, conversation };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('[ConversationService] Failed to create conversation:', error);
      console.error('[ConversationService] Error details:', {
        type: params.type,
        hasModel: !!params.model,
        hasWorkspace: !!params.extra?.workspace,
        error: errorMessage,
        stack: errorStack,
      });
      return { success: false, error: `Failed to create ${params.type} conversation: ${errorMessage}` };
    }
  }

  /**
   * 获取或创建指定渠道的会话
   * Get or create a conversation for the specified channel
   *
   * 优先复用最后一个对应 source 的会话，没有则创建新会话
   * Prefers reusing the latest conversation with matching source, creates new if none exists
   */
  static async getOrCreateChannelConversation(params: ICreateGeminiConversationParams & { source: ConversationSource }): Promise<ICreateConversationResult> {
    const db = getDatabase();
    const source = params.source;

    // Per-chat lookup: find existing conversation by source + channelChatId + type, or create new
    if (params.channelChatId) {
      const latestConv = db.findChannelConversation(source, params.channelChatId, 'gemini');
      if (latestConv.success && latestConv.data) {
        console.log(`[ConversationService] Reusing existing ${source} conversation for chatId=${params.channelChatId}: ${latestConv.data.id}`);
        return { success: true, conversation: latestConv.data };
      }
    }

    // No channelChatId or no existing conversation found — always create new
    return this.createGeminiConversation({
      ...params,
      source,
      name: params.name || (isChannelPlatform(source) ? getChannelConversationName(source, 'gemini', undefined, params.channelChatId) : `${source} Assistant`),
    });
  }

  /**
   * 获取或创建 Bot 会话（按外部渠道路由）
   * Get or create a Bot conversation (routed by external channel)
   *
   * 每个外部渠道（Mezon channel/thread, Telegram group 等）对应一个独立的会话
   * Each external channel (Mezon channel/thread, Telegram group, etc.) gets its own conversation
   *
   * @param externalChannelId - 外部渠道 ID（例如 Mezon channel_id 或 thread_id）
   * @param botId - Bot ID，用于区分同一渠道中的不同 bot
   * @param params - 会话创建参数
   */
  static async getOrCreateBotConversation(externalChannelId: string, botId: string, params: ICreateConversationOptions): Promise<ICreateConversationResult> {
    const db = getDatabase();

    // Try to find existing conversation for this channel + bot
    const existingConv = db.getConversationByExternalChannel(externalChannelId, botId);
    if (existingConv.success && existingConv.data) {
      console.log(`[ConversationService] Reusing existing bot conversation: ${existingConv.data.id} (channel: ${externalChannelId.slice(0, 12)}..., bot: ${botId})`);
      return { success: true, conversation: existingConv.data };
    }

    // Look up bot config to automatically inject assistantId for workspace template
    let assistantId: string | undefined;
    try {
      const { ProcessConfig } = await import('../initStorage');
      const bots = await ProcessConfig.get('mezon.bots');
      if (bots && Array.isArray(bots)) {
        const bot = bots.find((b: { id: string }) => b.id === botId);
        if (bot?.assistantId) {
          assistantId = bot.assistantId;
          console.log(`[ConversationService] Auto-injecting assistantId from bot config: ${assistantId}`);
        }
      }
    } catch (error) {
      console.warn(`[ConversationService] Failed to look up bot assistantId:`, error);
    }

    // Create new conversation with externalChannelId, botId, and auto-injected assistantId
    const conversationParams: ICreateConversationOptions = {
      ...params,
      extra: {
        ...params.extra,
        externalChannelId,
        botId,
        // Auto-inject presetAssistantId from bot config (enables workspace template copy)
        presetAssistantId: assistantId || params.extra.presetAssistantId,
      },
    };

    console.log(`[ConversationService] Creating new bot conversation (channel: ${externalChannelId.slice(0, 12)}..., bot: ${botId})`);
    return this.createConversation(conversationParams);
  }
}

// Export convenience functions
export const createGeminiConversation = ConversationService.createGeminiConversation.bind(ConversationService);
export const createConversation = ConversationService.createConversation.bind(ConversationService);
export const getOrCreateChannelConversation = ConversationService.getOrCreateChannelConversation.bind(ConversationService);
export const getOrCreateBotConversation = ConversationService.getOrCreateBotConversation.bind(ConversationService);
