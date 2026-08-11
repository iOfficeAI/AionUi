/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedExtension, ExtMcpServer } from '../types';

export function resolveMcpServers(extensions: LoadedExtension[]): Record<string, unknown>[] {
  const servers: Record<string, unknown>[] = [];
  const now = Date.now();
  for (const ext of extensions) {
    const declaredServers = ext.manifest.contributes.mcpServers;
    if (!declaredServers || declaredServers.length === 0) continue;
    for (const server of declaredServers) {
      servers.push(convertMcpServer(server, ext, now));
    }
  }
  return servers;
}

function convertMcpServer(server: ExtMcpServer, ext: LoadedExtension, timestamp: number): Record<string, unknown> {
  return {
    id: `ext-${ext.manifest.name}-${server.name}`,
    name: server.name,
    description: server.description,
    enabled: server.enabled,
    transport: server.transport,
    createdAt: timestamp,
    updatedAt: timestamp,
    originalJson: JSON.stringify(server, null, 2),
    _source: 'extension',
    _extensionName: ext.manifest.name,
  };
}
