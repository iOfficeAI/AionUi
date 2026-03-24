/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IExtensionAgentActivitySnapshot } from '@/common/adapter/ipcBridge';
import { ExtensionRegistry } from '@process/extensions';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { ActivitySnapshotBuilder } from './services/ActivitySnapshotBuilder';

const ACTIVITY_SNAPSHOT_TTL_MS = 3000;

let activitySnapshotCache: IExtensionAgentActivitySnapshot | null = null;
let activitySnapshotCachedAt = 0;
let activitySnapshotInFlight: Promise<IExtensionAgentActivitySnapshot> | null = null;

const makeGetActivitySnapshot =
  (builder: ActivitySnapshotBuilder) => async (): Promise<IExtensionAgentActivitySnapshot> => {
    const now = Date.now();
    if (activitySnapshotCache && now - activitySnapshotCachedAt <= ACTIVITY_SNAPSHOT_TTL_MS) {
      return activitySnapshotCache;
    }

    if (activitySnapshotInFlight) {
      return activitySnapshotInFlight;
    }

    activitySnapshotInFlight = Promise.resolve()
      .then(async () => {
        const snapshot = await builder.build();
        activitySnapshotCache = snapshot;
        activitySnapshotCachedAt = Date.now();
        return snapshot;
      })
      .finally(() => {
        activitySnapshotInFlight = null;
      });

    return activitySnapshotInFlight;
  };

/**
 * Initialize IPC bridge for extension system.
 * Provides extension-contributed themes (and future extension data) to the renderer process.
 */
export function initExtensionsBridge(repo: IConversationRepository, taskManager: IWorkerTaskManager): void {
  const getActivitySnapshot = makeGetActivitySnapshot(new ActivitySnapshotBuilder(repo, taskManager));
  // Get all extension-contributed CSS themes (converted to ICssTheme format)
  ipcBridge.extensions.getThemes.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getThemes();
    } catch (error) {
      console.error('[Extensions] Failed to get themes:', error);
      return [];
    }
  });

  // Get summary of all loaded extensions (with enabled/disabled status and permissions)
  ipcBridge.extensions.getLoadedExtensions.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getLoadedExtensions().map((ext) => ({
        name: ext.manifest.name,
        displayName: ext.manifest.displayName,
        version: ext.manifest.version,
        description: ext.manifest.description,
        source: ext.source,
        directory: ext.directory,
        enabled: registry.isExtensionEnabled(ext.manifest.name),
        riskLevel: registry.getExtensionRiskLevel(ext.manifest.name),
        hasLifecycle: !!(ext.manifest as any).lifecycle,
      }));
    } catch (error) {
      console.error('[Extensions] Failed to get loaded extensions:', error);
      return [];
    }
  });

  // Get all extension-contributed assistants
  ipcBridge.extensions.getAssistants.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getAssistants();
    } catch (error) {
      console.error('[Extensions] Failed to get assistants:', error);
      return [];
    }
  });

  // Get all extension-contributed ACP adapters
  ipcBridge.extensions.getAcpAdapters.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getAcpAdapters();
    } catch (error) {
      console.error('[Extensions] Failed to get ACP adapters:', error);
      return [];
    }
  });

  // Get all extension-contributed agents (autonomous agent presets)
  ipcBridge.extensions.getAgents.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getAgents();
    } catch (error) {
      console.error('[Extensions] Failed to get agents:', error);
      return [];
    }
  });

  // Get all extension-contributed MCP servers
  ipcBridge.extensions.getMcpServers.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getMcpServers();
    } catch (error) {
      console.error('[Extensions] Failed to get MCP servers:', error);
      return [];
    }
  });

  // Get all extension-contributed skills
  ipcBridge.extensions.getSkills.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getSkills();
    } catch (error) {
      console.error('[Extensions] Failed to get skills:', error);
      return [];
    }
  });

  // Get all extension-contributed settings tabs
  ipcBridge.extensions.getSettingsTabs.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getSettingsTabs();
    } catch (error) {
      console.error('[Extensions] Failed to get settings tabs:', error);
      return [];
    }
  });

  // Get extension-contributed WebUI metadata (api routes + static assets)
  ipcBridge.extensions.getWebuiContributions.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getWebuiContributions().map((item) => ({
        extensionName: item.extensionName,
        apiRoutes: (item.config.apiRoutes || []).map((route) => ({
          path: route.path,
          auth: route.auth !== false,
        })),
        staticAssets: (item.config.staticAssets || []).map((asset) => ({
          urlPrefix: asset.urlPrefix,
          directory: asset.directory,
        })),
      }));
    } catch (error) {
      console.error('[Extensions] Failed to get webui contributions:', error);
      return [];
    }
  });

  // Get activity snapshot for extension settings tabs (e.g. Star Office)
  ipcBridge.extensions.getAgentActivitySnapshot.provider(async () => {
    try {
      return await getActivitySnapshot();
    } catch (error) {
      console.error('[Extensions] Failed to build agent activity snapshot:', error);
      return {
        generatedAt: Date.now(),
        totalConversations: 0,
        runningConversations: 0,
        agents: [],
      };
    }
  });

  // Get merged extension i18n translations for a specific locale
  ipcBridge.extensions.getExtI18nForLocale.provider(async ({ locale }) => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getExtI18nForLocale(locale);
    } catch (error) {
      console.error('[Extensions] Failed to get ext i18n for locale:', error);
      return {};
    }
  });

  // --- Extension Management API (NocoBase-inspired) ---

  // Enable an extension
  ipcBridge.extensions.enableExtension.provider(async ({ name }) => {
    try {
      const registry = ExtensionRegistry.getInstance();
      const success = await registry.enableExtension(name);
      if (success) {
        ipcBridge.extensions.stateChanged.emit({ name, enabled: true });
      }
      return {
        success,
        msg: success ? undefined : `Failed to enable "${name}"`,
      };
    } catch (error) {
      console.error(`[Extensions] Failed to enable "${name}":`, error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Disable an extension
  ipcBridge.extensions.disableExtension.provider(async ({ name, reason }) => {
    try {
      const registry = ExtensionRegistry.getInstance();
      const success = await registry.disableExtension(name, reason);
      if (success) {
        ipcBridge.extensions.stateChanged.emit({
          name,
          enabled: false,
          reason,
        });
      }
      return {
        success,
        msg: success ? undefined : `Failed to disable "${name}"`,
      };
    } catch (error) {
      console.error(`[Extensions] Failed to disable "${name}":`, error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Get permission summary for an extension (Figma-inspired)
  ipcBridge.extensions.getPermissions.provider(async ({ name }) => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getExtensionPermissions(name);
    } catch (error) {
      console.error(`[Extensions] Failed to get permissions for "${name}":`, error);
      return [];
    }
  });

  // Get risk level for an extension
  ipcBridge.extensions.getRiskLevel.provider(async ({ name }) => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getExtensionRiskLevel(name);
    } catch (error) {
      console.error(`[Extensions] Failed to get risk level for "${name}":`, error);
      return 'safe';
    }
  });
}
