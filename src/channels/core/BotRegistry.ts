/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { channel as channelBridge } from '@/common/ipcBridge';
import { getDatabase } from '@/process/database';
import { createPluginInstance } from '../gateway/PluginManager';
import { hasPluginCredentials } from '../types';
import type { IChannelPluginConfig, IChannelPluginStatus } from '../types';
import { BotRuntime } from './BotRuntime';
import type { SessionManager } from './SessionManager';
import type { PairingService } from '../pairing/PairingService';

/**
 * BotRegistry owns all live BotRuntime instances.
 *
 * It replaces the old "global plugin manager + global executor wiring" model
 * with a registry of isolated per-bot runtimes.
 */
export class BotRegistry {
  private readonly runtimes: Map<string, BotRuntime> = new Map();
  private readonly runtimeErrors: Map<string, string> = new Map();

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly pairingService: PairingService
  ) {}

  getRuntime(pluginId: string): BotRuntime | undefined {
    return this.runtimes.get(pluginId);
  }

  getPluginStatuses(): IChannelPluginStatus[] {
    const db = getDatabase();
    const result = db.getChannelPlugins();

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map((config) => this.buildPluginStatus(config));
  }

  async startBot(config: IChannelPluginConfig): Promise<void> {
    const { id, type } = config;
    this.runtimeErrors.delete(id);

    if (this.runtimes.has(id)) {
      return;
    }

    const plugin = createPluginInstance(type);
    const runtime = new BotRuntime(plugin, this.sessionManager, this.pairingService);

    try {
      await runtime.start(config);
    } catch (error) {
      const errorMsg = `Bot runtime start failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[BotRegistry] ${errorMsg}`, error);
      this.runtimeErrors.set(id, errorMsg);

      const db = getDatabase();
      db.updateChannelPluginStatus(id, 'error');
      this.emitStatusChangeWithError(id, config, errorMsg);
      throw error;
    }

    this.runtimes.set(id, runtime);

    const db = getDatabase();
    db.updateChannelPluginStatus(id, 'running', Date.now());
    this.emitStatusChange(id);
  }

  async stopBot(pluginId: string): Promise<void> {
    const runtime = this.runtimes.get(pluginId);
    if (!runtime) {
      return;
    }

    await runtime.stop();
    this.runtimes.delete(pluginId);

    const db = getDatabase();
    db.updateChannelPluginStatus(pluginId, 'stopped');
    this.emitStatusChange(pluginId);
  }

  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.runtimes.keys()).map((id) => this.stopBot(id));
    await Promise.allSettled(stopPromises);
    console.log('[BotRegistry] All bot runtimes stopped');
  }

  private buildPluginStatus(config: IChannelPluginConfig): IChannelPluginStatus {
    const BUILTIN_TYPES = new Set(['telegram', 'lark', 'dingtalk', 'slack', 'discord']);
    const plugin = this.runtimes.get(config.id)?.getPlugin();
    const botInfo = plugin?.getBotInfo();
    const errorMessage = plugin?.error ?? this.runtimeErrors.get(config.id);

    return {
      id: config.id,
      type: config.type,
      name: config.name,
      enabled: config.enabled,
      connected: plugin?.isConnected() ?? false,
      status: plugin?.status ?? config.status,
      lastConnected: config.lastConnected,
      error: errorMessage,
      activeUsers: plugin?.getActiveUserCount() ?? 0,
      botUsername: botInfo?.username,
      hasToken: hasPluginCredentials(config.type, config.credentials),
      isExtension: !BUILTIN_TYPES.has(config.type),
    };
  }

  private emitStatusChange(pluginId: string): void {
    const db = getDatabase();
    const configResult = db.getChannelPlugin(pluginId);

    if (configResult.success && configResult.data) {
      const status = this.buildPluginStatus(configResult.data);
      channelBridge.pluginStatusChanged.emit({ pluginId, status });
    }
  }

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
      hasToken: hasPluginCredentials(config.type, config.credentials),
      isExtension: !new Set(['telegram', 'lark', 'dingtalk', 'slack', 'discord']).has(config.type),
    };
    channelBridge.pluginStatusChanged.emit({ pluginId, status });
  }
}
