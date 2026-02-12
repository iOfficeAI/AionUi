/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@/process/database';
import { getChannelMessageService } from '../agent/ChannelMessageService';
import { ActionExecutor } from '../gateway/ActionExecutor';
import { PluginManager, registerPlugin } from '../gateway/PluginManager';
import { PairingService } from '../pairing/PairingService';
import { LarkPlugin } from '../plugins/lark/LarkPlugin';
import { TelegramPlugin } from '../plugins/telegram/TelegramPlugin';
import type { IChannelPluginConfig, PluginType } from '../types';
import { SessionManager } from './SessionManager';

/**
 * ChannelManager - Main orchestrator for the Channel subsystem
 *
 * Singleton pattern - manages the lifecycle of all assistant components:
 * - PluginManager: Platform plugin lifecycle (Telegram, Slack, Discord)
 * - SessionManager: User session management
 * - PairingService: Secure pairing code generation and validation
 *
 * @example
 * ```typescript
 * // Initialize on app startup
 * await ChannelManager.getInstance().initialize();
 *
 * // Shutdown on app close
 * await ChannelManager.getInstance().shutdown();
 * ```
 */
export class ChannelManager {
  private static instance: ChannelManager | null = null;

  private initialized = false;
  private pluginManager: PluginManager | null = null;
  private sessionManager: SessionManager | null = null;
  private pairingService: PairingService | null = null;
  private actionExecutor: ActionExecutor | null = null;

  private constructor() {
    // Private constructor for singleton pattern
    // Register available plugins
    registerPlugin('telegram', TelegramPlugin);
    registerPlugin('lark', LarkPlugin);
  }

  /**
   * Get the singleton instance of ChannelManager
   */
  static getInstance(): ChannelManager {
    if (!ChannelManager.instance) {
      ChannelManager.instance = new ChannelManager();
    }
    return ChannelManager.instance;
  }

  /**
   * Initialize the assistant subsystem
   * Called during app startup
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('[ChannelManager] Initializing...');

    try {
      // Initialize sub-components
      this.pairingService = new PairingService();
      this.sessionManager = new SessionManager();
      this.pluginManager = new PluginManager(this.sessionManager);

      // Create action executor and wire up message handling
      this.actionExecutor = new ActionExecutor(this.pluginManager, this.sessionManager, this.pairingService);
      this.pluginManager.setMessageHandler(this.actionExecutor.getMessageHandler());

      // Set confirm handler for tool confirmations
      // 设置工具确认处理器
      this.pluginManager.setConfirmHandler(async (userId: string, platform: string, callId: string, value: string) => {
        // 查找用户
        // Find user
        const db = getDatabase();
        const userResult = db.getChannelUserByPlatform(userId, platform as PluginType);
        if (!userResult.data) {
          console.error(`[ChannelManager] User not found: ${userId}@${platform}`);
          return;
        }

        // 查找 session 获取 conversationId
        // Find session to get conversationId
        const session = this.sessionManager?.getSession(userResult.data.id);
        if (!session?.conversationId) {
          console.error(`[ChannelManager] Session not found for user: ${userResult.data.id}`);
          return;
        }

        // 调用 confirm
        // Call confirm
        try {
          await getChannelMessageService().confirm(session.conversationId, callId, value);
        } catch (error) {
          console.error(`[ChannelManager] Tool confirmation failed:`, error);
        }
      });

      // Load and start enabled plugins from database
      await this.loadEnabledPlugins();

      this.initialized = true;
      console.log('[ChannelManager] Initialized successfully');
    } catch (error) {
      console.error('[ChannelManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the assistant subsystem
   * Called during app close
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    console.log('[ChannelManager] Shutting down...');

    try {
      // Stop all plugins
      await this.pluginManager?.stopAll();

      // Stop pairing service cleanup interval
      this.pairingService?.stop();

      // Shutdown Gemini service
      await getChannelMessageService().shutdown();

      // Cleanup
      this.pluginManager = null;
      this.sessionManager = null;
      this.pairingService = null;
      this.actionExecutor = null;

      this.initialized = false;
      console.log('[ChannelManager] Shutdown complete');
    } catch (error) {
      console.error('[ChannelManager] Shutdown error:', error);
    }
  }

  /**
   * Check if the assistant subsystem is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Load and start enabled plugins from database
   */
  private async loadEnabledPlugins(): Promise<void> {
    const db = getDatabase();
    const result = db.getChannelPlugins();

    if (!result.success || !result.data) {
      console.warn('[ChannelManager] Failed to load plugins:', result.error);
      return;
    }

    const enabledPlugins = result.data.filter((p) => p.enabled);

    for (const plugin of enabledPlugins) {
      try {
        await this.startPlugin(plugin);
      } catch (error) {
        console.error(`[ChannelManager] Failed to start plugin ${plugin.id}:`, error);
        // Update status to error
        db.updateChannelPluginStatus(plugin.id, 'error');
      }
    }
  }

  /**
   * Start a specific plugin
   */
  private async startPlugin(config: IChannelPluginConfig): Promise<void> {
    if (!this.pluginManager) {
      throw new Error('PluginManager not initialized');
    }
    await this.pluginManager.startPlugin(config);
  }

  /**
   * Enable and start a plugin
   */
  async enablePlugin(pluginId: string, config: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    // Ensure manager is initialized
    if (!this.initialized || !this.pluginManager) {
      console.error('[ChannelManager] Cannot enable plugin: manager not initialized');
      return { success: false, error: 'Assistant manager not initialized' };
    }

    const db = getDatabase();

    // Get existing plugin or create new one
    const existingResult = db.getChannelPlugin(pluginId);
    const existing = existingResult.data;

    // Extract credentials from config based on plugin type
    const pluginType = (existing?.type || this.getPluginTypeFromId(pluginId)) as PluginType;
    let credentials = existing?.credentials;

    if (pluginType === 'telegram') {
      const token = config.token as string | undefined;
      if (token) {
        credentials = { token };
      }
    } else if (pluginType === 'lark') {
      const appId = config.appId as string | undefined;
      const appSecret = config.appSecret as string | undefined;
      const encryptKey = config.encryptKey as string | undefined;
      const verificationToken = config.verificationToken as string | undefined;
      if (appId && appSecret) {
        credentials = { appId, appSecret, encryptKey, verificationToken };
      }
    }

    const pluginConfig: IChannelPluginConfig = {
      id: pluginId,
      type: pluginType,
      name: existing?.name || this.getPluginNameFromId(pluginId),
      enabled: true,
      credentials,
      config: { ...existing?.config },
      status: 'created',
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    const saveResult = db.upsertChannelPlugin(pluginConfig);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    try {
      await this.startPlugin(pluginConfig);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Disable and stop a plugin
   */
  async disablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const db = getDatabase();

    try {
      // Stop the plugin
      await this.pluginManager?.stopPlugin(pluginId);

      // Update database
      const existingResult = db.getChannelPlugin(pluginId);
      if (existingResult.data) {
        const updated: IChannelPluginConfig = {
          ...existingResult.data,
          enabled: false,
          status: 'stopped',
          updatedAt: Date.now(),
        };
        db.upsertChannelPlugin(updated);
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Test a plugin connection without enabling it
   */
  async testPlugin(pluginId: string, token: string, extraConfig?: { appId?: string; appSecret?: string }): Promise<{ success: boolean; botUsername?: string; error?: string }> {
    const pluginType = this.getPluginTypeFromId(pluginId);

    if (pluginType === 'telegram') {
      const result = await TelegramPlugin.testConnection(token);
      return {
        success: result.success,
        botUsername: result.botInfo?.username,
        error: result.error,
      };
    }

    if (pluginType === 'lark') {
      const appId = extraConfig?.appId;
      const appSecret = extraConfig?.appSecret;
      if (!appId || !appSecret) {
        return { success: false, error: 'App ID and App Secret are required for Lark' };
      }
      const result = await LarkPlugin.testConnection(appId, appSecret);
      return {
        success: result.success,
        botUsername: result.botInfo?.name,
        error: result.error,
      };
    }

    return { success: false, error: `Unknown plugin type: ${pluginType}` };
  }

  /**
   * Get plugin type from plugin ID
   */
  private getPluginTypeFromId(pluginId: string): PluginType {
    if (pluginId.startsWith('telegram')) return 'telegram';
    if (pluginId.startsWith('slack')) return 'slack';
    if (pluginId.startsWith('discord')) return 'discord';
    if (pluginId.startsWith('lark')) return 'lark';
    return 'telegram'; // Default
  }

  /**
   * Get plugin name from plugin ID
   */
  private getPluginNameFromId(pluginId: string): string {
    const type = this.getPluginTypeFromId(pluginId);
    return type.charAt(0).toUpperCase() + type.slice(1) + ' Bot';
  }

  // ==================== Conversation Cleanup ====================

  /**
   * Cleanup resources when a conversation is deleted
   * Called when a non-AionUI conversation (e.g., telegram) is deleted
   *
   * 当会话被删除时清理相关资源（用于 telegram 等非 AionUI 来源的会话）
   *
   * @param conversationId - The ID of the conversation being deleted
   * @returns true if cleanup was performed, false if no resources to clean
   */
  async cleanupConversation(conversationId: string): Promise<boolean> {
    if (!this.initialized) {
      console.warn('[ChannelManager] Not initialized, skipping cleanup');
      return false;
    }

    let cleanedUp = false;

    // 1. Clear session associated with this conversation
    const clearedSession = this.sessionManager?.clearSessionByConversationId(conversationId);
    if (clearedSession) {
      cleanedUp = true;

      // 2. Clear AssistantGeminiService agent cache for this session
      try {
        const geminiService = getChannelMessageService();
        await geminiService.clearContext(clearedSession.id);
      } catch (error) {
        console.warn(`[ChannelManager] Failed to clear Gemini context:`, error);
      }
    }

    return cleanedUp;
  }

  // ==================== Accessors ====================

  getPluginManager(): PluginManager | null {
    return this.pluginManager;
  }

  getSessionManager(): SessionManager | null {
    return this.sessionManager;
  }

  getPairingService(): PairingService | null {
    return this.pairingService;
  }

  getActionExecutor(): ActionExecutor | null {
    return this.actionExecutor;
  }
}

// Export singleton getter for convenience
export function getChannelManager(): ChannelManager {
  return ChannelManager.getInstance();
}
