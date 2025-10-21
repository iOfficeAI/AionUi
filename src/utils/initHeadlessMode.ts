/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Headless mode initialization utility
 */

import { app } from 'electron';

/**
 * Initialize headless mode for Linux environments without DISPLAY
 * Must be called before accessing app properties
 * 在无桌面 Linux 环境下初始化 headless 模式
 */
export function initHeadlessMode(): void {
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    const hasWebUI = process.argv.some((arg) => arg === '--webui' || arg === '-webui');
    const hasResetPassword = process.argv.includes('reset-password');

    if (hasWebUI || hasResetPassword) {
      app.commandLine.appendSwitch('headless');
      app.commandLine.appendSwitch('disable-gpu');
      app.commandLine.appendSwitch('disable-software-rasterizer');
      app.commandLine.appendSwitch('no-sandbox');
      app.disableHardwareAcceleration();
    }
  }
}
