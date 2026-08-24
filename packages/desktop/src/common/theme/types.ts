/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ThemeAppearance = 'light' | 'dark';

/** A flat map of CSS custom property name → value (e.g. `{ '--primary': '#165dff' }`). */
export type TokenMap = Record<string, string>;

/**
 * Structured token overrides, split by appearance layer:
 *  - `root`  → applied at `:root`, regardless of light/dark.
 *  - `light` / `dark` → applied under `[data-theme='light' | 'dark']`.
 *
 * A bare {@link TokenMap} is also accepted for backward compatibility and is
 * treated as `root`. Only keys in the token contract
 * (`common/theme/tokenContract.ts`) are honored; unknown keys are ignored.
 */
export type ThemeTokens =
  | TokenMap
  | {
      root?: TokenMap;
      light?: TokenMap;
      dark?: TokenMap;
    };

/**
 * Unified theme. `appearance` drives data-theme + arco-theme.
 * `css` is the escape hatch (decorative + user themes). `tokens` is an optional
 * structured channel applied as scoped CSS variables when present.
 */
export type Theme = {
  id: string;
  name: string;
  cover?: string;
  appearance: ThemeAppearance;
  tokens?: ThemeTokens;
  css?: string;
  builtin: boolean;
  created_at: number;
  updated_at: number;
};
