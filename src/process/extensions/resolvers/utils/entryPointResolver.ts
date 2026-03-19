/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { existsSync } from 'fs';
import { isPathWithinDirectory } from '../../sandbox/pathSafety';

function normalizeRelativePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function toDistCandidate(entryPoint: string): string {
  const normalized = normalizeRelativePath(entryPoint);
  if (normalized.startsWith('dist/')) return normalized;
  const withoutSrc = normalized.startsWith('src/') ? normalized.slice(4) : normalized;
  return `dist/${withoutSrc}`;
}

function withCompiledExtension(relPath: string): string {
  return relPath
    .replace(/\.tsx$/i, '.js')
    .replace(/\.ts$/i, '.js')
    .replace(/\.mts$/i, '.mjs')
    .replace(/\.cts$/i, '.cjs');
}

/**
 * Resolve extension runtime entry file with dist-first fallback.
 * Order:
 * 1) dist candidate (compiled extension)
 * 2) declared entryPoint (legacy source-mode compatibility)
 */
export function resolveRuntimeEntryPath(extensionDir: string, entryPoint: string): string | null {
  const declaredRel = normalizeRelativePath(entryPoint);
  const distRel = toDistCandidate(entryPoint);
  const candidates = [withCompiledExtension(distRel), withCompiledExtension(declaredRel), distRel, declaredRel];
  const seen = new Set<string>();

  for (const rel of candidates) {
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    const absPath = path.resolve(extensionDir, rel);
    if (!isPathWithinDirectory(absPath, extensionDir)) continue;
    if (!existsSync(absPath)) continue;
    return absPath;
  }

  return null;
}
