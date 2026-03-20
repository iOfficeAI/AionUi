/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import type { LoadedExtension, ExtAcpAdapter } from '../types';
import { toAssetUrl } from '../protocol/assetProtocol';

export function resolveAcpAdapters(extensions: LoadedExtension[]): Record<string, unknown>[] {
  const adapters: Record<string, unknown>[] = [];
  for (const ext of extensions) {
    const declaredAdapters = ext.manifest.contributes.acpAdapters;
    if (!declaredAdapters || declaredAdapters.length === 0) continue;
    for (const adapter of declaredAdapters) {
      adapters.push(convertAcpAdapter(adapter, ext));
    }
  }
  return adapters;
}

function convertAcpAdapter(adapter: ExtAcpAdapter, ext: LoadedExtension): Record<string, unknown> {
  const connectionType = adapter.connectionType ?? 'cli';
  return {
    id: adapter.id,
    name: adapter.name,
    description: adapter.description,
    cliCommand: adapter.cliCommand,
    // defaultCliPath: explicit config > cliCommand fallback (for CLI agents)
    defaultCliPath: adapter.defaultCliPath || adapter.cliCommand,
    acpArgs: adapter.acpArgs,
    env: adapter.env,
    avatar: adapter.icon ? resolveIconPath(adapter.icon, ext.directory) : undefined,
    authRequired: adapter.authRequired,
    supportsStreaming: adapter.supportsStreaming ?? false,
    connectionType,
    endpoint: adapter.endpoint,
    models: adapter.models,
    yoloMode: adapter.yoloMode,
    healthCheck: adapter.healthCheck,
    apiKeyFields: adapter.apiKeyFields,
    isPreset: false,
    isBuiltin: false,
    enabled: true,
    _source: 'extension',
    _extensionName: ext.manifest.name,
  };
}

function resolveIconPath(icon: string, extensionDir: string): string {
  if (icon.startsWith('http://') || icon.startsWith('https://')) return icon;
  if (!icon.includes('/') && !icon.includes('\\') && !icon.includes('.')) return icon;
  const absPath = path.isAbsolute(icon) ? icon : path.resolve(extensionDir, icon);
  // Use aion-asset:// protocol to bypass file:// security restrictions in dev mode
  return toAssetUrl(absPath);
}
