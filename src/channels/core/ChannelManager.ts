/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@/process/database';
import { ExtensionRegistry } from '@/extensions';
import { getChannelMessageService } from '../agent/ChannelMessageService';
import { getChannelDefaultModel } from '../actions/SystemActions';
import { registerPlugin } from '../gateway/PluginManager';
import { PairingService } from '../pairing/PairingService';
import { DingTalkPlugin } from '../plugins/dingtalk/DingTalkPlugin';
import { LarkPlugin } from '../plugins/lark/LarkPlugin';
import { TelegramPlugin } from '../plugins/telegram/TelegramPlugin';
import { isBuiltinChannelPlatform, resolveChannelConvType } from '../types';
import type { ChannelPlatform, IChannelPluginConfig, PluginType } from '../types';
import { BotRegistry } from './BotRegistry';
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
  private botRegistry: BotRegistry | null = null;
  private sessionManager: SessionManager | null = null;
  private pairingService: PairingService | null = null;

  private constructor() {
    // Private constructor for singleton pattern
    // Register built-in plugins
    registerPlugin('telegram', TelegramPlugin);
    registerPlugin('lark', LarkPlugin);
    registerPlugin('dingtalk', DingTalkPlugin);
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
      this.botRegistry = new BotRegistry(this.sessionManager, this.pairingService);

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
      await this.botRegistry?.stopAll();

      // Stop pairing service cleanup interval
      this.pairingService?.stop();

      // Shutdown Gemini service
      await getChannelMessageService().shutdown();

      // Cleanup
      this.botRegistry = null;
      this.sessionManager = null;
      this.pairingService = null;

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
    const builtinStartableTypes = new Set<PluginType>(['telegram', 'lark', 'dingtalk']);
    const extensionRegistry = ExtensionRegistry.getInstance();

    for (const plugin of enabledPlugins) {
      const isBuiltinStartable = builtinStartableTypes.has(plugin.type);
      const hasExtensionPlugin = !!extensionRegistry.getChannelPluginMeta(plugin.type);
      const canStartInCurrentRuntime = isBuiltinStartable || hasExtensionPlugin;

      if (!canStartInCurrentRuntime) {
        console.warn(`[ChannelManager] Auto-disabling stale plugin ${plugin.id} (type=${plugin.type}) because it is not available in current runtime`);
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
    if (!this.botRegistry) {
      throw new Error('BotRegistry not initialized');
    }
    await this.botRegistry.startBot(config);
  }

  /**
   * Enable and start a plugin.
   * Supports both built-in plugins and extension-contributed plugins.
   * For extension plugins, fields are extracted from manifest metadata.
   */
  async enablePlugin(pluginId: string, config: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    // Ensure manager is initialized
    if (!this.initialized || !this.botRegistry) {
      console.error('[ChannelManager] Cannot enable plugin: manager not initialized');
      return { success: false, error: 'Assistant manager not initialized' };
    }
    const botRegistry = this.botRegistry;

    const db = getDatabase();

    // Get existing plugin or create new one
    const existingResult = db.getChannelPlugin(pluginId);
    const existing = existingResult.data;

    // Resolve plugin type
    const pluginType = (existing?.type || this.getPluginTypeFromId(pluginId)) as PluginType;
    let credentials = existing?.credentials;
    let pluginRuntimeConfig = existing?.config ? { ...existing.config } : {};

    // Extract credentials based on plugin type
    if (pluginType === 'telegram') {
      const token = typeof config.token === 'string' ? config.token.trim() : undefined;
      const existingToken = typeof existing?.credentials?.token === 'string' ? existing.credentials.token.trim() : '';
      const nextToken = token || existingToken;
      if (nextToken) {
        credentials = {
          ...(existing?.credentials || {}),
          token: nextToken,
        };
      }
    } else if (pluginType === 'lark') {
      const appId = typeof config.appId === 'string' ? config.appId.trim() : undefined;
      const appSecret = typeof config.appSecret === 'string' ? config.appSecret.trim() : undefined;
      const encryptKey = Object.prototype.hasOwnProperty.call(config, 'encryptKey') ? (typeof config.encryptKey === 'string' ? config.encryptKey.trim() : '') || undefined : existing?.credentials?.encryptKey;
      const verificationToken = Object.prototype.hasOwnProperty.call(config, 'verificationToken') ? (typeof config.verificationToken === 'string' ? config.verificationToken.trim() : '') || undefined : existing?.credentials?.verificationToken;
      const nextAppId = appId || (typeof existing?.credentials?.appId === 'string' ? existing.credentials.appId.trim() : '');
      const nextAppSecret = appSecret || (typeof existing?.credentials?.appSecret === 'string' ? existing.credentials.appSecret.trim() : '');
      if (nextAppId && nextAppSecret) {
        credentials = {
          ...(existing?.credentials || {}),
          appId: nextAppId,
          appSecret: nextAppSecret,
          encryptKey,
          verificationToken,
        };
      }
    } else if (pluginType === 'dingtalk') {
      const clientId = typeof config.clientId === 'string' ? config.clientId.trim() : undefined;
      const clientSecret = typeof config.clientSecret === 'string' ? config.clientSecret.trim() : undefined;
      const nextClientId = clientId || (typeof existing?.credentials?.clientId === 'string' ? existing.credentials.clientId.trim() : '');
      const nextClientSecret = clientSecret || (typeof existing?.credentials?.clientSecret === 'string' ? existing.credentials.clientSecret.trim() : '');
      if (nextClientId && nextClientSecret) {
        credentials = {
          ...(existing?.credentials || {}),
          clientId: nextClientId,
          clientSecret: nextClientSecret,
        };
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
        ...(credentials || {}),
      };
      const nextRuntimeConfig: Record<string, string | number | boolean | undefined> = {
        ...(pluginRuntimeConfig || {}),
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

    if (pluginType === 'telegram') {
      const currentToken = typeof credentials?.token === 'string' ? credentials.token.trim() : '';
      if (!currentToken) {
        return { success: false, error: 'Telegram bot token is required' };
      }

      const allPluginsResult = db.getChannelPlugins();
      const allPlugins = allPluginsResult.data || [];
      const conflictPlugin = allPlugins.find((plugin) => {
        if (plugin.id === pluginId || plugin.type !== 'telegram' || !plugin.enabled) return false;
        const otherToken = typeof plugin.credentials?.token === 'string' ? plugin.credentials.token.trim() : '';
        return Boolean(otherToken) && otherToken === currentToken;
      });

      if (conflictPlugin) {
        return {
          success: false,
          error: `Telegram token is already used by plugin ${conflictPlugin.id}. Please disable or delete that instance first.`,
        };
      }
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
    const db = getDatabase();

    try {
      // Stop the plugin
      await this.botRegistry?.stopBot(pluginId);

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
  async testPlugin(pluginId: string, token: string, extraConfig?: { appId?: string; appSecret?: string; clientId?: string; clientSecret?: string }): Promise<{ success: boolean; botUsername?: string; error?: string }> {
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

    if (pluginType === 'dingtalk') {
      const clientId = extraConfig?.appId; // Reuse appId field for clientId
      const clientSecret = extraConfig?.appSecret; // Reuse appSecret field for clientSecret
      if (!clientId || !clientSecret) {
        return { success: false, error: 'Client ID and Client Secret are required for DingTalk' };
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
   * For built-in plugins, derives from ID prefix (supports multi-instance IDs like 'telegram_work', 'lark_bot2').
   * For extension plugins, returns the ID as type.
   */
  private getPluginTypeFromId(pluginId: string): PluginType {
    // Built-in patterns: match if ID starts with known type name followed by underscore or end of string
    const builtinTypes: Array<[string, PluginType]> = [
      ['telegram', 'telegram'],
      ['slack', 'slack'],
      ['discord', 'discord'],
      ['lark', 'lark'],
      ['dingtalk', 'dingtalk'],
    ];
    for (const [prefix, type] of builtinTypes) {
      if (pluginId === prefix || pluginId.startsWith(`${prefix}_`)) {
        return type;
      }
    }
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
        const Constructor = entry.constructor as new () => InstanceType<typeof import('../plugins/BasePlugin').BasePlugin>;
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
   *
   * @param platform - Platform type (e.g., 'telegram', 'lark')
   * @param agent - Agent configuration
   * @param model - Optional model configuration
   * @param pluginId - Optional plugin instance ID for per-plugin settings sync
   */
  async syncChannelSettings(platform: ChannelPlatform, agent: { backend: string; customAgentId?: string; name?: string }, model?: { id: string; useModel: string }, pluginId?: string): Promise<{ success: boolean; error?: string }> {
    if (!this.initialized || !this.sessionManager) {
      return { success: false, error: 'Channel manager not initialized' };
    }

    try {
      const { convType: newType } = resolveChannelConvType(agent.backend);

      // For gemini + model info: update existing conversations' model field
      if (newType === 'gemini' && model?.id && model?.useModel) {
        if (isBuiltinChannelPlatform(platform)) {
          const builtinPlatform: 'telegram' | 'lark' | 'dingtalk' = platform;
          const fullModel = await getChannelDefaultModel(builtinPlatform);
          const db = getDatabase();
          const result = db.updateChannelConversationModel(builtinPlatform, 'gemini', fullModel);
          if (result.success) {
            console.log(`[ChannelManager] Updated ${result.data} gemini conversation(s) for ${builtinPlatform}`);
          }
        } else {
          console.log(`[ChannelManager] Skip conversation model sync for extension platform: ${platform}`);
        }
      }

      // Clear only the affected sessions to keep multi-instance channels isolated.
      const cleared = pluginId ? this.sessionManager.clearSessionsByPlugin(pluginId) : this.sessionManager.clearSessionsByPlatform(platform);
      console.log(`[ChannelManager] syncChannelSettings: platform=${platform}, pluginId=${pluginId || '-'}, type=${newType}, cleared=${cleared}`);

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

  getBotRegistry(): BotRegistry | null {
    return this.botRegistry;
  }

  getSessionManager(): SessionManager | null {
    return this.sessionManager;
  }

  getPairingService(): PairingService | null {
    return this.pairingService;
  }
}

// Export singleton getter for convenience
export function getChannelManager(): ChannelManager {
  return ChannelManager.getInstance();
}
