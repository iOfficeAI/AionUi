/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from '@/common/theme/types';
import { LIGHT_THEME_ID, DARK_THEME_ID } from '@/common/theme/constants';

import {
  defaultThemeCover,
  misakaMikotoCover,
  helloKittyCover,
  retroWindowsCover,
  y2kJpCover,
  retromaObsidianBookCover,
} from '@renderer/pages/settings/AppearanceSettings/themeCovers';

import misakaMikotoCss from '@renderer/pages/settings/AppearanceSettings/presets/misaka-mikoto.css?raw';
import helloKittyCss from '@renderer/pages/settings/AppearanceSettings/presets/hello-kitty.css?raw';
import retroWindowsCss from '@renderer/pages/settings/AppearanceSettings/presets/retro-windows.css?raw';
import retromaY2kCss from '@renderer/pages/settings/AppearanceSettings/presets/retroma-y2k.css?raw';
import retromaObsidianBookCss from '@renderer/pages/settings/AppearanceSettings/presets/retroma-obsidian-book.css?raw';
import discourseHorizonCss from '@renderer/pages/settings/AppearanceSettings/presets/discourse-horizon.css?raw';
import glitteringInputFieldCss from '@renderer/pages/settings/AppearanceSettings/presets/glittering-input-field.css?raw';

const T0 = 0;

const decorative = (id: string, name: string, appearance: Theme['appearance'], css: string, cover?: string): Theme => ({
  id,
  name,
  appearance,
  css,
  cover,
  builtin: true,
  created_at: T0,
  updated_at: T0,
});

export const BUILTIN_THEMES: Theme[] = [
  {
    id: LIGHT_THEME_ID,
    name: 'Light',
    appearance: 'light',
    cover: defaultThemeCover,
    builtin: true,
    created_at: T0,
    updated_at: T0,
  },
  { id: DARK_THEME_ID, name: 'Dark', appearance: 'dark', builtin: true, created_at: T0, updated_at: T0 },
  decorative('misaka-mikoto-theme', 'Misaka Mikoto Theme', 'light', misakaMikotoCss, misakaMikotoCover),
  decorative('hello-kitty', 'Hello Kitty', 'light', helloKittyCss, helloKittyCover),
  decorative('retro-windows', 'Retro Windows', 'light', retroWindowsCss, retroWindowsCover),
  decorative('retroma-y2k-jp-v42-pure', 'Y2K电子账本 by 椰树女王', 'light', retromaY2kCss, y2kJpCover),
  decorative(
    'retroma-obsidian-book',
    'Retroma Obsidian Book',
    'dark',
    retromaObsidianBookCss,
    retromaObsidianBookCover
  ),
  decorative('discourse-horizon', 'Discourse Horizon', 'light', discourseHorizonCss),
  decorative('glittering-input-field', 'Glittering Input Field', 'light', glitteringInputFieldCss),
];

export const BUILTIN_THEME_IDS = new Set(BUILTIN_THEMES.map((t) => t.id));
