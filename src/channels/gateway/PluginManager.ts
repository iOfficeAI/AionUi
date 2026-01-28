/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { channel as channelBridge } from '@/common/ipcBridge';
import { getDatabase } from '@/process/database';
import type { SessionManager } from '../core/SessionManager';
import type { BasePlugin, PluginMessageHandler, PluginConfirmHandler } from '../plugins/BasePlugin';
import type { IChannelPluginConfig, IChannelPluginStatus, IUnifiedIncomingMessage, PluginType } from '../types';

// Plugin registry - maps plugin types to their constructors
// Will be populated when plugins are implemented
type PluginConstructor = new () => BasePlugin;
const pluginRegistry: Map<PluginType, PluginConstructor> = new Map();

/**
 * Register a plugin type
 * Called during initialization to register available plugins
 */
export function registerPlugin(type: PluginType, constructor: PluginConstructor): void {
  pluginRegistry.set(type, constructor);
  console.log(`[PluginManager] Registered plugin type: ${type}`);
}

/**
 * PluginManager - Manages lifecycle of all platform plugins
 *
 * Responsibilities:
 * - Plugin registration and discovery
 * - Plugin lifecycle management (init → start → stop)
 * - Message routing from plugins to action handlers
 * - Status monitoring and reconnection
 */
export class PluginManager {
  // Active plugin instances
  private plugins: Map<string, BasePlugin> = new Map();

  // Reference to session manager for message handling
  private sessionManager: SessionManager;

  // Message handler for incoming messages
  private messageHandler: PluginMessageHandler | null = null;

  // Confirm handler for tool confirmations
  // 工具确认处理器
  private confirmHandler: PluginConfirmHandler | null = null;

  // Runtime error cache: pluginId -> error message
  // 运行时错误缓存：pluginId -> 错误消息
  private pluginErrors: Map<string, string> = new Map();

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * Get error message for a plugin
   * 获取插件的错误消息
   */
  getPluginError(pluginId: string): string | undefined {
    return this.pluginErrors.get(pluginId);
  }

  /**
   * Clear error message for a plugin
   * 清除插件的错误消息
   */
  clearPluginError(pluginId: string): void {
    this.pluginErrors.delete(pluginId);
  }

  /**
   * Set the message handler for incoming messages
   * This is called by ChannelManager to wire up the action system
   */
  setMessageHandler(handler: PluginMessageHandler): void {
    this.messageHandler = handler;

    // Update handler on all active plugins
    for (const plugin of this.plugins.values()) {
      plugin.onMessage(handler);
    }
  }

  /**
   * Set the confirm handler for tool confirmations
   * 设置工具确认处理器
   */
  setConfirmHandler(handler: PluginConfirmHandler): void {
    this.confirmHandler = handler;

    // Update handler on all active plugins
    for (const plugin of this.plugins.values()) {
      plugin.onConfirm(handler);
    }
  }

  /**
   * Get a plugin by ID
   */
  getPlugin(pluginId: string): BasePlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all active plugins
   */
  getAllPlugins(): BasePlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Start a plugin with the given configuration
   * 启动插件，记录启动过程中的错误
   */
  async startPlugin(config: IChannelPluginConfig): Promise<void> {
    const { id, type } = config;

    // Clear previous error
    // 清除之前的错误
    this.pluginErrors.delete(id);

    // Check if plugin is already running
    if (this.plugins.has(id)) {
      console.log(`[PluginManager] Plugin ${id} is already running`);
      return;
    }

    // Get plugin constructor from registry
    const Constructor = pluginRegistry.get(type);
    if (!Constructor) {
      const errorMsg = `Unknown plugin type: ${type}`;
      this.pluginErrors.set(id, errorMsg);
      throw new Error(errorMsg);
    }

    // Create plugin instance
    const plugin = new Constructor();

    try {
      // Initialize plugin
      // 初始化插件
      await plugin.initialize(config);
    } catch (error) {
      const errorMsg = `Plugin initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[PluginManager] ${errorMsg}`, error);
      this.pluginErrors.set(id, errorMsg);

      // Update database status to error
      const db = getDatabase();
      db.updateChannelPluginStatus(id, 'error');

      // Emit status change event with error
      this.emitStatusChangeWithError(id, config, errorMsg);

      throw error;
    }

    // Set message handler
    if (this.messageHandler) {
      plugin.onMessage(this.messageHandler);
    } else {
      console.warn(`[PluginManager] WARNING: No message handler set when starting plugin ${id}! Messages will not be processed.`);
    }

    // Set confirm handler
    // 设置确认处理器
    if (this.confirmHandler) {
      plugin.onConfirm(this.confirmHandler);
    }

    try {
      // Start plugin
      // 启动插件
      await plugin.start();
    } catch (error) {
      const errorMsg = `Plugin start failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[PluginManager] ${errorMsg}`, error);
      this.pluginErrors.set(id, errorMsg);

      // Update database status to error
      const db = getDatabase();
      db.updateChannelPluginStatus(id, 'error');

      // Emit status change event with error
      this.emitStatusChangeWithError(id, config, errorMsg);

      throw error;
    }

    // Store in registry
    this.plugins.set(id, plugin);

    // Update database status
    const db = getDatabase();
    db.updateChannelPluginStatus(id, 'running', Date.now());

    // Emit status change event
    this.emitStatusChange(id, plugin);

    console.log(`[PluginManager] Plugin ${id} started successfully`);
  }

  /**
   * Stop a plugin
   */
  async stopPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      console.log(`[PluginManager] Plugin ${pluginId} is not running`);
      return;
    }

    // Stop plugin
    await plugin.stop();

    // Remove from registry
    this.plugins.delete(pluginId);

    // Update database status
    const db = getDatabase();
    db.updateChannelPluginStatus(pluginId, 'stopped');

    // Emit status change event
    this.emitStatusChange(pluginId, plugin);

    console.log(`[PluginManager] Plugin ${pluginId} stopped`);
  }

  /**
   * Stop all plugins
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.plugins.keys()).map((id) => this.stopPlugin(id));
    await Promise.allSettled(stopPromises);
    console.log('[PluginManager] All plugins stopped');
  }

  /**
   * Get status for all plugins (for Settings UI)
   */
  getPluginStatuses(): IChannelPluginStatus[] {
    const db = getDatabase();
    const result = db.getChannelPlugins();

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map((config) => this.buildPluginStatus(config));
  }

  /**
   * Build plugin status object
   */
  private buildPluginStatus(config: IChannelPluginConfig): IChannelPluginStatus {
    const plugin = this.plugins.get(config.id);
    const botInfo = plugin?.getBotInfo();

    // Get error from plugin instance or from error cache
    // 从插件实例或错误缓存中获取错误
    const errorMessage = plugin?.error ?? this.pluginErrors.get(config.id);

    return {
      id: config.id,
      type: config.type,
      name: config.name,
      enabled: config.enabled,
      connected: plugin?.status === 'running',
      status: plugin?.status ?? config.status,
      lastConnected: config.lastConnected,
      error: errorMessage,
      activeUsers: plugin?.getActiveUserCount() ?? 0,
      botUsername: botInfo?.username,
      hasToken: !!config.credentials?.token,
    };
  }

  /**
   * Emit status change event to renderer
   */
  private emitStatusChange(pluginId: string, plugin: BasePlugin): void {
    const db = getDatabase();
    const configResult = db.getChannelPlugin(pluginId);

    if (configResult.success && configResult.data) {
      const status = this.buildPluginStatus(configResult.data);
      channelBridge.pluginStatusChanged.emit({ pluginId, status });
    }
  }

  /**
   * Emit status change event with error (when plugin is not yet created)
   * 发送带错误的状态变化事件（当插件尚未创建时）
   */
  private emitStatusChangeWithError(pluginId: string, config: IChannelPluginConfig, errorMessage: string): void {
    const status: IChannelPluginStatus = {
      id: config.id,
      type: config.type,
      name: config.name,
      enabled: config.enabled,
      connected: false,
      status: 'error',
      lastConnected: config.lastConnected,
      error: errorMessage,
      activeUsers: 0,
      botUsername: undefined,
      hasToken: !!config.credentials?.token,
    };
    channelBridge.pluginStatusChanged.emit({ pluginId, status });
  }

  /**
   * Handle incoming message from a plugin
   * Routes to the appropriate action handler
   */
  private async handleIncomingMessage(message: IUnifiedIncomingMessage): Promise<void> {
    console.log(`[PluginManager] Received message from ${message.platform}: ${message.content.type}`);

    // Update user activity
    this.sessionManager.updateSessionActivity(message.user.id);

    // Forward to message handler (ActionRouter)
    if (this.messageHandler) {
      await this.messageHandler(message);
    }
  }

  /**
   * Send a message through a plugin
   */
  async sendMessage(pluginId: string, chatId: string, message: import('../types').IUnifiedOutgoingMessage): Promise<string | null> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      console.error(`[PluginManager] Plugin ${pluginId} not found`);
      return null;
    }

    try {
      return await plugin.sendMessage(chatId, message);
    } catch (error) {
      console.error(`[PluginManager] Failed to send message through ${pluginId}:`, error);
      return null;
    }
  }

  /**
   * Edit a message through a plugin
   */
  async editMessage(pluginId: string, chatId: string, messageId: string, message: import('../types').IUnifiedOutgoingMessage): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      console.error(`[PluginManager] Plugin ${pluginId} not found`);
      return false;
    }

    try {
      await plugin.editMessage(chatId, messageId, message);
      return true;
    } catch (error) {
      console.error(`[PluginManager] Failed to edit message through ${pluginId}:`, error);
      return false;
    }
  }
}
