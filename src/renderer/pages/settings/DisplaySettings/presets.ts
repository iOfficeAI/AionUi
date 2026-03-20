/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICssTheme } from '@/common/config/storage.ts';

import {
  defaultThemeCover,
  misakaMikotoCover,
  helloKittyCover,
  retroWindowsCover,
  y2kJpCover,
  retromaObsidianBookCover,
} from './themeCovers.ts';

// Theme CSS loaded as raw strings via Vite ?raw imports
import defaultCss from './presets/default.css?raw';
import misakaMikotoCss from './presets/misaka-mikoto.css?raw';
import helloKittyCss from './presets/hello-kitty.css?raw';
import retroWindowsCss from './presets/retro-windows.css?raw';
import retromaY2kCss from './presets/retroma-y2k.css?raw';
import retromaObsidianBookCss from './presets/retroma-obsidian-book.css?raw';
import discourseHorizonCss from './presets/discourse-horizon.css?raw';
import glitteringInputFieldCss from './presets/glittering-input-field.css?raw';

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
    name: 'Default',
    isPreset: true,
    cover: defaultThemeCover,
    css: defaultCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'misaka-mikoto-theme',
    name: 'Misaka Mikoto Theme',
    isPreset: true,
    cover: misakaMikotoCover,
    css: misakaMikotoCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'hello-kitty',
    name: 'Hello Kitty',
    isPreset: true,
    cover: helloKittyCover,
    css: helloKittyCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'retro-windows',
    name: 'Retro Windows',
    isPreset: true,
    cover: retroWindowsCover,
    css: retroWindowsCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'retroma-y2k-jp-v42-pure',
    name: 'Y2K电子账本 by 椰树女王',
    isPreset: true,
    cover: y2kJpCover,
    css: retromaY2kCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'retroma-obsidian-book',
    name: 'Retroma Obsidian Book',
    isPreset: true,
    cover: retromaObsidianBookCover,
    css: retromaObsidianBookCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'discourse-horizon',
    name: 'Discourse Horizon',
    isPreset: true,
    css: discourseHorizonCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'glittering-input-field',
    name: 'Glittering Input Field',
    isPreset: true,
    css: glitteringInputFieldCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];
