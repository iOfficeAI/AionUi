/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Vite dev server host — kept local because the WebUI server reverse-proxies
 * requests and WebSocket upgrades to it in development mode.
 */
export const VITE_DEV_HOST = 'localhost';

/**
 * Vite dev server port — read from ELECTRON_RENDERER_URL when available
 * (electron-vite sets it to the actual port), fallback to 5173.
 */
export const VITE_DEV_PORT = (() => {
  const url = process.env['ELECTRON_RENDERER_URL'];
  if (url) {
    try {
      return Number(new URL(url).port) || 5173;
    } catch {
      // ignore parse errors
    }
  }
  return 5173;
})();
