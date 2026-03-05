/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import fs from 'fs';
import { BasePlugin } from '@/channels/plugins/BasePlugin';
import type { LoadedExtension, ExtChannelPlugin } from '../types';

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

function isValidPluginClass(PluginClass: unknown): boolean {
  if (typeof PluginClass !== 'function') return false;
  const proto = (PluginClass as { prototype?: unknown }).prototype;
  if (!proto || typeof proto !== 'object') return false;
  return REQUIRED_METHODS.every((method) => typeof (proto as Record<string, unknown>)[method] === 'function');
}

export function resolveChannelPlugins(extensions: LoadedExtension[]): Map<string, ChannelPluginEntry> {
  const result = new Map<string, ChannelPluginEntry>();
  for (const ext of extensions) {
    const plugins = ext.manifest.contributes.channelPlugins;
    if (!plugins || plugins.length === 0) continue;
    for (const plugin of plugins) {
      const entryPath = path.resolve(ext.directory, plugin.entryPoint);
      if (!entryPath.startsWith(ext.directory)) {
        console.warn(`[Extension] Path traversal detected in channel plugin: ${plugin.entryPoint}`);
        continue;
      }
      if (!fs.existsSync(entryPath)) {
        console.warn(`[Extension] Channel plugin entry not found: ${entryPath}`);
        continue;
      }
      if (result.has(plugin.type)) {
        console.warn(`[Extension] Duplicate channel plugin type "${plugin.type}", skipping`);
        continue;
      }

      logSecurity(`Loading channel plugin "${plugin.type}" from: ${entryPath}\n` + `  ⚠️  This code will run with FULL process privileges.\n` + `  ⚠️  Only load extensions from trusted sources.`);

      try {
        // eslint-disable-next-line no-eval
        const nativeRequire = eval('require');
        const mod = nativeRequire(entryPath);
        const PluginClass = mod.default || mod.Plugin || mod[Object.keys(mod)[0]];

        // Internal plugins that directly extend BasePlugin pass the instanceof check.
        // External extension plugins cannot import BasePlugin, so we fall back to
        // duck-type validation — they must expose start/stop/sendMessage on prototype.
        const isInternal = PluginClass && PluginClass.prototype instanceof BasePlugin;
        const isDuckValid = !isInternal && isValidPluginClass(PluginClass);

        if (!isInternal && !isDuckValid) {
          console.warn(`[Extension] Channel plugin "${plugin.type}": exported class must extend BasePlugin ` + `or implement the required methods (${REQUIRED_METHODS.join(', ')})`);

          continue;
        }

        result.set(plugin.type, {
          constructor: PluginClass,
          meta: plugin,
        });
        console.log(`[Extension] Loaded channel plugin: ${plugin.type} (${plugin.name})` + (isDuckValid ? ' [duck-typed]' : ''));
        logSecurity(`Channel plugin "${plugin.type}" loaded successfully`);
      } catch (error) {
        console.error(`[Extension] Failed to load channel plugin "${plugin.type}":`, error);
      }
    }
  }
  return result;
}
