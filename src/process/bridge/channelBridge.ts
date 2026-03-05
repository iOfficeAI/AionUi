/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { channel } from '@/common/ipcBridge';
import { getDatabase } from '@/process/database';
import { getChannelManager } from '@/channels/core/ChannelManager';
import { getPairingService } from '@/channels/pairing/PairingService';
import { ExtensionRegistry } from '@/extensions';
import type { IChannelPluginStatus, IChannelUser, IChannelPairingRequest, IChannelSession } from '@/channels/types';
import { hasPluginCredentials, rowToChannelUser, rowToChannelSession, rowToPairingRequest } from '@/channels/types';

/**
 * Initialize Channel IPC Bridge
 * Handles communication between renderer (Settings UI) and main process (Channel system)
 */
export function initChannelBridge(): void {
  console.log('[ChannelBridge] Initializing...');

  // ==================== Plugin Management ====================

  /**
   * Get status of all plugins (including extension plugin metadata)
   */
  channel.getPluginStatus.provider(async () => {
    try {
      const db = getDatabase();
      const result = db.getChannelPlugins();

      if (!result.success || !result.data) {
        return { success: false, msg: result.error };
      }

      // Pre-fetch extension plugin metadata (lazy, cached by registry)
      const registry = ExtensionRegistry.getInstance();
      const BUILTIN_TYPES = new Set(['telegram', 'lark', 'dingtalk', 'slack', 'discord']);

      const statuses: IChannelPluginStatus[] = result.data.map((plugin) => {
        const isExtension = !BUILTIN_TYPES.has(plugin.type);
        const status: IChannelPluginStatus = {
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
        };

        // Enrich extension plugins with metadata for dynamic Settings UI
        if (isExtension) {
          try {
            const meta = registry.getChannelPluginMeta(plugin.type);
            if (meta && typeof meta === 'object') {
              const m = meta as Record<string, unknown>;
              status.extensionMeta = {
                credentialFields: Array.isArray(m.credentialFields) ? m.credentialFields : undefined,
                configFields: Array.isArray(m.configFields) ? m.configFields : undefined,
                description: typeof m.description === 'string' ? m.description : undefined,
              };
              // Try to find extension name from loaded extensions
              const extensions = registry.getLoadedExtensions();
              const ext = extensions.find((e) =>
                e.manifest.contributes.channelPlugins?.some((cp) => cp.type === plugin.type)
              );
              if (ext) {
                status.extensionMeta.extensionName = ext.manifest.displayName || ext.manifest.name;
              }
            }
          } catch {
            // Extension registry may not have meta for this type
          }
        }

        return status;
      });

      return { success: true, data: statuses };
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
      const db = getDatabase();
      const result = db.getPendingPairingRequests();

      if (!result.success || !result.data) {
        return { success: false, msg: result.error };
      }

      return { success: true, data: result.data };
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
      const db = getDatabase();
      const result = db.getChannelUsers();

      if (!result.success || !result.data) {
        return { success: false, msg: result.error };
      }

      return { success: true, data: result.data };
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
      const db = getDatabase();

      // Delete user (cascades to sessions)
      const result = db.deleteChannelUser(userId);

      if (!result.success) {
        return { success: false, msg: result.error };
      }

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
      const db = getDatabase();
      const result = db.getChannelSessions();

      if (!result.success || !result.data) {
        return { success: false, msg: result.error };
      }

      return { success: true, data: result.data };
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
