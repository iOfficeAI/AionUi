/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { channel } from '@/common/ipcBridge';
import { getDatabase } from '@/process/database';
import { getChannelManager } from '@/channels/core/ChannelManager';
import { ExtensionRegistry } from '@/extensions';
import { toAssetUrl } from '@/extensions/assetProtocol';
import * as path from 'path';
import type { IChannelPluginStatus, IChannelUser, IChannelPairingRequest, IChannelSession } from '@/channels/types';
import { hasPluginCredentials, rowToChannelUser, rowToChannelSession, rowToPairingRequest } from '@/channels/types';

/**
 * Initialize Channel IPC Bridge
 * Handles communication between renderer (Settings UI) and main process (Channel system)
 */
export function initChannelBridge(): void {
  console.log('[ChannelBridge] Initializing...');

  const ensureChannelManagerInitialized = async () => {
    const manager = getChannelManager();
    if (!manager.isInitialized()) {
      await manager.initialize();
    }
    return manager;
  };

  // ==================== Plugin Management ====================

  /**
   * Get status of all plugins (including extension plugin metadata)
   */
  channel.getPluginStatus.provider(async () => {
    try {
      const BUILTIN_TYPES = new Set(['telegram', 'lark', 'dingtalk', 'slack', 'discord']);

      let dbPlugins: import('@/channels/types').IChannelPluginConfig[] = [];
      try {
        const db = getDatabase();
        const result = db.getChannelPlugins();
        if (result.success && Array.isArray(result.data)) {
          dbPlugins = result.data;
        }
      } catch (dbError) {
        console.warn('[ChannelBridge] getChannelPlugins failed, proceeding with builtin-only list:', dbError);
      }

      let liveStatusMap = new Map<string, IChannelPluginStatus>();
      try {
        const manager = await ensureChannelManagerInitialized();
        const liveStatuses = manager.getBotRegistry()?.getPluginStatuses() || [];
        liveStatusMap = new Map(liveStatuses.map((status) => [status.id, status]));
      } catch (managerError) {
        console.warn('[ChannelBridge] Failed to load live channel status, falling back to persisted status:', managerError);
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
            multiInstance: typeof m.multiInstance === 'boolean' ? m.multiInstance : undefined,
          };

          const ext = extensions.find((e) => e.manifest.contributes.channelPlugins?.some((cp) => cp.type === pluginType));
          if (ext) {
            extensionMeta.extensionName = ext.manifest.displayName || ext.manifest.name;
            const iconField = typeof m.icon === 'string' ? m.icon : undefined;
            if (iconField) {
              if (iconField.startsWith('http://') || iconField.startsWith('https://') || iconField.startsWith('data:') || iconField.startsWith('file://') || iconField.startsWith('aion-asset://')) {
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

        const liveStatus = liveStatusMap.get(plugin.id);
        statusMap.set(plugin.id, {
          id: plugin.id,
          type: plugin.type,
          name: liveStatus?.name || plugin.name,
          enabled: plugin.enabled,
          connected: liveStatus?.connected ?? false,
          status: liveStatus?.status ?? plugin.status,
          lastConnected: liveStatus?.lastConnected ?? plugin.lastConnected,
          error: liveStatus?.error,
          activeUsers: liveStatus?.activeUsers ?? 0,
          botUsername: liveStatus?.botUsername,
          hasToken: liveStatus?.hasToken ?? hasPluginCredentials(plugin.type, plugin.credentials),
          isExtension,
          extensionMeta: isExtension ? resolveExtensionMeta(plugin.type) : undefined,
        });
      }

      // Ensure extension-contributed channel plugins are always visible in settings
      // even before first enable (i.e. not yet persisted in DB).
      for (const [pluginType, entry] of registry.getChannelPlugins()) {
        const hasPluginTypeInstance = Array.from(statusMap.values()).some((status) => status.type === pluginType);
        if (hasPluginTypeInstance) continue;
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

      // Ensure builtin default channel instances are always visible in settings
      // even before user configures them (i.e. not yet persisted in DB).
      const BUILTIN_NAMES: Record<string, string> = {
        telegram: 'Telegram',
        lark: 'Lark',
        dingtalk: 'DingTalk',
        slack: 'Slack',
        discord: 'Discord',
      };
      for (const builtinType of BUILTIN_TYPES) {
        const defaultPluginId = `${builtinType}_default`;
        if (statusMap.has(defaultPluginId)) continue;
        statusMap.set(defaultPluginId, {
          id: defaultPluginId,
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
      const manager = await ensureChannelManagerInitialized();
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
  channel.getPendingPairings.provider(async (params: { pluginId?: string; platformType?: string }) => {
    try {
      const db = getDatabase();
      const result = db.getPendingPairingRequests();

      if (!result.success || !result.data) {
        return { success: false, msg: result.error };
      }

      const filtered = result.data.filter((item) => {
        if (params?.platformType && item.platformType !== params.platformType) {
          return false;
        }
        if (params?.pluginId && (item.pluginId ?? `${item.platformType}_default`) !== params.pluginId) {
          return false;
        }
        return true;
      });

      return { success: true, data: filtered };
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
      const manager = await ensureChannelManagerInitialized();
      const pairingService = manager.getPairingService();
      if (!pairingService) {
        return { success: false, msg: 'Pairing service unavailable' };
      }
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
      const manager = await ensureChannelManagerInitialized();
      const pairingService = manager.getPairingService();
      if (!pairingService) {
        return { success: false, msg: 'Pairing service unavailable' };
      }
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
  channel.getAuthorizedUsers.provider(async (params) => {
    try {
      const db = getDatabase();
      const result = db.getChannelUsers();

      if (!result.success || !result.data) {
        return { success: false, msg: result.error };
      }

      const filtered = result.data.filter((item) => {
        if (params?.platformType && item.platformType !== params.platformType) {
          return false;
        }
        if (params?.pluginId && (item.pluginId ?? `${item.platformType}_default`) !== params.pluginId) {
          return false;
        }
        return true;
      });

      return { success: true, data: filtered };
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
  channel.syncChannelSettings.provider(async ({ platform, agent, model, pluginId, change }) => {
    try {
      const manager = await ensureChannelManagerInitialized();
      const result = await manager.syncChannelSettings(platform, agent, model, pluginId);
      if (!result.success) {
        return { success: false, msg: result.error };
      }
      if (change) {
        channel.settingsChanged.emit({
          platformType: platform,
          pluginId,
          change,
        });
      }
      return { success: true };
    } catch (error: any) {
      console.error('[ChannelBridge] syncChannelSettings error:', error);
      return { success: false, msg: error.message };
    }
  });

  /**
   * Create new plugin instance (builtin + extension)
   */
  channel.createPluginInstance.provider(async ({ platform, pluginType }) => {
    try {
      const targetType = platform || pluginType;
      if (!targetType) {
        return { success: false, msg: 'platform or pluginType is required' };
      }

      const db = getDatabase();
      const allPluginsResult = db.getChannelPlugins();
      if (!allPluginsResult.success || !allPluginsResult.data) {
        return { success: false, msg: allPluginsResult.error || 'Failed to load channel plugins' };
      }

      const BUILTIN_TYPES = new Set(['telegram', 'lark', 'dingtalk', 'slack', 'discord']);
      const isBuiltin = BUILTIN_TYPES.has(targetType);

      if (!isBuiltin) {
        const meta = ExtensionRegistry.getInstance().getChannelPluginMeta(targetType) as { multiInstance?: boolean } | undefined;
        if (!meta) {
          return { success: false, msg: `Unknown extension channel type: ${targetType}` };
        }
        if (!meta.multiInstance) {
          return { success: false, msg: 'This extension channel does not support multiple instances' };
        }
      }

      const sameTypePlugins = allPluginsResult.data.filter((plugin) => plugin.type === targetType);
      const usedIds = new Set(sameTypePlugins.map((plugin) => plugin.id));

      let seq = 1;
      let pluginId = `${targetType}_${seq}`;
      while (usedIds.has(pluginId) || pluginId === `${targetType}_default` || pluginId === targetType) {
        seq += 1;
        pluginId = `${targetType}_${seq}`;
      }

      const extensionMeta = !isBuiltin ? (ExtensionRegistry.getInstance().getChannelPluginMeta(targetType) as { name?: string } | undefined) : undefined;
      const builtinNameBase = targetType === 'telegram' ? 'Telegram Bot' : targetType === 'lark' ? 'Lark Bot' : targetType === 'dingtalk' ? 'DingTalk Bot' : targetType;
      const pluginNameBase = isBuiltin ? builtinNameBase : extensionMeta?.name || targetType;

      const pluginConfig: import('@/channels/types').IChannelPluginConfig = {
        id: pluginId,
        type: targetType,
        name: `${pluginNameBase} ${sameTypePlugins.length + 1}`,
        enabled: false,
        credentials: undefined,
        config: undefined,
        status: 'stopped',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const saveResult = db.upsertChannelPlugin(pluginConfig);
      if (!saveResult.success) {
        return { success: false, msg: saveResult.error || 'Failed to create plugin instance' };
      }

      channel.settingsChanged.emit({
        platformType: targetType,
        pluginId,
        change: 'plugin-instance-created',
      });

      return { success: true, data: { pluginId } };
    } catch (error: any) {
      console.error('[ChannelBridge] createPluginInstance error:', error);
      return { success: false, msg: error.message };
    }
  });

  /**
   * Rename plugin instance
   */
  channel.renamePluginInstance.provider(async ({ pluginId, pluginType, name }) => {
    try {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return { success: false, msg: 'Instance name is required' };
      }

      const db = getDatabase();
      const existingResult = db.getChannelPlugin(pluginId);
      if (!existingResult.success) {
        return { success: false, msg: existingResult.error || 'Failed to load channel plugin' };
      }

      const existingPlugin = existingResult.data;
      const resolvedType = existingPlugin?.type || pluginType;
      if (!resolvedType) {
        return { success: false, msg: 'pluginType is required for unmanaged instance rename' };
      }

      const nextPlugin: import('@/channels/types').IChannelPluginConfig = {
        id: pluginId,
        type: resolvedType,
        name: trimmedName,
        enabled: existingPlugin?.enabled ?? false,
        credentials: existingPlugin?.credentials,
        config: existingPlugin?.config,
        status: existingPlugin?.status ?? 'stopped',
        lastConnected: existingPlugin?.lastConnected,
        createdAt: existingPlugin?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };

      const saveResult = db.upsertChannelPlugin(nextPlugin);
      if (!saveResult.success) {
        return { success: false, msg: saveResult.error || 'Failed to rename channel instance' };
      }

      return { success: true };
    } catch (error: any) {
      console.error('[ChannelBridge] renamePluginInstance error:', error);
      return { success: false, msg: error.message };
    }
  });

  /**
   * Delete plugin instance
   */
  channel.deletePluginInstance.provider(async ({ pluginId }) => {
    try {
      const db = getDatabase();
      const allPluginsResult = db.getChannelPlugins();
      if (!allPluginsResult.success || !allPluginsResult.data) {
        return { success: false, msg: allPluginsResult.error || 'Failed to load channel plugins' };
      }

      const targetPlugin = allPluginsResult.data.find((plugin) => plugin.id === pluginId);
      if (!targetPlugin) {
        return { success: false, msg: 'Plugin instance not found' };
      }

      const isDefaultInstance = pluginId === targetPlugin.type || pluginId.endsWith('_default');
      if (isDefaultInstance) {
        return { success: false, msg: 'Default plugin instance cannot be deleted' };
      }

      if (targetPlugin.enabled) {
        const manager = await ensureChannelManagerInitialized();
        const disableResult = await manager.disablePlugin(pluginId);
        if (!disableResult.success) {
          return { success: false, msg: disableResult.error || 'Failed to disable plugin before deletion' };
        }
      }

      const deleteResult = db.deleteChannelPlugin(pluginId);
      if (!deleteResult.success) {
        return { success: false, msg: deleteResult.error || 'Failed to delete plugin instance' };
      }
      if (!deleteResult.data) {
        return { success: false, msg: 'Plugin instance not found in database' };
      }

      channel.settingsChanged.emit({
        platformType: targetPlugin.type,
        pluginId,
        change: 'plugin-instance-deleted',
      });

      return { success: true };
    } catch (error: any) {
      console.error('[ChannelBridge] deletePluginInstance error:', error);
      return { success: false, msg: error.message };
    }
  });

  console.log('[ChannelBridge] Initialized');
}
