/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Check whether `targetPath` is safely contained within `baseDir`.
 *
 * A naive `targetPath.startsWith(baseDir)` check is vulnerable to prefix
 * attacks — e.g. baseDir="/home/ext" would match "/home/ext-evil/payload".
 * This helper appends a trailing path separator to the normalised base
 * directory before comparing, ensuring a strict directory boundary.
 */
export function isPathWithinDirectory(targetPath: string, baseDir: string): boolean {
  const normalizedTarget = resolvePathForContainment(targetPath);
  const normalizedBase = resolvePathForContainment(baseDir);

  // Exact match (targetPath IS the base directory itself)
  if (normalizedTarget === normalizedBase) return true;

  // Ensure the base ends with a separator so we don't match prefixes
  const baseDirWithSep = normalizedBase.endsWith(path.sep) ? normalizedBase : normalizedBase + path.sep;

  return normalizedTarget.startsWith(baseDirWithSep);
}

function resolvePathForContainment(inputPath: string): string {
  const resolvedPath = path.resolve(inputPath);
  const { existingPath, missingSegments } = splitExistingAncestor(resolvedPath);

  if (!existingPath) {
    return resolvedPath;
  }

  const canonicalExistingPath = fs.realpathSync.native(existingPath);
  if (missingSegments.length === 0) {
    return canonicalExistingPath;
  }

  return path.join(canonicalExistingPath, ...missingSegments);
}

function splitExistingAncestor(inputPath: string): { existingPath: string | null; missingSegments: string[] } {
  let currentPath = inputPath;
  const missingSegments: string[] = [];

  while (!fs.existsSync(currentPath)) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return { existingPath: null, missingSegments };
    }
    missingSegments.unshift(path.basename(currentPath));
    currentPath = parentPath;
  }

  return { existingPath: currentPath, missingSegments };
}
