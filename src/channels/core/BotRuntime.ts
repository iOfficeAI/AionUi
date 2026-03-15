/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionExecutor } from '../gateway/ActionExecutor';
import type { BasePlugin } from '../plugins/BasePlugin';
import type { PairingService } from '../pairing/PairingService';
import type { IChannelPluginConfig, PluginType } from '../types';
import type { SessionManager } from './SessionManager';

/**
 * BotRuntime binds one plugin instance to its per-bot execution pipeline.
 *
 * Each runtime owns:
 * - one transport plugin instance
 * - one action executor bound to that plugin
 * - the scoped message / confirmation handlers for the plugin lifecycle
 */
export class BotRuntime {
  private readonly actionExecutor: ActionExecutor;

  constructor(
    private readonly plugin: BasePlugin,
    private readonly sessionManager: SessionManager,
    private readonly pairingService: PairingService
  ) {
    this.actionExecutor = new ActionExecutor(this.plugin, this.sessionManager, this.pairingService);
    this.plugin.onMessage(this.actionExecutor.getMessageHandler());
    this.plugin.onConfirm(this.actionExecutor.getConfirmHandler());
  }

  get pluginId(): string {
    return this.plugin.pluginId;
  }

  get type(): PluginType {
    return this.plugin.type;
  }

  getPlugin(): BasePlugin {
    return this.plugin;
  }

  async start(config: IChannelPluginConfig): Promise<void> {
    await this.plugin.initialize(config);
    await this.plugin.start();
  }

  async stop(): Promise<void> {
    await this.plugin.stop();
  }
}
