/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { normalizeDisplayedPath } from '@/renderer/components/settings/DirectorySelectionModal';

describe('normalizeDisplayedPath', () => {
  it('shows .pounding instead of .aionrs', () => {
    expect(normalizeDisplayedPath('.aionrs')).toBe('.pounding');
    expect(normalizeDisplayedPath('/Users/halo/.aionrs')).toBe('/Users/halo/.pounding');
  });
});
