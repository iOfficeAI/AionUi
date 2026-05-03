/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moveFileWithRenameFallback } from '@process/webserver/routes/uploadUtils';

describe('moveFileWithRenameFallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves the file with rename when source and target are on the same device', async () => {
    const renameSpy = vi.spyOn(fsPromises, 'rename').mockResolvedValue(undefined);
    const copyFileSpy = vi.spyOn(fsPromises, 'copyFile').mockResolvedValue(undefined);
    const unlinkSpy = vi.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);

    await moveFileWithRenameFallback('/tmp/source.txt', '/tmp/target.txt');

    expect(renameSpy).toHaveBeenCalledWith('/tmp/source.txt', '/tmp/target.txt');
    expect(copyFileSpy).not.toHaveBeenCalled();
    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('falls back to copy and delete when rename fails with EXDEV', async () => {
    const exdevError = Object.assign(new Error('cross-device link not permitted'), {
      code: 'EXDEV',
    });

    const renameSpy = vi.spyOn(fsPromises, 'rename').mockRejectedValue(exdevError);
    const copyFileSpy = vi.spyOn(fsPromises, 'copyFile').mockResolvedValue(undefined);
    const unlinkSpy = vi.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);

    await moveFileWithRenameFallback('/tmp/source.txt', '/home/user/target.txt');

    expect(renameSpy).toHaveBeenCalledWith('/tmp/source.txt', '/home/user/target.txt');
    expect(copyFileSpy).toHaveBeenCalledWith('/tmp/source.txt', '/home/user/target.txt');
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/source.txt');
  });

  it('rethrows non-EXDEV rename errors', async () => {
    const permissionError = Object.assign(new Error('permission denied'), {
      code: 'EACCES',
    });

    vi.spyOn(fsPromises, 'rename').mockRejectedValue(permissionError);
    const copyFileSpy = vi.spyOn(fsPromises, 'copyFile').mockResolvedValue(undefined);
    const unlinkSpy = vi.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);

    await expect(moveFileWithRenameFallback('/tmp/source.txt', '/tmp/target.txt')).rejects.toBe(permissionError);
    expect(copyFileSpy).not.toHaveBeenCalled();
    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('copies the uploaded bytes to the target path in a real filesystem flow', async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'aionui-upload-utils-'));
    const sourcePath = path.join(tempRoot, 'source.txt');
    const targetPath = path.join(tempRoot, 'target.txt');

    await fsPromises.writeFile(sourcePath, 'upload-content');

    const renameSpy = vi.spyOn(fsPromises, 'rename').mockRejectedValue(
      Object.assign(new Error('cross-device link not permitted'), {
        code: 'EXDEV',
      })
    );

    await moveFileWithRenameFallback(sourcePath, targetPath);

    await expect(fsPromises.readFile(targetPath, 'utf8')).resolves.toBe('upload-content');
    await expect(fsPromises.access(sourcePath)).rejects.toBeDefined();

    renameSpy.mockRestore();
    await fsPromises.rm(tempRoot, { recursive: true, force: true });
  });
});
