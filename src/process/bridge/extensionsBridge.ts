/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ExtensionRegistry } from '@/extensions';

/**
 * Initialize IPC bridge for extension system.
 * Provides extension-contributed themes (and future extension data) to the renderer process.
 */
export function initExtensionsBridge(): void {
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

  // Get summary of all loaded extensions
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
      }));
    } catch (error) {
      console.error('[Extensions] Failed to get loaded extensions:', error);
      return [];
    }
  });
}
