/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

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
  const normalizedTarget = path.resolve(targetPath);
  const normalizedBase = path.resolve(baseDir);

  // Exact match (targetPath IS the base directory itself)
  if (normalizedTarget === normalizedBase) return true;

  // Ensure the base ends with a separator so we don't match prefixes
  const baseDirWithSep = normalizedBase.endsWith(path.sep) ? normalizedBase : normalizedBase + path.sep;

  return normalizedTarget.startsWith(baseDirWithSep);
}
