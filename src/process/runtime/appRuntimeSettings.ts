/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Runtime settings shared between main entry (src/index.ts)
// and IPC bridges (src/process/bridge/*).

let closeToTray = true;

export const getCloseToTray = (): boolean => closeToTray;
export const setCloseToTray = (value: boolean): void => {
  closeToTray = value;
};
