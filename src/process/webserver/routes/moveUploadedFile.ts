/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fsPromises from 'fs/promises';

type ErrorWithCode = Error & { code?: unknown };

function getErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('code' in error)) {
    return undefined;
  }

  const code = (error as ErrorWithCode).code;
  return typeof code === 'string' ? code : undefined;
}

export async function moveUploadedFile(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await fsPromises.rename(sourcePath, targetPath);
    return;
  } catch (error) {
    if (getErrorCode(error) !== 'EXDEV') {
      throw error;
    }
  }

  await fsPromises.copyFile(sourcePath, targetPath);
  await fsPromises.unlink(sourcePath);
}
