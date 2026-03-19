/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { existsSync } from 'fs';
import type { LoadedExtension, ExtModelProvider } from '../types';
import { isPathWithinDirectory } from '../sandbox/pathSafety';
import { toAssetUrl } from '../protocol/assetProtocol';

export interface ResolvedModelProvider {
  /** Unique provider ID (prefixed with extension name) */
  id: string;
  /** Platform identifier */
  platform: string;
  /** Display name */
  name: string;
  /** API base URL */
  baseUrl?: string;
  /** Default models */
  models: string[];
  /** Logo URL (aion-asset://) */
  logo?: string;
  /** Source extension name */
  _extensionName: string;
}

export function resolveModelProviders(extensions: LoadedExtension[]): ResolvedModelProvider[] {
  const providers: ResolvedModelProvider[] = [];
  const seenIds = new Set<string>();

  for (const ext of extensions) {
    const declared = ext.manifest.contributes.modelProviders;
    if (!declared || declared.length === 0) continue;

    for (const provider of declared) {
      const globalId = `ext-${ext.manifest.name}-${provider.id}`;

      if (seenIds.has(globalId)) {
        console.warn(`[Extensions] Duplicate model provider ID "${globalId}", skipping`);
        continue;
      }

      seenIds.add(globalId);
      providers.push(convertModelProvider(provider, ext, globalId));
    }
  }

  return providers;
}

function convertModelProvider(
  provider: ExtModelProvider,
  ext: LoadedExtension,
  globalId: string
): ResolvedModelProvider {
  let logoUrl: string | undefined;

  if (provider.logo) {
    if (provider.logo.startsWith('http://') || provider.logo.startsWith('https://')) {
      logoUrl = provider.logo;
    } else {
      const absPath = path.resolve(ext.directory, provider.logo);
      if (isPathWithinDirectory(absPath, ext.directory) && existsSync(absPath)) {
        logoUrl = toAssetUrl(absPath);
      }
    }
  }

  return {
    id: globalId,
    platform: provider.platform,
    name: provider.name,
    baseUrl: provider.baseUrl,
    models: provider.models ?? [],
    logo: logoUrl,
    _extensionName: ext.manifest.name,
  };
}
