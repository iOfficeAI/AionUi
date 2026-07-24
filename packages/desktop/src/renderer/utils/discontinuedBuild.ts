/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Compile-time product fork flag, injected by electron.vite.config.ts renderer
// `define` as the global `__IS_DISCONTINUED_BUILD__` (same pattern as
// __APP_VERSION__). AionUi's final "discontinued" build sets it to true; every
// other build — including AionPro — leaves it false, so the guide-to-website
// dead branches get tree-shaken away and in-app update behavior is untouched.
declare const __IS_DISCONTINUED_BUILD__: boolean;

export const IS_DISCONTINUED_BUILD: boolean =
  typeof __IS_DISCONTINUED_BUILD__ !== 'undefined' ? __IS_DISCONTINUED_BUILD__ : false;
