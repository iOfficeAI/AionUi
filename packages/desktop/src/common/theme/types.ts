/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ThemeAppearance = 'light' | 'dark';

/**
 * Unified theme. `appearance` drives data-theme + arco-theme.
 * `css` is the escape hatch (decorative + user themes). `tokens` is an optional
 * forward-looking structured channel applied as :root variables when present.
 */
export type Theme = {
  id: string;
  name: string;
  cover?: string;
  appearance: ThemeAppearance;
  tokens?: Record<string, string>;
  css?: string;
  builtin: boolean;
  created_at: number;
  updated_at: number;
};
