/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ExtensionRegistry } from '../ExtensionRegistry';
import { normalizeAssetRelPath } from './assetProtocol';

export type AssetResolutionError = 'unknown-extension' | 'invalid-path' | 'not-allowed' | 'not-found' | 'escape';

export type AssetResolutionResult =
  | { ok: true; absPath: string; error?: never }
  | { ok: false; absPath?: never; error: AssetResolutionError };

/**
 * Resolve an extension-relative asset reference to a concrete on-disk path,
 * shared by the Electron aion-asset:// handler and the WebUI /api/ext-asset route.
 *
 * Security layers (in order):
 * 0. Normalize ext.directory to absolute.
 * 1. POSIX-normalize relPath, reject null bytes, `..`, leading `/`.
 * 2. Whitelist check: registry.isAssetAllowed(extName, relPath) — only resources
 *    produced by resolvers (icons, logos, covers, themeCover, settings entry/icon,
 *    assistant icons, model provider logos, channel plugin icons) are accessible.
 * 3. path.join + path.relative prefix check — defends against lookup-table bugs
 *    that might register a traversing path.
 * 4. fs.realpath on both ext.directory and the candidate — defends against symlink
 *    escape inside the extension directory.
 */
export async function safeResolveExtensionAsset(extName: string, rawRelPath: string): Promise<AssetResolutionResult> {
  const registry = ExtensionRegistry.getInstance();
  const ext = registry.getExtension(extName);
  if (!ext) return { ok: false, error: 'unknown-extension' };

  let normalized: string;
  try {
    normalized = normalizeAssetRelPath(rawRelPath);
  } catch {
    return { ok: false, error: 'invalid-path' };
  }

  if (!registry.isAssetAllowed(extName, normalized)) {
    return { ok: false, error: 'not-allowed' };
  }

  const absExtDir = path.resolve(ext.directory);
  const candidate = path.join(absExtDir, normalized);
  const rel = path.relative(absExtDir, candidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'escape' };
  }

  let realExt: string;
  let realTarget: string;
  try {
    realExt = await fs.realpath(absExtDir);
    realTarget = await fs.realpath(candidate);
  } catch {
    return { ok: false, error: 'not-found' };
  }
  const realRel = path.relative(realExt, realTarget);
  if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
    return { ok: false, error: 'escape' };
  }

  return { ok: true, absPath: realTarget };
}
