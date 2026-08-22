/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { FONT_WEIGHT_KEYS, FONT_WEIGHT_SPECS, sanitizeFontWeight, type FontWeights } from '@/common/config/fontWeights';

/**
 * Write font weights to the root element's CSS variables. Custom properties
 * cross into Markdown shadow roots (via ShadowView's variable injection) and are
 * inherited everywhere else, so a single write on the root drives all regions.
 *
 * An empty / unknown selection removes the property instead of writing a value,
 * letting the built-in fallback declared in the stylesheet take over — keeping
 * default rendering byte-for-byte identical to before a weight was ever chosen.
 */
export function applyFontWeights(weights: FontWeights, root: Document = document): void {
  for (const key of FONT_WEIGHT_KEYS) {
    const { cssVar } = FONT_WEIGHT_SPECS[key];
    const value = sanitizeFontWeight(weights[key]);
    if (value) {
      root.documentElement.style.setProperty(cssVar, value);
    } else {
      root.documentElement.style.removeProperty(cssVar);
    }
  }
}
