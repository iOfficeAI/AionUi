/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';
import { ExtensionRegistry } from '@process/extensions';
import { getChannelMessageService } from '../agent/ChannelMessageService';
import { getChannelDefaultModel } from '../actions/SystemActions';
import { ActionExecutor } from '../gateway/ActionExecutor';
import { PluginManager, registerPlugin } from '../gateway/PluginManager';
import { PairingService } from '../pairing/PairingService';
import { DingTalkPlugin } from '../plugins/dingtalk/DingTalkPlugin';
import { LarkPlugin } from '../plugins/lark/LarkPlugin';
import { TelegramPlugin } from '../plugins/telegram/TelegramPlugin';
import { WeixinPlugin } from '../plugins/weixin/WeixinPlugin';
import { WecomPlugin } from '../plugins/wecom/WecomPlugin';
import { isBuiltinChannelPlatform, resolveChannelConvType } from '../types';
import type { ChannelPlatform, IChannelPluginConfig, PluginType } from '../types';
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
    // Register built-in plugins
    registerPlugin('telegram', TelegramPlugin);
    registerPlugin('lark', LarkPlugin);
    registerPlugin('dingtalk', DingTalkPlugin);
    registerPlugin('weixin', WeixinPlugin);
    registerPlugin('wecom', WecomPlugin);
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
      // Register extension-contributed channel plugins (from ExtensionRegistry)
      this.registerExtensionChannelPlugins();

      // Initialize sub-components
      this.pairingService = new PairingService();
      this.sessionManager = new SessionManager();
      await this.sessionManager.ready;
      this.pluginManager = new PluginManager(this.sessionManager);

      // Create action executor and wire up message handling
      this.actionExecutor = new ActionExecutor(this.pluginManager, this.sessionManager, this.pairingService);
      this.pluginManager.setMessageHandler(this.actionExecutor.getMessageHandler());

      // Set confirm handler for tool confirmations
      // 设置工具确认处理器
      this.pluginManager.setConfirmHandler(async (userId: string, platform: string, callId: string, value: string) => {
        // 查找用户
        // Find user
        const db = await getDatabase();
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
    const db = await getDatabase();
    const result = db.getChannelPlugins();

    if (!result.success || !result.data) {
      console.warn('[ChannelManager] Failed to load plugins:', result.error);
      return;
    }

    const enabledPlugins = result.data.filter((p) => p.enabled);
    const builtinStartableTypes = new Set<PluginType>(['telegram', 'lark', 'dingtalk', 'weixin', 'wecom']);
    const extensionRegistry = ExtensionRegistry.getInstance();

    for (const plugin of enabledPlugins) {
      const isBuiltinStartable = builtinStartableTypes.has(plugin.type);
      const hasExtensionPlugin = !!extensionRegistry.getChannelPluginMeta(plugin.type);
      const canStartInCurrentRuntime = isBuiltinStartable || hasExtensionPlugin;

      if (!canStartInCurrentRuntime) {
        console.warn(
          `[ChannelManager] Auto-disabling stale plugin ${plugin.id} (type=${plugin.type}) because it is not available in current runtime`
        );
        const nextConfig: IChannelPluginConfig = {
          ...plugin,
          enabled: false,
          status: 'stopped',
          updatedAt: Date.now(),
        };
        db.upsertChannelPlugin(nextConfig);
        continue;
      }

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
   * Enable and start a plugin.
   * Supports both built-in plugins and extension-contributed plugins.
   * For extension plugins, fields are extracted from manifest metadata.
   */
  async enablePlugin(pluginId: string, config: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    // Ensure manager is initialized
    if (!this.initialized || !this.pluginManager) {
      console.error('[ChannelManager] Cannot enable plugin: manager not initialized');
      return { success: false, error: 'Assistant manager not initialized' };
    }

    const db = await getDatabase();

    // Get existing plugin or create new one
    const existingResult = db.getChannelPlugin(pluginId);
    const existing = existingResult.data;

    // Resolve plugin type — always derive from pluginId so stale DB records don't cause
    // "Unknown plugin type" errors after renaming or fixing the type mapping.
    const pluginType = this.getPluginTypeFromId(pluginId) as PluginType;
    let credentials = existing?.credentials;
    let pluginRuntimeConfig = existing?.config ? { ...existing.config } : {};

    // Extract credentials based on plugin type
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
    } else if (pluginType === 'dingtalk') {
      const clientId = config.clientId as string | undefined;
      const clientSecret = config.clientSecret as string | undefined;
      if (clientId && clientSecret) {
        credentials = { clientId, clientSecret };
      }
    } else if (pluginType === 'weixin') {
      const accountId = config.accountId as string | undefined;
      const botToken = config.botToken as string | undefined;
      if (accountId && botToken) {
        credentials = { accountId, botToken };
      }
    } else if (pluginType === 'wecom') {
      const botId = config.botId as string | undefined;
      const secret = config.secret as string | undefined;
      const token = config.token as string | undefined;
      const encodingAesKey = config.encodingAesKey as string | undefined;

      if (botId && secret) {
        credentials = { botId: botId.trim(), secret: secret.trim() };
        pluginRuntimeConfig = { ...pluginRuntimeConfig, mode: 'websocket' };
      } else if (token && encodingAesKey) {
        credentials = { token: token.trim(), encodingAesKey: encodingAesKey.trim() };
        pluginRuntimeConfig = { ...pluginRuntimeConfig, mode: 'webhook' };
      }
    } else {
      // Extension or unknown plugin type:
      // - prefer manifest-declared credential/config fields
      // - preserve primitive types (string/number/boolean)
      const registry = ExtensionRegistry.getInstance();
      const meta = registry.getChannelPluginMeta(pluginType) as
        | {
            credentialFields?: Array<{ key: string }>;
            configFields?: Array<{ key: string }>;
          }
        | undefined;

      const nextCredentials: Record<string, string | number | boolean | undefined> = {
        ...credentials,
      };
      const nextRuntimeConfig: Record<string, string | number | boolean | undefined> = {
        ...pluginRuntimeConfig,
      };

      const primitiveEntries = Object.entries(config).filter(([, value]) => {
        const t = typeof value;
        return t === 'string' || t === 'number' || t === 'boolean';
      }) as Array<[string, string | number | boolean]>;

      const credentialKeys = new Set((meta?.credentialFields || []).map((f) => f.key));
      const configKeys = new Set((meta?.configFields || []).map((f) => f.key));

      if (credentialKeys.size === 0 && configKeys.size === 0) {
        // Legacy fallback: string values are credentials, non-strings go to config
        for (const [key, value] of primitiveEntries) {
          if (typeof value === 'string') {
            nextCredentials[key] = value;
          } else {
            nextRuntimeConfig[key] = value;
          }
        }
      } else {
        for (const [key, value] of primitiveEntries) {
          if (credentialKeys.has(key)) {
            nextCredentials[key] = value;
            continue;
          }
          if (configKeys.has(key)) {
            nextRuntimeConfig[key] = value;
            continue;
          }
          // Unknown field fallback: keep as runtime config to avoid losing data.
          nextRuntimeConfig[key] = value;
        }
      }

      credentials = nextCredentials;
      pluginRuntimeConfig = nextRuntimeConfig;
    }

    const pluginConfig: IChannelPluginConfig = {
      id: pluginId,
      type: pluginType,
      name: existing?.name || this.getPluginNameFromId(pluginId),
      enabled: true,
      credentials,
      config: pluginRuntimeConfig,
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
    const db = await getDatabase();

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
   * Test a plugin connection without enabling it.
   * For extension plugins that don't have a static testConnection method,
   * returns a generic "not supported" response.
   */
  async testPlugin(
    pluginId: string,
    token: string,
    extraConfig?: { appId?: string; appSecret?: string }
  ): Promise<{ success: boolean; botUsername?: string; error?: string }> {
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
        return {
          success: false,
          error: 'App ID and App Secret are required for Lark',
        };
      }
      const result = await LarkPlugin.testConnection(appId, appSecret);
      return {
        success: result.success,
        botUsername: result.botInfo?.name,
        error: result.error,
      };
    }

    if (pluginType === 'dingtalk') {
      const clientId = extraConfig?.appId; // Reuse appId field for clientId
      const clientSecret = extraConfig?.appSecret; // Reuse appSecret field for clientSecret
      if (!clientId || !clientSecret) {
        return {
          success: false,
          error: 'Client ID and Client Secret are required for DingTalk',
        };
      }
      const result = await DingTalkPlugin.testConnection(clientId, clientSecret);
      return {
        success: result.success,
        botUsername: result.botInfo?.name,
        error: result.error,
      };
    }

    // Extension plugins: test connection not supported yet (will be handled by the plugin itself on start)
    return { success: true, botUsername: undefined, error: undefined };
  }

  /**
   * Get plugin type from plugin ID.
   * For built-in plugins, derives from ID prefix. For others, returns the ID as type.
   */
  private getPluginTypeFromId(pluginId: string): PluginType {
    if (pluginId.startsWith('telegram')) return 'telegram';
    if (pluginId.startsWith('slack')) return 'slack';
    if (pluginId.startsWith('discord')) return 'discord';
    if (pluginId.startsWith('lark')) return 'lark';
    if (pluginId.startsWith('dingtalk')) return 'dingtalk';
    if (pluginId.startsWith('weixin')) return 'weixin';
    if (pluginId.startsWith('wecom')) return 'wecom';
    // Extension plugins: use pluginId as type (e.g., 'ext-feishu')
    return pluginId;
  }

  /**
   * Get plugin name from plugin ID.
   * For extension plugins, tries to look up display name from registry.
   */
  private getPluginNameFromId(pluginId: string): string {
    // Check extension registry for display name
    try {
      const registry = ExtensionRegistry.getInstance();
      const meta = registry.getChannelPluginMeta(pluginId);
      if (meta && typeof meta === 'object' && 'name' in meta) {
        return (meta as { name: string }).name;
      }
    } catch {
      // Registry may not be initialized, fall through
    }
    const type = this.getPluginTypeFromId(pluginId);
    if (type === 'wecom') {
      return 'WeCom';
    }
    return type.charAt(0).toUpperCase() + type.slice(1) + ' Bot';
  }

  // ==================== Extension Channel Plugin Registration ====================

  /**
   * Register extension-contributed channel plugins into the plugin registry.
   * Called once during initialization after ExtensionRegistry is ready.
   * This is a synchronous, non-blocking operation (plugins are already loaded).
   */
  private registerExtensionChannelPlugins(): void {
    try {
      const registry = ExtensionRegistry.getInstance();
      const extPlugins = registry.getChannelPlugins();
      if (extPlugins.size === 0) return;

      for (const [type, entry] of extPlugins) {
        const Constructor = entry.constructor as new () => InstanceType<
          typeof import('../plugins/BasePlugin').BasePlugin
        >;
        registerPlugin(type as PluginType, Constructor as any);
        console.log(`[ChannelManager] Registered extension channel plugin: ${type}`);
      }
    } catch (error) {
      console.warn('[ChannelManager] Failed to register extension channel plugins:', error);
    }
  }

  // ==================== Settings Sync ====================

  /**
   * Sync channel settings after agent or model change in the Settings UI.
   * Clears all cached sessions so the next incoming message re-evaluates
   * which conversation to use. For gemini type changes, also updates the
   * model field on existing conversations.
   */
  async syncChannelSettings(
    platform: ChannelPlatform,
    agent: { backend: string; customAgentId?: string; name?: string },
    model?: { id: string; useModel: string }
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.initialized || !this.sessionManager) {
      return { success: false, error: 'Channel manager not initialized' };
    }

    try {
      const { convType: newType } = resolveChannelConvType(agent.backend);

      // For gemini + model info: update existing conversations' model field
      if (newType === 'gemini' && model?.id && model?.useModel) {
        if (isBuiltinChannelPlatform(platform)) {
          const builtinPlatform: 'telegram' | 'lark' | 'dingtalk' | 'weixin' | 'wecom' = platform;
          const fullModel = await getChannelDefaultModel(builtinPlatform);
          const db = await getDatabase();
          const result = db.updateChannelConversationModel(builtinPlatform, 'gemini', fullModel);
          if (result.success) {
            console.log(`[ChannelManager] Updated ${result.data} gemini conversation(s) for ${builtinPlatform}`);
          }
        } else {
          console.log(`[ChannelManager] Skip conversation model sync for extension platform: ${platform}`);
        }
      }

      // Clear all sessions to force re-evaluation on next message
      const cleared = await this.sessionManager.clearAllSessions();
      console.log(`[ChannelManager] syncChannelSettings: platform=${platform}, type=${newType}, cleared=${cleared}`);

      return { success: true };
    } catch (error: any) {
      console.error(`[ChannelManager] syncChannelSettings failed:`, error);
      return { success: false, error: error.message };
    }
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
    const clearedSession = await this.sessionManager?.clearSessionByConversationId(conversationId);
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
