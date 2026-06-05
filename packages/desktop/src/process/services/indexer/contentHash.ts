/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';

export const CONTENT_HASH_ALGORITHM = 'sha256';

/**
 * Computes a stable hex digest for file contents.
 */
export function hashFileContent(buffer: Buffer): string {
  return createHash(CONTENT_HASH_ALGORITHM).update(buffer).digest('hex');
}

/**
 * Reads a file and returns its content hash, or null when unreadable.
 */
export async function computeFileContentHash(absolutePath: string): Promise<string | null> {
  try {
    const data = await readFile(absolutePath);
    return hashFileContent(data);
  } catch {
    return null;
  }
}
