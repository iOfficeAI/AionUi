/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/**
 * Compute a SHA-1 hash over IDENTITY.md and SOUL.md in the given workspace.
 * Returns null when no identity files are found or workspace is not provided.
 */
export const computeOpenClawIdentityHash = async (workspace?: string): Promise<string | null> => {
  if (!workspace) return null;
  const files = ['IDENTITY.md', 'SOUL.md'];
  const chunks: string[] = [];
  for (const name of files) {
    const filePath = path.join(workspace, name);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      chunks.push(`${name}\n${content}`);
    } catch {
      // missing file is acceptable
    }
  }
  if (chunks.length === 0) return null;
  return crypto.createHash('sha1').update(chunks.join('\n---\n')).digest('hex');
};
