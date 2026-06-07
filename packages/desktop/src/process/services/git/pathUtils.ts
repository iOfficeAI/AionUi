/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Path helpers shared by the Git service. Kept pure (no IO) so they can be
 * unit-tested in isolation.
 */

import path from 'node:path';

/**
 * Normalize a path to POSIX separators. The renderer always consumes
 * forward-slash paths (it has no concept of a Windows separator).
 */
export function toPosix(input: string): string {
  return input.replace(/\\/g, '/');
}

/**
 * Join a POSIX-style relative path onto an absolute root, returning an
 * absolute path in the host's native separator form. Used to compute
 * `GitFileChange.path` from a repo-relative POSIX string.
 */
export function joinAbs(root: string, posixRel: string): string {
  return path.resolve(root, ...posixRel.split('/').filter(Boolean));
}

/**
 * Normalize a user-supplied file path to an absolute path resolved against
 * the repo root. The input may be either repo-relative (POSIX or native) or
 * absolute.
 */
export function resolveAgainstRoot(root: string, filePath: string): string {
  if (path.isAbsolute(filePath)) return path.normalize(filePath);
  return path.resolve(root, ...toPosix(filePath).split('/').filter(Boolean));
}
