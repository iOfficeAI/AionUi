/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { channel } from '@/common/adapter/ipcBridge';
import { getChannelManager } from '@process/channels/core/ChannelManager';
import { getPairingService } from '@process/channels/pairing/PairingService';
import { ExtensionRegistry } from '@process/extensions';
import { toAssetUrl } from '@process/extensions/protocol/assetProtocol';
import * as path from 'path';
import type {
  IChannelPluginStatus,
  IChannelUser,
  IChannelPairingRequest,
  IChannelSession,
} from '@process/channels/types';
import { hasPluginCredentials } from '@process/channels/types';
import type { IChannelRepository } from '@process/services/database/IChannelRepository';

/**
 * Initialize Channel IPC Bridge
 * Handles communication between renderer (Settings UI) and main process (Channel system)
 */
export function initChannelBridge(channelRepo: IChannelRepository): void {
  console.log('[ChannelBridge] Initializing...');

  // ==================== Plugin Management ====================

  /**
   * Get status of all plugins (including extension plugin metadata)
   */
  channel.getPluginStatus.provider(async () => {
    try {
      const BUILTIN_TYPES = new Set(['telegram', 'lark', 'dingtalk', 'slack', 'discord', 'weixin', 'wecom']);

      let dbPlugins: import('@process/channels/types').IChannelPluginConfig[] = [];
      try {
        dbPlugins = await channelRepo.getChannelPlugins();
      } catch (dbError) {
        console.warn('[ChannelBridge] getChannelPlugins failed, proceeding with builtin-only list:', dbError);
      }

      // Pre-fetch extension plugin metadata (lazy, cached by registry)
      const registry = ExtensionRegistry.getInstance();

      const extensions = registry.getLoadedExtensions();
      const resolveExtensionMeta = (pluginType: string): IChannelPluginStatus['extensionMeta'] | undefined => {
        try {
          const meta = registry.getChannelPluginMeta(pluginType);
          if (!meta || typeof meta !== 'object') return undefined;
          const m = meta as Record<string, unknown>;
          const extensionMeta: NonNullable<IChannelPluginStatus['extensionMeta']> = {
            credentialFields: Array.isArray(m.credentialFields) ? m.credentialFields : undefined,
            configFields: Array.isArray(m.configFields) ? m.configFields : undefined,
            description: typeof m.description === 'string' ? m.description : undefined,
          };

          const ext = extensions.find((e) =>
            e.manifest.contributes.channelPlugins?.some((cp) => cp.type === pluginType)
          );
          if (ext) {
            extensionMeta.extensionName = ext.manifest.displayName || ext.manifest.name;
            const iconField = typeof m.icon === 'string' ? m.icon : undefined;
            if (iconField) {
              if (
                iconField.startsWith('http://') ||
                iconField.startsWith('https://') ||
                iconField.startsWith('data:') ||
                iconField.startsWith('file://') ||
                iconField.startsWith('aion-asset://')
              ) {
                extensionMeta.icon = iconField;
              } else {
                const absPath = path.isAbsolute(iconField) ? iconField : path.resolve(ext.directory, iconField);
                extensionMeta.icon = toAssetUrl(absPath);
              }
            }
          }

          return extensionMeta;
        } catch {
          return undefined;
        }
      };

      // Build a set of channel types whose parent extension is currently enabled
      const enabledExtChannelTypes = new Set<string>();
      for (const [pluginType] of registry.getChannelPlugins()) {
        enabledExtChannelTypes.add(pluginType);
      }

      const statusMap = new Map<string, IChannelPluginStatus>();

      for (const plugin of dbPlugins) {
        const isExtension = !BUILTIN_TYPES.has(plugin.type);

        // Skip extension channels whose parent extension is not loaded/enabled
        if (isExtension && !enabledExtChannelTypes.has(plugin.type)) {
          continue;
        }

        statusMap.set(plugin.type, {
          id: plugin.id,
          type: plugin.type,
          name: plugin.name,
          enabled: plugin.enabled,
          connected: plugin.status === 'running',
          status: plugin.status,
          lastConnected: plugin.lastConnected,
          activeUsers: 0,
          hasToken: hasPluginCredentials(plugin.type, plugin.credentials),
          isExtension,
          extensionMeta: isExtension ? resolveExtensionMeta(plugin.type) : undefined,
        });
      }

      // Ensure extension-contributed channel plugins are always visible in settings
      // even before first enable (i.e. not yet persisted in DB).
      for (const [pluginType, entry] of registry.getChannelPlugins()) {
        if (statusMap.has(pluginType)) continue;
        const extensionMeta = resolveExtensionMeta(pluginType);
        const meta = entry.meta as { name?: string } | undefined;
        statusMap.set(pluginType, {
          id: pluginType,
          type: pluginType,
          name: meta?.name || pluginType,
          enabled: false,
          connected: false,
          status: 'stopped',
          activeUsers: 0,
          hasToken: false,
          isExtension: true,
          extensionMeta,
        });
      }

      // Ensure builtin channel types are always visible in settings
      // even before user configures them (i.e. not yet persisted in DB).
      const BUILTIN_NAMES: Record<string, string> = {
        telegram: 'Telegram',
        lark: 'Lark',
        dingtalk: 'DingTalk',
        slack: 'Slack',
        discord: 'Discord',
        weixin: 'WeChat',
      };
      for (const builtinType of BUILTIN_TYPES) {
        if (statusMap.has(builtinType)) continue;
        statusMap.set(builtinType, {
          id: builtinType,
          type: builtinType,
          name: BUILTIN_NAMES[builtinType] || builtinType,
          enabled: false,
          connected: false,
          status: 'stopped',
          activeUsers: 0,
          hasToken: false,
          isExtension: false,
        });
      }

      return { success: true, data: Array.from(statusMap.values()) };
    } catch (error: any) {
      console.error('[ChannelBridge] getPluginStatus error:', error);
      return { success: false, msg: error.message };
    }
  });

  /**
   * Enable a plugin
   */
  channel.enablePlugin.provider(async ({ pluginId, config }) => {
    try {
      const manager = getChannelManager();
      const result = await manager.enablePlugin(pluginId, config);

      if (!result.success) {
        return { success: false, msg: result.error };
      }

      return { success: true };
    } catch (error: any) {
      console.error('[ChannelBridge] enablePlugin error:', error);
      return { success: false, msg: error.message };
    }
  });

  /**
   * Disable a plugin
   */
  channel.disablePlugin.provider(async ({ pluginId }) => {
    try {
      const manager = getChannelManager();
      const result = await manager.disablePlugin(pluginId);

      if (!result.success) {
        return { success: false, msg: result.error };
      }

      return { success: true };
    } catch (error: any) {
      console.error('[ChannelBridge] disablePlugin error:', error);
      return { success: false, msg: error.message };
    }
  });

  /**
   * Test plugin connection (validate token)
   */
  channel.testPlugin.provider(async ({ pluginId, token, extraConfig }) => {
    try {
      const manager = getChannelManager();
      const result = await manager.testPlugin(pluginId, token, extraConfig);
      return { success: true, data: result };
    } catch (error: any) {
      console.error('[ChannelBridge] testPlugin error:', error);
      return { success: false, data: { success: false, error: error.message } };
    }
  });

  // ==================== Pairing Management ====================

  /**
   * Get pending pairing requests
   */
  channel.getPendingPairings.provider(async () => {
    try {
      const data = await channelRepo.getPendingPairingRequests();
      return { success: true, data };
    } catch (error: any) {
      console.error('[ChannelBridge] getPendingPairings error:', error);
      return { success: false, msg: error.message };
    }
  });

  /**
   * Approve a pairing request
   * Delegates to PairingService to avoid duplicate logic
   */
  channel.approvePairing.provider(async ({ code }) => {
    try {
      const pairingService = getPairingService();
      const result = await pairingService.approvePairing(code);

      if (!result.success) {
        return { success: false, msg: result.error };
      }

      console.log(`[ChannelBridge] Approved pairing for code ${code}`);
      return { success: true };
    } catch (error: any) {
      console.error('[ChannelBridge] approvePairing error:', error);
      return { success: false, msg: error.message };
    }
  });

  /**
   * Reject a pairing request
   * Delegates to PairingService to avoid duplicate logic
   */
  channel.rejectPairing.provider(async ({ code }) => {
    try {
      const pairingService = getPairingService();
      const result = await pairingService.rejectPairing(code);

      if (!result.success) {
        return { success: false, msg: result.error };
      }

      console.log(`[ChannelBridge] Rejected pairing code ${code}`);
      return { success: true };
    } catch (error: any) {
      console.error('[ChannelBridge] rejectPairing error:', error);
      return { success: false, msg: error.message };
    }
  });

  // ==================== User Management ====================

  /**
   * Get all authorized users
   */
  channel.getAuthorizedUsers.provider(async () => {
    try {
      const data = await channelRepo.getChannelUsers();
      return { success: true, data };
    } catch (error: any) {
      console.error('[ChannelBridge] getAuthorizedUsers error:', error);
      return { success: false, msg: error.message };
    }
  });

  /**
   * Revoke user authorization
   */
  channel.revokeUser.provider(async ({ userId }) => {
    try {
      // Delete user (cascades to sessions)
      await channelRepo.deleteChannelUser(userId);
      console.log(`[ChannelBridge] Revoked user ${userId}`);
      return { success: true };
    } catch (error: any) {
      console.error('[ChannelBridge] revokeUser error:', error);
      return { success: false, msg: error.message };
    }
  });

  // ==================== Session Management ====================

  /**
   * Get active sessions
   */
  channel.getActiveSessions.provider(async () => {
    try {
      const data = await channelRepo.getChannelSessions();
      return { success: true, data };
    } catch (error: any) {
      console.error('[ChannelBridge] getActiveSessions error:', error);
      return { success: false, msg: error.message };
    }
  });

  // ==================== Settings Sync ====================

  /**
   * Sync channel settings after agent or model change
   */
  channel.syncChannelSettings.provider(async ({ platform, agent, model }) => {
    try {
      const manager = getChannelManager();
      const result = await manager.syncChannelSettings(platform, agent, model);
      if (!result.success) {
        return { success: false, msg: result.error };
      }
      return { success: true };
    } catch (error: any) {
      console.error('[ChannelBridge] syncChannelSettings error:', error);
      return { success: false, msg: error.message };
    }
  });

  console.log('[ChannelBridge] Initialized');
}
