/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { shouldShowFromTray } from '@/process/utils/tray';

describe('shouldShowFromTray', () => {
  it('shows when window is not visible', () => {
    expect(shouldShowFromTray(false, false)).toBe(true);
  });

  it('shows when window is minimized', () => {
    expect(shouldShowFromTray(true, true)).toBe(true);
  });

  it('hides when window is visible and not minimized', () => {
    expect(shouldShowFromTray(true, false)).toBe(false);
  });
});
