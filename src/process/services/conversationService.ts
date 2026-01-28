/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/ipcBridge';
import type { ConversationSource, TChatConversation, TProviderWithModel } from '@/common/storage';
import { getDatabase } from '@process/database';
import path from 'path';
import { createAcpAgent, createCodexAgent, createGeminiAgent } from '../initAgent';
import type AcpAgentManager from '../task/AcpAgentManager';
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
  /** 会话来源 / Conversation source */
  source?: ConversationSource;
  /** 自定义会话 ID / Custom conversation ID */
  id?: string;
  /** 自定义会话名称 / Custom conversation name */
  name?: string;
}

/**
 * 创建会话的通用参数（基于 IPC 参数扩展）
 * Common parameters for creating conversation (extends IPC params)
 */
export interface ICreateConversationOptions extends ICreateConversationParams {
  /** 会话来源 / Conversation source */
  source?: ConversationSource;
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
      const conversation = await createGeminiAgent(params.model, params.workspace, params.defaultFiles, params.webSearchEngine, params.customWorkspace, contextFileName, params.presetRules, params.enabledSkills, params.presetAssistantId);

      // Apply custom ID and name if provided
      if (params.id) {
        conversation.id = params.id;
      }
      if (params.name) {
        conversation.name = params.name;
      }

      // Set source
      if (params.source) {
        conversation.source = params.source;
      }

      // Register with WorkerManage
      WorkerManage.buildConversation(conversation);

      // Save to database
      const db = getDatabase();
      const result = db.createConversation(conversation);
      if (!result.success) {
        console.error('[ConversationService] Failed to create conversation in database:', result.error);
        return { success: false, error: result.error };
      }

      console.log(`[ConversationService] Created conversation ${conversation.id} with source=${params.source || 'aionui'}`);
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

        conversation = await createGeminiAgent(model, extra.workspace, extra.defaultFiles, extra.webSearchEngine, extra.customWorkspace, contextFileName, presetRules, enabledSkills, presetAssistantId);
      } else if (type === 'acp') {
        conversation = await createAcpAgent(params);
      } else if (type === 'codex') {
        conversation = await createCodexAgent(params);
      } else {
        return { success: false, error: 'Invalid conversation type' };
      }

      // Apply custom ID, name and source
      if (name) {
        conversation.name = name;
      }
      if (id) {
        conversation.id = id;
      }
      if (source) {
        conversation.source = source;
      }

      // Register with WorkerManage
      const task = WorkerManage.buildConversation(conversation);
      if (task.type === 'acp') {
        void (task as AcpAgentManager).initAgent();
      }

      // Save to database
      const db = getDatabase();
      const result = db.createConversation(conversation);
      if (!result.success) {
        console.error('[ConversationService] Failed to create conversation in database:', result.error);
        return { success: false, error: result.error };
      }

      console.log(`[ConversationService] Created ${type} conversation ${conversation.id} with source=${source || 'aionui'}`);
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
   * 获取或创建 Telegram 会话
   * Get or create a Telegram conversation
   *
   * 优先复用最后一个 source='telegram' 的会话，没有则创建新会话
   * Prefers reusing the latest conversation with source='telegram', creates new if none exists
   */
  static async getOrCreateTelegramConversation(params: ICreateGeminiConversationParams): Promise<ICreateConversationResult> {
    const db = getDatabase();

    // Try to find existing telegram conversation
    const latestTelegramConv = db.getLatestConversationBySource('telegram');
    if (latestTelegramConv.success && latestTelegramConv.data) {
      console.log(`[ConversationService] Reusing existing telegram conversation: ${latestTelegramConv.data.id}`);
      return { success: true, conversation: latestTelegramConv.data };
    }

    // Create new telegram conversation
    return this.createGeminiConversation({
      ...params,
      source: 'telegram',
      name: params.name || 'Telegram Assistant',
    });
  }
}

// Export convenience functions
export const createGeminiConversation = ConversationService.createGeminiConversation.bind(ConversationService);
export const createConversation = ConversationService.createConversation.bind(ConversationService);
export const getOrCreateTelegramConversation = ConversationService.getOrCreateTelegramConversation.bind(ConversationService);
