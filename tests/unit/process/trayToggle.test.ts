/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { shouldShowFromTray, shouldShowMainWindowOnReady } from '@/process/utils/tray';

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

describe('shouldShowMainWindowOnReady', () => {
  it('shows the initial hidden window', () => {
    expect(shouldShowMainWindowOnReady(false, false)).toBe(true);
  });

  it('does not restore a window minimized by the user', () => {
    expect(shouldShowMainWindowOnReady(false, true)).toBe(false);
  });

  it('does not show an already visible window', () => {
    expect(shouldShowMainWindowOnReady(true, false)).toBe(false);
  });
});
