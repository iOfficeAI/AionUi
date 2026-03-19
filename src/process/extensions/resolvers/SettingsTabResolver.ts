/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { existsSync } from 'fs';
import type { LoadedExtension } from '../types';
import { BUILTIN_SETTINGS_TAB_IDS } from '../types';
import { isPathWithinDirectory } from '../sandbox/pathSafety';
import { toAssetUrl } from '../protocol/assetProtocol';
import { resolveRuntimeEntryPath } from './utils/entryPointResolver';

/**
 * Resolved settings tab contribution — ready to be consumed by the renderer.
 */
export type ResolvedSettingsTab = {
  /** Globally unique ID: `ext-{extensionName}-{tabId}` */
  id: string;
  /** Display name */
  name: string;
  /** Icon URL (aion-asset:// or undefined) */
  icon?: string;
  /** Content URL (aion-asset:// local asset or external https:// URL) */
  entryUrl: string;
  /** Position anchor relative to a built-in or other extension tab */
  position?: { anchor: string; placement: 'before' | 'after' };
  /** Fallback numeric order when multiple tabs share the same anchor+placement */
  order: number;
  /** Source extension name */
  _extensionName: string;
};

/**
 * Resolve `contributes.settingsTabs` from all enabled extensions.
 * - local entryPoint: validate path + convert to aion-asset:// URL
 * - external entryPoint (http/https): validate URL + pass through as-is
 */
export function resolveSettingsTabs(extensions: LoadedExtension[]): ResolvedSettingsTab[] {
  const result: ResolvedSettingsTab[] = [];
  const seenIds = new Set<string>();

  for (const ext of extensions) {
    const tabs = ext.manifest.contributes.settingsTabs;
    if (!tabs) continue;

    const extDir = ext.directory;
    const extName = ext.manifest.name;

    for (const tab of tabs) {
      const globalId = `ext-${extName}-${tab.id}`;

      // Deduplicate across extensions
      if (seenIds.has(globalId)) {
        console.warn(`[Extensions] Duplicate settings tab ID "${globalId}", skipping`);
        continue;
      }

      // Resolve entryPoint
      const isExternalEntry = /^https?:\/\//i.test(tab.entryPoint);
      let entryUrl: string;

      if (isExternalEntry) {
        try {
          const external = new URL(tab.entryPoint);
          if (external.protocol !== 'http:' && external.protocol !== 'https:') {
            console.warn(
              `[Extensions] Unsupported settings tab external protocol: ${tab.entryPoint} (extension: ${extName})`
            );
            continue;
          }
          entryUrl = external.toString();
        } catch {
          console.warn(`[Extensions] Invalid settings tab external URL: ${tab.entryPoint} (extension: ${extName})`);
          continue;
        }
      } else {
        const absEntry = resolveRuntimeEntryPath(extDir, tab.entryPoint);
        if (!absEntry) {
          const rawPath = path.resolve(extDir, tab.entryPoint);
          if (!isPathWithinDirectory(rawPath, extDir)) {
            console.warn(`[Extensions] Settings tab path traversal attempt: ${tab.entryPoint} in ${extName}`);
            continue;
          }
          console.warn(
            `[Extensions] Settings tab entryPoint not found (dist/source): ${tab.entryPoint} (extension: ${extName})`
          );
          continue;
        }
        if (!isPathWithinDirectory(absEntry, extDir)) {
          console.warn(`[Extensions] Settings tab path traversal attempt: ${tab.entryPoint} in ${extName}`);
          continue;
        }
        entryUrl = toAssetUrl(absEntry);
      }

      // Resolve icon path
      let iconUrl: string | undefined;
      if (tab.icon) {
        const absIcon = path.resolve(extDir, tab.icon);
        if (isPathWithinDirectory(absIcon, extDir) && existsSync(absIcon)) {
          iconUrl = toAssetUrl(absIcon);
        } else {
          console.warn(`[Extensions] Settings tab icon not found or invalid: ${tab.icon} in ${extName}`);
        }
      }

      seenIds.add(globalId);
      result.push({
        id: globalId,
        name: tab.name,
        icon: iconUrl,
        entryUrl,
        position: tab.position as { anchor: string; placement: 'before' | 'after' } | undefined,
        order: tab.order,
        _extensionName: extName,
      });
    }
  }

  // Sort by order (ascending), then by name for stability (within the same group)
  result.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  return result;
}

/**
 * Merge extension settings tabs into a built-in tab ID sequence using
 * position anchoring. This utility is used by both the route-based and
 * modal-based settings UIs.
 *
 * @param builtinIds   Ordered list of built-in tab IDs (e.g. ['gemini','model', ...])
 * @param extTabs      Resolved extension tabs (already sorted by order)
 * @returns Merged sequence of { type, id, extTab? } in display order
 */
export type MergedTab =
  | { type: 'builtin'; id: string }
  | { type: 'extension'; id: string; extTab: ResolvedSettingsTab };

export function mergeSettingsTabs(builtinIds: readonly string[], extTabs: ResolvedSettingsTab[]): MergedTab[] {
  // Build initial sequence from built-in IDs
  const result: MergedTab[] = builtinIds.map((id) => ({ type: 'builtin' as const, id }));

  // Group extension tabs by anchor+placement
  const beforeMap = new Map<string, ResolvedSettingsTab[]>();
  const afterMap = new Map<string, ResolvedSettingsTab[]>();
  const unanchored: ResolvedSettingsTab[] = [];

  for (const tab of extTabs) {
    if (!tab.position) {
      unanchored.push(tab);
      continue;
    }
    const { anchor, placement } = tab.position;
    const map = placement === 'before' ? beforeMap : afterMap;
    let list = map.get(anchor);
    if (!list) {
      list = [];
      map.set(anchor, list);
    }
    list.push(tab);
  }

  // Insert anchored tabs — iterate in reverse so insertions don't shift indices
  for (let i = result.length - 1; i >= 0; i--) {
    const builtinId = result[i].id;

    const afters = afterMap.get(builtinId);
    if (afters) {
      // Insert right after the anchor (in order)
      const merged = afters.map((t) => ({ type: 'extension' as const, id: t.id, extTab: t }));
      result.splice(i + 1, 0, ...merged);
    }

    const befores = beforeMap.get(builtinId);
    if (befores) {
      // Insert right before the anchor (in order)
      const merged = befores.map((t) => ({ type: 'extension' as const, id: t.id, extTab: t }));
      result.splice(i, 0, ...merged);
    }
  }

  // Also support anchoring to extension tab IDs (for inter-extension ordering)
  // Re-scan for any anchors that target extension tabs already inserted
  for (const [anchor, tabs] of afterMap) {
    if (builtinIds.includes(anchor)) continue; // already handled
    const idx = result.findIndex((t) => t.id === anchor || t.id === `ext-${anchor}`);
    if (idx >= 0) {
      const merged = tabs.map((t) => ({ type: 'extension' as const, id: t.id, extTab: t }));
      result.splice(idx + 1, 0, ...merged);
    }
  }
  for (const [anchor, tabs] of beforeMap) {
    if (builtinIds.includes(anchor)) continue;
    const idx = result.findIndex((t) => t.id === anchor || t.id === `ext-${anchor}`);
    if (idx >= 0) {
      const merged = tabs.map((t) => ({ type: 'extension' as const, id: t.id, extTab: t }));
      result.splice(idx, 0, ...merged);
    }
  }

  // Append unanchored tabs before "system" (default position)
  if (unanchored.length > 0) {
    const systemIdx = result.findIndex((t) => t.id === 'system');
    const insertIdx = systemIdx >= 0 ? systemIdx : result.length;
    const merged = unanchored.map((t) => ({ type: 'extension' as const, id: t.id, extTab: t }));
    result.splice(insertIdx, 0, ...merged);
  }

  return result;
}
