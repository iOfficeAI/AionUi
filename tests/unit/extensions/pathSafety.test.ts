/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { describe, expect, it } from 'vitest';
import { isPathWithinDirectory } from '../../../src/process/extensions/sandbox/pathSafety';

describe('extensions/pathSafety', () => {
  const root = path.resolve('tmp', 'extensions', 'safe-root');

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
});
