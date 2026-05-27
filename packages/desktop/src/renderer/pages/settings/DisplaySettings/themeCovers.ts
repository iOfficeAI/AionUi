/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Preset theme cover images — Vite resolves these to hashed asset URLs at build time.
// Previously these were inline base64 strings (~700 KB), now they are normal static imports.
import defaultThemeCover from '@renderer/assets/themes/gruvbox.svg';
import retroWindowsCover from '@renderer/assets/themes/retro-windows.png';

export {
  defaultThemeCover,
  retroWindowsCover,
};
