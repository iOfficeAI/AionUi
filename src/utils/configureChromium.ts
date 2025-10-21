/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Configure Chromium command-line flags for WebUI and CLI modes
// This module must be imported BEFORE any Electron modules
// 为 WebUI 和 CLI 模式配置 Chromium 命令行参数
// 此模块必须在任何 Electron 模块之前导入

const isWebUI = process.argv.some((arg) => arg === '--webui' || arg === '-webui');
const isResetPassword = process.argv.includes('reset-password');

// Only configure flags for WebUI and reset-password modes
// 仅为 WebUI 和重置密码模式配置参数
if (isWebUI || isResetPassword) {
  const flags: string[] = [];

  // For Linux without DISPLAY, enable headless mode
  // 对于无显示服务器的 Linux，启用 headless 模式
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    flags.push('--headless', '--disable-gpu', '--disable-software-rasterizer');
  }

  // For root user, disable sandbox to prevent crash
  // 对于 root 用户，禁用沙箱以防止崩溃
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    flags.push('--no-sandbox');
  }

  if (flags.length > 0) {
    process.argv.push(...flags);
  }
}
