/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isPathWithinDirectory } from '../../../src/process/extensions/sandbox/pathSafety';

describe('extensions/pathSafety', () => {
  let tempDir = '';
  let root = '';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionui-path-safety-'));
    root = path.join(tempDir, 'safe-root');
    await fs.mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('目标路径与基础目录一致时应返回 true', () => {
    expect(isPathWithinDirectory(root, root)).toBe(true);
  });

  it('目标路径位于基础目录内部时应返回 true', () => {
    const child = path.join(root, 'nested', 'file.txt');
    expect(isPathWithinDirectory(child, root)).toBe(true);
  });

  it('应防止前缀欺骗路径 (safe-root vs safe-root-evil)', () => {
    const prefixAttackPath = path.resolve('tmp', 'extensions', 'safe-root-evil', 'payload.txt');
    expect(isPathWithinDirectory(prefixAttackPath, root)).toBe(false);
  });

  it('目标路径跳出基础目录时应返回 false', () => {
    const escapedPath = path.resolve(root, '..', 'outside.txt');
    expect(isPathWithinDirectory(escapedPath, root)).toBe(false);
  });

  it('应拒绝通过目录符号链接逃逸基础目录的路径', async () => {
    const outsideDir = path.join(tempDir, 'outside');
    const outsideFile = path.join(outsideDir, 'secret.txt');
    const symlinkDir = path.join(root, 'linked');

    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(outsideFile, 'secret', 'utf-8');
    await fs.symlink(outsideDir, symlinkDir, 'dir');

    expect(isPathWithinDirectory(path.join(symlinkDir, 'secret.txt'), root)).toBe(false);
  });

  it('应允许基础目录内尚不存在的新文件路径', () => {
    const futureFile = path.join(root, 'new-dir', 'new-file.txt');
    expect(isPathWithinDirectory(futureFile, root)).toBe(true);
  });
});
