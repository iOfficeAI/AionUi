/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';
import * as path from 'path';
import stripJsonComments from 'strip-json-comments';
import { EXTENSION_MANIFEST_FILE, getExtensionScanSources } from './constants';
import { resolveEnvInObject, UndefinedEnvVariableError } from './resolvers/utils/envResolver';
import { resolveFileRefs } from './resolvers/utils/fileResolver';
import { ExtensionManifestSchema, type ExtensionSource, type LoadedExtension } from './types';

type ExtensionLoaderOptions = {
  continueOnError?: boolean;
  strictMode?: boolean;
};

export class ExtensionLoader {
  private options: ExtensionLoaderOptions;

  constructor(options?: ExtensionLoaderOptions) {
    this.options = {
      continueOnError: true,
      ...options,
    };
  }

  async loadAll(): Promise<LoadedExtension[]> {
    const allExtensions: LoadedExtension[] = [];
    const seenNames = new Set<string>();

    for (const { dir, source } of getExtensionScanSources()) {
      const extensions = await this.scanDirectory(dir, source);
      for (const ext of extensions) {
        if (seenNames.has(ext.manifest.name)) {
          console.warn(
            `[Extensions] Skipping duplicate extension "${ext.manifest.name}" from ${ext.directory} (already loaded)`
          );
          continue;
        }
        seenNames.add(ext.manifest.name);
        allExtensions.push(ext);
      }
    }

    return allExtensions;
  }

  private async scanDirectory(baseDir: string, source: ExtensionSource): Promise<LoadedExtension[]> {
    if (!existsSync(baseDir)) {
      return [];
    }

    const extensions: LoadedExtension[] = [];
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const extensionDir = path.join(baseDir, entry.name);
        const manifestPath = path.join(extensionDir, EXTENSION_MANIFEST_FILE);

        if (!existsSync(manifestPath)) continue;

        try {
          const loaded = await this.loadManifest(extensionDir, manifestPath, source);
          if (loaded) {
            extensions.push(loaded);
          }
        } catch (error) {
          if (error instanceof UndefinedEnvVariableError) {
            if (!this.options.continueOnError) {
              throw error;
            }
            console.error(`[Extensions] Failed to load extension from ${extensionDir}: ${error.message}`);
          } else {
            console.warn(
              `[Extensions] Failed to load extension from ${extensionDir}:`,
              error instanceof Error ? error.message : error
            );
          }
        }
      }
    } catch (error) {
      console.warn(`[Extensions] Failed to scan directory ${baseDir}:`, error instanceof Error ? error.message : error);
    }

    return extensions;
  }

  private async loadManifest(
    extensionDir: string,
    manifestPath: string,
    source: ExtensionSource
  ): Promise<LoadedExtension | null> {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const jsonStr = stripJsonComments(raw);
    let parsed: unknown;

    try {
      parsed = JSON.parse(jsonStr);
    } catch (error) {
      console.warn(`[Extensions] Invalid JSON in ${manifestPath}:`, error instanceof Error ? error.message : error);
      return null;
    }

    const fileResolved = await resolveFileRefs(parsed, extensionDir);
    const resolved = resolveEnvInObject(fileResolved, this.options);

    const result = ExtensionManifestSchema.safeParse(resolved);
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      console.warn(`[Extensions] Schema validation failed for ${manifestPath}: ${errors}`);
      return null;
    }

    return {
      manifest: result.data,
      directory: extensionDir,
      source,
    };
  }
}
