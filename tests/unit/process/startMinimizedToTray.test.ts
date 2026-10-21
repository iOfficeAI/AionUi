/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { shouldShowMainWindowOnReady } from '../../../packages/desktop/src/process/utils/shouldShowMainWindowOnReady';

describe('shouldShowMainWindowOnReady', () => {
  it('always shows when close-to-tray is disabled', () => {
    expect(
      shouldShowMainWindowOnReady({
        closeToTray: false,
        startMinimized: true,
        launchedAtLogin: true,
      })
    ).toBe(true);
  });

  it('hides when launched at login with close-to-tray enabled', () => {
    expect(
      shouldShowMainWindowOnReady({
        closeToTray: true,
        startMinimized: false,
        launchedAtLogin: true,
      })
    ).toBe(false);
  });

  it('hides when start-minimized and close-to-tray are both enabled', () => {
    expect(
      shouldShowMainWindowOnReady({
        closeToTray: true,
        startMinimized: true,
        launchedAtLogin: false,
      })
    ).toBe(false);
  });

  it('shows on a normal cold start when start-minimized is off', () => {
    expect(
      shouldShowMainWindowOnReady({
        closeToTray: true,
        startMinimized: false,
        launchedAtLogin: false,
      })
    ).toBe(true);
  });
});
