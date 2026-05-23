/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

const normalizeDisplayedPath = (path: string): string => {
  if (path === '.aionrs') return '.pounding';
  if (path.endsWith('/.aionrs')) return `${path.slice(0, -'.aionrs'.length)}.pounding`;
  return path;
};

describe('normalizeDisplayedPath', () => {
  it('shows .pounding instead of .aionrs', () => {
    expect(normalizeDisplayedPath('.aionrs')).toBe('.pounding');
    expect(normalizeDisplayedPath('/Users/halo/.aionrs')).toBe('/Users/halo/.pounding');
  });
});
