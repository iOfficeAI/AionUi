/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FONT_FAMILY_KEYS,
  FONT_FAMILY_SPECS,
  cssFontFamilyValue,
  type FontFamilies,
} from '@/common/config/fontFamilies';

/**
 * Write font families to the root element's CSS variables. Custom properties
 * cross into Markdown shadow roots (via ShadowView's variable injection) and are
 * inherited everywhere else, so a single write on the root drives all regions.
 *
 * An empty selection removes the property instead of writing a value, letting the
 * built-in fallback declared in the stylesheet take over — keeping default
 * rendering byte-for-byte identical to before a font was ever chosen.
 */
export function applyFontFamilies(families: FontFamilies, root: Document = document): void {
  for (const key of FONT_FAMILY_KEYS) {
    const { cssVar } = FONT_FAMILY_SPECS[key];
    const value = cssFontFamilyValue(key, families[key]);
    if (value) {
      root.documentElement.style.setProperty(cssVar, value);
    } else {
      root.documentElement.style.removeProperty(cssVar);
    }
  }
}
