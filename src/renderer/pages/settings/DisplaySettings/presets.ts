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
    is_preset: true,
    cover: defaultThemeCover,
    css: defaultCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'misaka-mikoto-theme',
    name: 'Misaka Mikoto Theme',
    is_preset: true,
    cover: misakaMikotoCover,
    css: misakaMikotoCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'hello-kitty',
    name: 'Hello Kitty',
    is_preset: true,
    cover: helloKittyCover,
    css: helloKittyCss,
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
    id: 'retroma-y2k-jp-v42-pure',
    name: 'Y2K电子账本 by 椰树女王',
    is_preset: true,
    cover: y2kJpCover,
    css: retromaY2kCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'retroma-obsidian-book',
    name: 'Retroma Obsidian Book',
    is_preset: true,
    cover: retromaObsidianBookCover,
    css: retromaObsidianBookCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'discourse-horizon',
    name: 'Discourse Horizon',
    is_preset: true,
    css: discourseHorizonCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'glittering-input-field',
    name: 'Glittering Input Field',
    is_preset: true,
    css: glitteringInputFieldCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
];
