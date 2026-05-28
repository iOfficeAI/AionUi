/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICssTheme } from '@/common/config/storage.ts';

import { catppuccinCover } from './themeCovers.ts';

// Theme CSS loaded as a raw string via Vite ?raw imports
import catppuccinCss from './presets/catppuccin.css?raw';

/**
 * 默认主题 ID / Default theme ID
 * Catppuccin is the single built-in CSS theme preset. Selecting the "Theme"
 * color scheme makes its variables visible; selecting "Chisl" overrides them
 * with the Chisl color scheme.
 */
export const DEFAULT_THEME_ID = 'catppuccin';

/**
 * 预设 CSS 主题列表 / Preset CSS themes list
 * 这些主题是内置的，用户可以直接选择使用 / These themes are built-in and can be directly used by users
 */
export const PRESET_THEMES: ICssTheme[] = [
  {
    id: DEFAULT_THEME_ID,
    name: 'Catppuccin',
    is_preset: true,
    cover: catppuccinCover,
    css: catppuccinCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
];
