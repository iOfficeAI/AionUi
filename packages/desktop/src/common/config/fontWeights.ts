/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-region configurable font weights. Shared by main + renderer (no DOM).
 *
 * Mirrors the font-family mechanism in `./fontFamilies`: each region maps to a
 * CSS custom property that `applyFontWeights` writes onto the document root,
 * plus a persisted config key under `ui.fontWeight.*`. An empty value means "no
 * override — inherit the surrounding weight": the property is removed so the
 * CSS fallback declared in arco-override.css / markdown.css takes over, keeping
 * default rendering byte-for-byte identical to before this feature.
 *
 * Unlike font families, weights are a small fixed set of standard tiers
 * (`FONT_WEIGHT_TIERS`) rather than the machine's installed faces, so there is
 * nothing to enumerate and `sanitizeFontWeight` accepts only those tiers.
 */
export type FontWeightKey = 'app' | 'chat' | 'markdown' | 'code';

export type FontWeightSpec = {
  /** CSS custom property this region drives. */
  cssVar: string;
};

/**
 * `code` drives a dedicated `--code-font-weight`; arco-override.css defines
 * `--font-mono-weight: var(--code-font-weight, inherit)`, mirroring `--font-mono`.
 * Every `var(--font-mono)` call site declares `var(--font-mono-weight)` next to
 * it, so the code-region weight follows the selection with no per-site value.
 */
export const FONT_WEIGHT_SPECS: Record<FontWeightKey, FontWeightSpec> = {
  app: { cssVar: '--app-font-weight' },
  chat: { cssVar: '--chat-font-weight' },
  markdown: { cssVar: '--md-font-weight' },
  code: { cssVar: '--code-font-weight' },
};

export const FONT_WEIGHT_KEYS: FontWeightKey[] = ['app', 'chat', 'markdown', 'code'];

/** Sentinel meaning "no override — inherit the surrounding weight". */
export const SYSTEM_FONT_WEIGHT = '';

/**
 * Standard weight tiers offered in the picker. `value` is a numeric CSS
 * `font-weight` keyword; `labelKey` is the i18n key for the tier's display name.
 * Kept intentionally small and font-agnostic (not derived from the chosen font's
 * installed faces) so the same options apply to every region.
 */
export type FontWeightTier = { value: string; labelKey: string };

export const FONT_WEIGHT_TIERS: FontWeightTier[] = [
  { value: '300', labelKey: 'settings.fontWeightLight' },
  { value: '400', labelKey: 'settings.fontWeightRegular' },
  { value: '500', labelKey: 'settings.fontWeightMedium' },
  { value: '600', labelKey: 'settings.fontWeightSemibold' },
  { value: '700', labelKey: 'settings.fontWeightBold' },
];

const VALID_FONT_WEIGHTS: ReadonlySet<string> = new Set(FONT_WEIGHT_TIERS.map((tier) => tier.value));

export type FontWeights = Record<FontWeightKey, string>;

/** Map a region to its persisted config key, e.g. 'chat' -> 'ui.fontWeight.chat'. */
export const fontWeightConfigKey = (key: FontWeightKey) => `ui.fontWeight.${key}` as const;

export const defaultFontWeights = (): FontWeights => ({
  app: SYSTEM_FONT_WEIGHT,
  chat: SYSTEM_FONT_WEIGHT,
  markdown: SYSTEM_FONT_WEIGHT,
  code: SYSTEM_FONT_WEIGHT,
});

/**
 * Normalize a persisted/selected weight to a known tier. Trims, then accepts the
 * value only if it is one of `FONT_WEIGHT_TIERS`; anything else (including '',
 * legacy or out-of-range values) normalizes to '' — treated as "no override".
 * This also keeps the value safe to write straight into a CSS `font-weight` via
 * `element.style.setProperty`, since only known numeric keywords ever pass.
 */
export const sanitizeFontWeight = (raw: string): string => {
  const trimmed = raw.trim();
  return VALID_FONT_WEIGHTS.has(trimmed) ? trimmed : SYSTEM_FONT_WEIGHT;
};
