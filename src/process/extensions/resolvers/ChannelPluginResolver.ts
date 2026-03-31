/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import fs from 'fs';
import { BasePlugin, type PluginConfirmHandler, type PluginMessageHandler } from '@process/channels/plugins/BasePlugin';
import type { LoadedExtension, ExtChannelPlugin } from '../types';
import { isPathWithinDirectory } from '../sandbox/pathSafety';
import { resolveRuntimeEntryPath } from './utils/entryPointResolver';
import { toAssetUrl } from '../protocol/assetProtocol';

const DEBUG_ENABLED = process.env.AIONUI_EXTENSION_DEBUG === '1' || process.env.AIONUI_EXTENSION_DEBUG === 'true';

function logSecurity(message: string): void {
  if (DEBUG_ENABLED) {
    console.log(`[Extension Security] ${message}`);
  }
}

type ChannelPluginEntry = {
  constructor: typeof BasePlugin;
  meta: ExtChannelPlugin;
};

/**
 * Minimal interface that external channel plugins must satisfy.
 * External extensions cannot `import` the internal BasePlugin class, so we
 * use duck-typing to verify they implement the required contract instead of
 * relying on `instanceof BasePlugin`.
 */
const REQUIRED_METHODS = ['start', 'stop', 'sendMessage'] as const;

type LegacyExternalPlugin = {
  start: () => Promise<unknown> | unknown;
  stop: () => Promise<unknown> | unknown;
  sendMessage: (chatId: string, message: unknown) => Promise<string | unknown> | string | unknown;
  editMessage?: (chatId: string, messageId: string, message: unknown) => Promise<unknown> | unknown;
  getActiveUserCount?: () => number;
  getBotInfo?: () => { username?: string; displayName?: string } | null;
  onMessage?: (handler: PluginMessageHandler) => void;
  onConfirm?: (handler: PluginConfirmHandler) => void;
};

function isValidPluginClass(PluginClass: unknown): boolean {
  if (typeof PluginClass !== 'function') return false;
  const proto = (PluginClass as { prototype?: unknown }).prototype;
  if (!proto || typeof proto !== 'object') return false;
  return REQUIRED_METHODS.every((method) => typeof (proto as Record<string, unknown>)[method] === 'function');
}

function createDuckTypedWrapper(
  pluginType: string,
  PluginClass: new (config?: unknown) => LegacyExternalPlugin
): typeof BasePlugin {
  return class ExtensionDuckTypedWrapper extends BasePlugin {
    readonly type = pluginType as any;

    private impl: LegacyExternalPlugin | null = null;

    override onMessage(handler: PluginMessageHandler): void {
      super.onMessage(handler);
      this.impl?.onMessage?.(handler);
    }

    override onConfirm(handler: PluginConfirmHandler): void {
      super.onConfirm(handler);
      this.impl?.onConfirm?.(handler);
    }

    protected async onInitialize(config: import('@process/channels/types').IChannelPluginConfig): Promise<void> {
      this.impl = new PluginClass(config);
      if (this.messageHandler) {
        this.impl.onMessage?.(this.messageHandler);
      }
      if (this.confirmHandler) {
        this.impl.onConfirm?.(this.confirmHandler);
      }
    }

    protected async onStart(): Promise<void> {
      await this.impl?.start();
    }

    protected async onStop(): Promise<void> {
      await this.impl?.stop();
    }

    async sendMessage(
      chatId: string,
      message: import('@process/channels/types').IUnifiedOutgoingMessage
    ): Promise<string> {
      if (!this.impl) throw new Error('Extension plugin is not initialized');
      const result = await this.impl.sendMessage(chatId, message);
      return typeof result === 'string' ? result : `${pluginType}-msg-${Date.now()}`;
    }

    async editMessage(
      chatId: string,
      messageId: string,
      message: import('@process/channels/types').IUnifiedOutgoingMessage
    ): Promise<void> {
      if (!this.impl) throw new Error('Extension plugin is not initialized');
      if (typeof this.impl.editMessage === 'function') {
        await this.impl.editMessage(chatId, messageId, message);
        return;
      }
      await this.impl.sendMessage(chatId, message);
    }

    getActiveUserCount(): number {
      return this.impl?.getActiveUserCount?.() ?? 0;
    }

    getBotInfo(): { username?: string; displayName?: string } | null {
      return this.impl?.getBotInfo?.() ?? null;
    }
  };
}

export function resolveChannelPlugins(extensions: LoadedExtension[]): Map<string, ChannelPluginEntry> {
  const result = new Map<string, ChannelPluginEntry>();
  for (const ext of extensions) {
    const plugins = ext.manifest.contributes.channelPlugins;
    if (!plugins || plugins.length === 0) continue;
    for (const plugin of plugins) {
      const entryPath = resolveRuntimeEntryPath(ext.directory, plugin.entryPoint);
      if (!entryPath) {
        const fallbackPath = path.resolve(ext.directory, plugin.entryPoint);
        if (!isPathWithinDirectory(fallbackPath, ext.directory)) {
          console.warn(`[Extension] Path traversal detected in channel plugin: ${plugin.entryPoint}`);
          continue;
        }
        if (!fs.existsSync(fallbackPath)) {
          console.warn(
            `[Extension] Channel plugin entry not found (dist/source): ${plugin.entryPoint} (${ext.manifest.name})`
          );
          continue;
        }
        console.warn(
          `[Extension] Channel plugin runtime entry resolver failed unexpectedly: ${plugin.entryPoint} (${ext.manifest.name})`
        );
        continue;
      }
      if (result.has(plugin.type)) {
        console.warn(`[Extension] Duplicate channel plugin type "${plugin.type}", skipping`);
        continue;
      }

      logSecurity(
        `Loading channel plugin "${plugin.type}" from: ${entryPath}\n` +
          `  ⚠️  This code will run with FULL process privileges.\n` +
          `  ⚠️  Only load extensions from trusted sources.`
      );

      // TODO: Migrate to SandboxHost (Worker Thread) instead of running in main process.
      // Channel plugin code currently executes with full Node.js + Electron main process
      // privileges. Move to createSandbox() for crash isolation and permission enforcement.
      // See: docs/feature/extension-market/research/security-model.md
      try {
        // eslint-disable-next-line no-eval
        const nativeRequire = eval('require');
        const mod = nativeRequire(entryPath);

        let PluginClass = mod.default || mod.Plugin;
        // Support module.exports = Class (CommonJS)
        if (!PluginClass && typeof mod === 'function') {
          PluginClass = mod;
        }
        // Fallback: use first exported property
        if (!PluginClass && typeof mod === 'object') {
          const keys = Object.keys(mod);
          if (keys.length > 0) {
            PluginClass = mod[keys[0]];
          }
        }

        // Internal plugins that directly extend BasePlugin pass the instanceof check.
        // External extension plugins cannot import BasePlugin, so we fall back to
        // duck-type validation — they must expose start/stop/sendMessage on prototype.
        const isInternal = PluginClass && PluginClass.prototype instanceof BasePlugin;
        const isDuckValid = !isInternal && isValidPluginClass(PluginClass);

        if (!isInternal && !isDuckValid) {
          console.warn(
            `[Extension] Channel plugin "${plugin.type}": exported class must extend BasePlugin ` +
              `or implement the required methods (${REQUIRED_METHODS.join(', ')})`
          );

          continue;
        }

        const constructor = isInternal
          ? (PluginClass as typeof BasePlugin)
          : createDuckTypedWrapper(plugin.type, PluginClass as new (config?: unknown) => LegacyExternalPlugin);

        // Resolve icon path to absolute URL (aion-asset://) for frontend
        let iconUrl = plugin.icon;
        if (plugin.icon && !plugin.icon.match(/^(https?:|data:|aion-asset:|file:)/)) {
          const absPath = path.resolve(ext.directory, plugin.icon);
          iconUrl = toAssetUrl(absPath);
        }

        result.set(plugin.type, {
          constructor,
          meta: {
            ...plugin,
            icon: iconUrl,
          },
        });
        console.log(
          `[Extension] Loaded channel plugin: ${plugin.type} from ${ext.manifest.name}` +
            (isDuckValid ? ' [duck-typed-wrapped]' : '')
        );
        logSecurity(`Channel plugin "${plugin.type}" loaded successfully`);
      } catch (error) {
        console.error(`[Extension] Failed to load channel plugin "${plugin.type}":`, error);
      }
    }
  }
  return result;
}
