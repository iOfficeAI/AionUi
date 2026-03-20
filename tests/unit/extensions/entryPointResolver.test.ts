/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveRuntimeEntryPath } from '../../../src/process/extensions/resolvers/utils/entryPointResolver';

describe('extensions/entryPointResolver', () => {
  let extensionDir = '';

  beforeEach(async () => {
    extensionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionui-ext-entry-resolver-'));
  });

  afterEach(async () => {
    await fs.rm(extensionDir, { recursive: true, force: true });
  });

  it('优先解析 dist 入口（兼容源码声明）', async () => {
    const srcPath = path.join(extensionDir, 'channels', 'plugin.js');
    const distPath = path.join(extensionDir, 'dist', 'channels', 'plugin.js');

    await fs.mkdir(path.dirname(srcPath), { recursive: true });
    await fs.mkdir(path.dirname(distPath), { recursive: true });
    await fs.writeFile(srcPath, 'module.exports = "src";', 'utf-8');
    await fs.writeFile(distPath, 'module.exports = "dist";', 'utf-8');

    const resolved = resolveRuntimeEntryPath(extensionDir, 'channels/plugin.js');
    expect(resolved).toBe(distPath);
  });

  it('当 dist 不存在时回退到源码入口', async () => {
    const srcPath = path.join(extensionDir, 'channels', 'plugin.js');
    await fs.mkdir(path.dirname(srcPath), { recursive: true });
    await fs.writeFile(srcPath, 'module.exports = "src";', 'utf-8');

    const resolved = resolveRuntimeEntryPath(extensionDir, 'channels/plugin.js');
    expect(resolved).toBe(srcPath);
  });
});
