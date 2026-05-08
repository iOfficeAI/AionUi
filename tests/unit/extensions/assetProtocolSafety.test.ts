/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAllowedAssetPath } from '../../../src/process/extensions/sandbox/assetProtocolSafety';

describe('extensions/assetProtocolSafety', () => {
  let tempDir: string;
  let allowedRoot: string;
  let siblingRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-asset-safety-'));
    allowedRoot = path.join(tempDir, 'allowed');
    siblingRoot = path.join(tempDir, 'allowed-sibling');
    fs.mkdirSync(allowedRoot);
    fs.mkdirSync(siblingRoot);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('allows assets inside an approved root', () => {
    const assetPath = path.join(allowedRoot, 'icons', 'logo.svg');

    expect(isAllowedAssetPath(assetPath, [allowedRoot])).toBe(true);
  });

  it('rejects sibling-prefix paths outside approved roots', () => {
    const assetPath = path.join(siblingRoot, 'logo.svg');

    expect(isAllowedAssetPath(assetPath, [allowedRoot])).toBe(false);
  });

  it('rejects paths when no approved roots are configured', () => {
    expect(isAllowedAssetPath(path.join(allowedRoot, 'logo.svg'), [])).toBe(false);
  });
});
