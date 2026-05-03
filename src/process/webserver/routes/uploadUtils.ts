/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fsPromises from 'fs/promises';

/**
 * Move a file to the target path.
 * Falls back to copy + unlink when source and destination are on different devices.
 */
export async function moveFileWithRenameFallback(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await fsPromises.rename(sourcePath, targetPath);
  } catch (error) {
    const errnoError = error as NodeJS.ErrnoException;
    if (errnoError.code !== 'EXDEV') {
      throw error;
    }

    await fsPromises.copyFile(sourcePath, targetPath);
    await fsPromises.unlink(sourcePath);
  }
}
