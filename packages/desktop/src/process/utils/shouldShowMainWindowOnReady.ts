/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure launch-policy helper: whether the main window should show on first ready.
 *
 * Rules (in order):
 * 1. Without Close-to-Tray, always show (tray-only launch would look like a crash).
 * 2. Login-at-startup + Close-to-Tray → stay in tray (existing behavior).
 * 3. Optional "Start minimized to tray" + Close-to-Tray → stay in tray on cold start.
 * 4. Otherwise show the main window.
 */
export function shouldShowMainWindowOnReady(options: {
  closeToTray: boolean;
  startMinimized: boolean;
  launchedAtLogin: boolean;
}): boolean {
  const { closeToTray, startMinimized, launchedAtLogin } = options;
  if (!closeToTray) {
    return true;
  }
  if (launchedAtLogin) {
    return false;
  }
  if (startMinimized) {
    return false;
  }
  return true;
}
