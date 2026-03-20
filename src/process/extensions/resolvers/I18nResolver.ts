/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension i18n resolver.
 *
 * Loads translation files from extension `i18n/` directories following the same
 * structure as `src/renderer/services/i18n/locales/`:
 *
 *   i18n/{locale}/{module}.json
 *
 * Translations are namespaced under `ext.{extensionName}` to avoid key collisions
 * with the core app or other extensions.
 *
 * Example: `i18n/zh-CN/extension.json` with `{ "displayName": "你好世界" }`
 * becomes accessible as `ext.hello-world.extension.displayName` in i18next.
 */

import fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import stripJsonComments from 'strip-json-comments';
import type { LoadedExtension } from '../types';
import { isPathWithinDirectory } from '../sandbox/pathSafety';

/**
 * Resolved i18n data for a single extension.
 * Keys are locale codes (e.g. 'en-US', 'zh-CN'), values are flattened module objects.
 */
export type ExtensionLocaleData = Record<string, Record<string, unknown>>;

/**
 * Aggregated i18n data for all extensions.
 * Outer key: locale code, inner key: `ext.{extensionName}` namespace.
 */
export type AggregatedExtI18n = Record<string, Record<string, Record<string, unknown>>>;

/**
 * Load all locale modules for a single extension.
 *
 * Scans `{extensionDir}/{localesDir}/{locale}/` for JSON files, reads them,
 * and organises them by locale → module name → translations.
 */
export async function loadExtensionLocales(ext: LoadedExtension): Promise<ExtensionLocaleData> {
  const i18nConfig = ext.manifest.i18n;
  const localesDir = i18nConfig?.localesDir ?? 'i18n';
  const localesRoot = path.resolve(ext.directory, localesDir);

  if (!isPathWithinDirectory(localesRoot, ext.directory)) {
    console.warn(`[Extensions] i18n localesDir path traversal attempt in ${ext.manifest.name}`);
    return {};
  }
  if (!existsSync(localesRoot)) {
    return {};
  }

  const result: ExtensionLocaleData = {};

  try {
    const localeDirs = await fs.readdir(localesRoot, { withFileTypes: true });

    for (const entry of localeDirs) {
      if (!entry.isDirectory()) continue;

      const locale = entry.name; // e.g. 'en-US', 'zh-CN'
      const localeDir = path.resolve(localesRoot, locale);

      if (!isPathWithinDirectory(localeDir, localesRoot)) continue;

      const modules = await loadLocaleDir(localeDir);
      if (Object.keys(modules).length > 0) {
        result[locale] = modules;
      }
    }
  } catch (error) {
    console.warn(
      `[Extensions] Failed to read i18n directory for ${ext.manifest.name}:`,
      error instanceof Error ? error.message : error
    );
  }

  return result;
}

/**
 * Load all JSON module files from a single locale directory.
 * Returns a flat object mapping `moduleName.key` → value.
 *
 * For example, `extension.json` containing `{ "displayName": "Hello" }`
 * returns `{ "extension": { "displayName": "Hello" } }`.
 */
async function loadLocaleDir(localeDir: string): Promise<Record<string, unknown>> {
  const modules: Record<string, unknown> = {};

  try {
    const files = await fs.readdir(localeDir, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile()) continue;

      const ext = path.extname(file.name).toLowerCase();
      if (ext !== '.json' && ext !== '.jsonc') continue;

      const moduleName = path.basename(file.name, ext); // e.g. 'extension', 'assistants'
      const filePath = path.resolve(localeDir, file.name);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const stripped = stripJsonComments(content);
        const parsed = JSON.parse(stripped);
        modules[moduleName] = parsed;
      } catch (err) {
        console.warn(`[Extensions] Failed to parse i18n file ${filePath}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (error) {
    console.warn(
      `[Extensions] Failed to read locale directory ${localeDir}:`,
      error instanceof Error ? error.message : error
    );
  }

  return modules;
}

/**
 * Resolve i18n data from all enabled extensions and aggregate by locale.
 *
 * Returns a structure ready to be merged into i18next resources:
 * ```
 * {
 *   "en-US": {
 *     "ext.hello-world": { "extension": { "displayName": "Hello World" }, ... }
 *   },
 *   "zh-CN": {
 *     "ext.hello-world": { "extension": { "displayName": "你好世界" }, ... }
 *   }
 * }
 * ```
 */
export async function resolveExtensionI18n(extensions: LoadedExtension[]): Promise<AggregatedExtI18n> {
  const aggregated: AggregatedExtI18n = {};

  for (const ext of extensions) {
    const localeData = await loadExtensionLocales(ext);
    const namespace = `ext.${ext.manifest.name}`;

    for (const [locale, modules] of Object.entries(localeData)) {
      if (!aggregated[locale]) {
        aggregated[locale] = {};
      }
      aggregated[locale][namespace] = modules;
    }
  }

  return aggregated;
}

/**
 * Get translations for a specific locale from aggregated extension i18n data.
 * Merges all extension namespaces into a single object suitable for i18next.
 *
 * Falls back to `defaultLocale` (usually 'en-US') for missing keys.
 */
export function getExtI18nForLocale(
  aggregated: AggregatedExtI18n,
  locale: string,
  defaultLocale = 'en-US'
): Record<string, unknown> {
  const fallback = aggregated[defaultLocale] ?? {};
  const target = aggregated[locale] ?? {};

  // Merge: target locale overrides fallback
  const merged: Record<string, unknown> = {};

  // First, apply all fallback namespaces
  for (const [ns, modules] of Object.entries(fallback)) {
    merged[ns] = { ...(modules as Record<string, unknown>) };
  }

  // Then overlay target locale
  for (const [ns, modules] of Object.entries(target)) {
    if (merged[ns]) {
      merged[ns] = {
        ...(merged[ns] as Record<string, unknown>),
        ...(modules as Record<string, unknown>),
      };
    } else {
      merged[ns] = { ...(modules as Record<string, unknown>) };
    }
  }

  return merged;
}
