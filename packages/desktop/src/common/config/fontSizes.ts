/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Per-region configurable font sizes (px). Shared by main + renderer (no DOM). */
export type FontSizeKey = 'chat' | 'markdown' | 'code';

export type FontSizeSpec = { default: number; min: number; max: number; cssVar: string };

export const FONT_SIZE_SPECS: Record<FontSizeKey, FontSizeSpec> = {
  chat: { default: 14, min: 12, max: 22, cssVar: '--chat-font-size' },
  markdown: { default: 13, min: 12, max: 22, cssVar: '--md-font-size' },
  code: { default: 12, min: 10, max: 18, cssVar: '--code-font-size' },
};

export const FONT_SIZE_KEYS: FontSizeKey[] = ['chat', 'markdown', 'code'];

export const FONT_SIZE_STEP = 1;

export type FontSizes = Record<FontSizeKey, number>;

/** Map each FontSizeKey to its persisted config key, e.g. 'chat' -> 'ui.fontSize.chat'. */
export const fontSizeConfigKey = (key: FontSizeKey) => `ui.fontSize.${key}` as const;

export const defaultFontSizes = (): FontSizes => ({
  chat: FONT_SIZE_SPECS.chat.default,
  markdown: FONT_SIZE_SPECS.markdown.default,
  code: FONT_SIZE_SPECS.code.default,
});

/** Clamp to [min,max], round to integer px, fall back to default on non-finite input. */
export const clampFontSize = (key: FontSizeKey, value: number): number => {
  const spec = FONT_SIZE_SPECS[key];
  if (Number.isNaN(value) || typeof value !== 'number') {
    return spec.default;
  }
  const rounded = Math.round(value);
  return Math.min(spec.max, Math.max(spec.min, rounded));
};
