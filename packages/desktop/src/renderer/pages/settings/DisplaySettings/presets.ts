/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICssTheme } from '@/common/config/storage.ts';

import {
  defaultThemeCover,
  retroWindowsCover,
  catppuccinCover,
  draculaCover,
  nordCover,
  tokyoNightCover,
  rosePineCover,
  solarizedCover,
} from './themeCovers.ts';

// Theme CSS loaded as raw strings via Vite ?raw imports
import defaultCss from './presets/default.css?raw';
import retroWindowsCss from './presets/retro-windows.css?raw';
import catppuccinCss from './presets/catppuccin.css?raw';
import draculaCss from './presets/dracula.css?raw';
import nordCss from './presets/nord.css?raw';
import tokyoNightCss from './presets/tokyo-night.css?raw';
import rosePineCss from './presets/rose-pine.css?raw';
import solarizedCss from './presets/solarized.css?raw';

/**
 * 默认主题 ID / Default theme ID
 * 用于标识默认主题（无自定义 CSS）/ Used to identify the default theme (no custom CSS)
 */
export const DEFAULT_THEME_ID = 'default-theme';

/**
 * 预设 CSS 主题列表 / Preset CSS themes list
 * 这些主题是内置的，用户可以直接选择使用 / These themes are built-in and can be directly used by users
 */
export const PRESET_THEMES: ICssTheme[] = [
  {
    id: DEFAULT_THEME_ID,
    name: 'Gruvbox',
    is_preset: true,
    cover: defaultThemeCover,
    css: defaultCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'retro-windows',
    name: 'Retro Windows',
    is_preset: true,
    cover: retroWindowsCover,
    css: retroWindowsCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    is_preset: true,
    cover: catppuccinCover,
    css: catppuccinCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'dracula',
    name: 'Dracula',
    is_preset: true,
    cover: draculaCover,
    css: draculaCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'nord',
    name: 'Nord',
    is_preset: true,
    cover: nordCover,
    css: nordCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    is_preset: true,
    cover: tokyoNightCover,
    css: tokyoNightCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    is_preset: true,
    cover: rosePineCover,
    css: rosePineCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'solarized',
    name: 'Solarized',
    is_preset: true,
    cover: solarizedCover,
    css: solarizedCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
];
