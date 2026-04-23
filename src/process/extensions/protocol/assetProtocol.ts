/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

/**
 * Custom protocol for serving local extension assets.
 *
 * URL format: aion-asset://asset/{extensionName}/{relativePathWithinExtension}
 * - `standard: true` so the URL parser correctly separates host and pathname.
 * - Fixed hostname "asset" keeps the URL shape predictable cross-platform.
 * - relPath is always POSIX (forward slashes) and URL-encoded.
 *
 * Consumers (Electron protocol handler, WebUI /api/ext-asset, renderer platform.ts)
 * resolve the extension directory via ExtensionRegistry, not from the URL itself.
 */
export const AION_ASSET_PROTOCOL = 'aion-asset';
export const AION_ASSET_HOST = 'asset';

const URL_PREFIX = `${AION_ASSET_PROTOCOL}://${AION_ASSET_HOST}/`;

/** Must match ExtensionMetaSchema.name (kebab-case). */
const EXT_NAME_RE = /^[a-z0-9-]+$/;

/**
 * Validate a relative-path ref: must be POSIX-style, no leading slash, no `..`.
 * Returns the posix-normalized form.
 */
function normalizeAssetRelPath(relPath: string): string {
  const posix = relPath.split(path.sep).join('/');
  const normalized = path.posix.normalize(posix);
  if (
    normalized === '' ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('/') ||
    normalized.startsWith('../') ||
    normalized.includes('\0')
  ) {
    throw new Error(`[aion-asset] Invalid asset rel path: ${JSON.stringify(relPath)}`);
  }
  return normalized;
}

function assertValidExtName(extName: string): void {
  if (!EXT_NAME_RE.test(extName)) {
    throw new Error(`[aion-asset] Invalid extension name: ${JSON.stringify(extName)}`);
  }
}

/**
 * Build an aion-asset:// URL for an extension-relative resource.
 * Callers are expected to register the resource with ExtensionRegistry.registerAsset().
 */
export function toAssetUrl(extName: string, relPath: string): string {
  assertValidExtName(extName);
  const normalized = normalizeAssetRelPath(relPath);
  const encodedSegments = normalized
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${URL_PREFIX}${extName}/${encodedSegments}`;
}

export type ParsedAssetUrl = {
  extName: string;
  /** POSIX-normalized relative path within the extension directory. */
  relPath: string;
};

/**
 * Parse an aion-asset:// URL back into (extName, relPath).
 * Returns null if the URL is malformed or contains forbidden segments.
 */
export function parseAssetUrl(url: string): ParsedAssetUrl | null {
  if (typeof url !== 'string' || !url.startsWith(URL_PREFIX)) return null;
  const rest = url.slice(URL_PREFIX.length);
  const firstSlash = rest.indexOf('/');
  if (firstSlash <= 0) return null;

  let extName: string;
  let rawRel: string;
  try {
    extName = decodeURIComponent(rest.slice(0, firstSlash));
    rawRel = decodeURIComponent(rest.slice(firstSlash + 1));
  } catch {
    return null;
  }

  if (!EXT_NAME_RE.test(extName)) return null;

  let relPath: string;
  try {
    relPath = normalizeAssetRelPath(rawRel);
  } catch {
    return null;
  }
  return { extName, relPath };
}

export { normalizeAssetRelPath };
