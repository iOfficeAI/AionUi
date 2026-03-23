/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { existsSync, readFileSync } from 'fs';
import type { ICssTheme } from '@/common/config/storage';
import type { LoadedExtension, ExtTheme } from '../types';
import { toAssetUrl } from '../protocol/assetProtocol';
import { isPathWithinDirectory } from '../sandbox/pathSafety';

export function resolveThemes(extensions: LoadedExtension[]): ICssTheme[] {
  const themes: ICssTheme[] = [];
  const seenThemeIds = new Set<string>();

  for (const ext of extensions) {
    const declaredThemes = ext.manifest.contributes.themes;
    if (!declaredThemes || declaredThemes.length === 0) continue;

    for (const theme of declaredThemes) {
      const resolved = convertTheme(theme, ext);
      if (!resolved) continue;

      // Global de-duplication by final theme ID to prevent duplicate loading.
      if (seenThemeIds.has(resolved.id)) {
        console.warn(`[Extensions] Duplicate resolved theme ID "${resolved.id}", skipping (${ext.manifest.name})`);
        continue;
      }
      seenThemeIds.add(resolved.id);
      themes.push(resolved);
    }
  }

  return themes;
}

function convertTheme(theme: ExtTheme, ext: LoadedExtension): ICssTheme | null {
  const absolutePath = path.resolve(ext.directory, theme.file);
  if (!isPathWithinDirectory(absolutePath, ext.directory)) {
    console.warn(`[Extensions] Theme file path traversal attempt: ${theme.file} in ${ext.manifest.name}`);
    return null;
  }
  if (!existsSync(absolutePath)) {
    console.warn(`[Extensions] Theme file not found: ${absolutePath} (extension: ${ext.manifest.name})`);
    return null;
  }
  try {
    const css = readFileSync(absolutePath, 'utf-8');
    const now = Date.now();

    let cover: string | undefined;
    if (theme.cover) {
      const coverPath = path.resolve(ext.directory, theme.cover);
      if (isPathWithinDirectory(coverPath, ext.directory) && existsSync(coverPath)) {
        // Use aion-asset:// protocol to bypass file:// security restrictions in dev mode
        cover = toAssetUrl(coverPath);
      }
    }

    return {
      // Prefix with extension name to avoid ID conflicts
      id: `ext-${ext.manifest.name}-${theme.id}`,
      name: `${theme.name} (${ext.manifest.displayName || ext.manifest.name})`,
      css,
      cover,
      isPreset: true,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    console.warn(
      `[Extensions] Failed to read theme file ${absolutePath}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
