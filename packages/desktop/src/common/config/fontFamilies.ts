/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-region configurable font families. Shared by main + renderer (no DOM).
 *
 * Mirrors the font-size mechanism in `./fontSizes`: each region maps to a CSS
 * custom property that `applyFontFamilies` writes onto the document root, plus a
 * persisted config key under `ui.fontFamily.*`. An empty value means "no
 * override — use the built-in default stack": the property is removed so the
 * CSS fallback declared in arco-override.css / markdown.css takes over, keeping
 * default rendering byte-for-byte identical to before this feature.
 */
export type FontFamilyKey = 'app' | 'chat' | 'markdown' | 'code';

export type FontFamilySpec = {
  /** CSS custom property this region drives. */
  cssVar: string;
  /**
   * Generic family appended after the chosen font so missing glyphs fall back
   * to a sensible system family (CJK coverage via `sans-serif`, fixed metrics
   * via `monospace`) instead of the browser's last-resort font.
   */
  generic: 'sans-serif' | 'monospace';
};

/**
 * `code` drives a dedicated `--code-font-family`; arco-override.css defines
 * `--font-mono: var(--code-font-family, <mono stack>)`, so every existing
 * `var(--font-mono)` site (markdown code, editors, chat shadow) follows the
 * selection without editing those call sites.
 */
export const FONT_FAMILY_SPECS: Record<FontFamilyKey, FontFamilySpec> = {
  app: { cssVar: '--app-font-family', generic: 'sans-serif' },
  chat: { cssVar: '--chat-font-family', generic: 'sans-serif' },
  markdown: { cssVar: '--md-font-family', generic: 'sans-serif' },
  code: { cssVar: '--code-font-family', generic: 'monospace' },
};

export const FONT_FAMILY_KEYS: FontFamilyKey[] = ['app', 'chat', 'markdown', 'code'];

/** Sentinel meaning "no override — use the built-in default stack". */
export const SYSTEM_FONT_FAMILY = '';

export type FontFamilies = Record<FontFamilyKey, string>;

/** Map a region to its persisted config key, e.g. 'chat' -> 'ui.fontFamily.chat'. */
export const fontFamilyConfigKey = (key: FontFamilyKey) => `ui.fontFamily.${key}` as const;

export const defaultFontFamilies = (): FontFamilies => ({
  app: SYSTEM_FONT_FAMILY,
  chat: SYSTEM_FONT_FAMILY,
  markdown: SYSTEM_FONT_FAMILY,
  code: SYSTEM_FONT_FAMILY,
});

/**
 * Normalize a persisted/selected family name. Values reach the DOM via
 * `element.style.setProperty`, double-quoted by `cssFontFamilyValue`; stripping
 * line breaks and trimming keeps a single family token from breaking the CSS
 * string. An all-whitespace name normalizes to '' (treated as "no override").
 */
export const sanitizeFontFamily = (raw: string): string => raw.replace(/[\r\n]+/g, ' ').trim();

/**
 * Build a CSS `font-family` value for a chosen family: the quoted family name
 * followed by the region's generic fallback (e.g. `"Fira Code", monospace`).
 * Returns '' for an empty/whitespace selection so callers remove the property
 * instead of writing an invalid value. Double quotes and backslashes in the
 * name are escaped so the result cannot escape the CSS string context.
 */
export const cssFontFamilyValue = (key: FontFamilyKey, rawFamily: string): string => {
  const family = sanitizeFontFamily(rawFamily);
  if (!family) return '';
  const quoted = `"${family.replace(/["\\]/g, '\\$&')}"`;
  return `${quoted}, ${FONT_FAMILY_SPECS[key].generic}`;
};
