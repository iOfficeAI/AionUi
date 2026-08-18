/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Theme token contract.
 *
 * The authoritative list of CSS custom properties a theme is allowed to override
 * through the structured `tokens` channel (see {@link ThemeTokens}). This mirrors
 * the semantic variables shipped in
 * `renderer/styles/themes/default-color-scheme.css`; it does NOT invent new ones.
 *
 * Two layers exist because most semantic colors take different values in light and
 * dark mode:
 *  - `appearance-invariant` tokens hold the same value in both modes → emitted at
 *    `:root` and applied regardless of `data-theme`.
 *  - `appearance-scoped` tokens differ per mode → emitted under
 *    `[data-theme='light']` / `[data-theme='dark']` so they only apply to the
 *    matching appearance.
 *
 * Arco Design's own scales (`--color-*`, `--primary-6`, …) are intentionally
 * excluded: they are driven by the `arco-theme` attribute, not by user themes.
 */

/** How a token behaves across light/dark appearances. */
export type TokenScope = 'appearance-invariant' | 'appearance-scoped';

/** A single overridable token and its metadata. */
export type ThemeTokenDescriptor = {
  /** CSS custom property name, including the leading `--`. */
  key: string;
  /** Semantic group used for documentation and future editor grouping. */
  group: ThemeTokenGroup;
  /** Whether the token is shared across appearances or split per appearance. */
  scope: TokenScope;
  /** Short human description of what the token controls. */
  description: string;
};

/** Semantic groups for organizing tokens in docs and editors. */
export type ThemeTokenGroup = 'background' | 'text' | 'border' | 'semantic' | 'brand' | 'component' | 'special';

/**
 * The token contract. Order is grouped by {@link ThemeTokenGroup} for readability.
 * Keep this aligned with `default-color-scheme.css`.
 */
export const THEME_TOKENS: readonly ThemeTokenDescriptor[] = [
  // Background
  { key: '--bg-base', group: 'background', scope: 'appearance-scoped', description: 'Primary app background' },
  { key: '--bg-1', group: 'background', scope: 'appearance-scoped', description: 'Secondary background' },
  { key: '--bg-2', group: 'background', scope: 'appearance-scoped', description: 'Tertiary background' },
  { key: '--bg-3', group: 'background', scope: 'appearance-scoped', description: 'Border / divider background' },
  { key: '--bg-6', group: 'background', scope: 'appearance-scoped', description: 'Disabled / secondary icon fill' },
  { key: '--bg-hover', group: 'background', scope: 'appearance-scoped', description: 'Hover background' },
  { key: '--bg-active', group: 'background', scope: 'appearance-scoped', description: 'Active / pressed background' },

  // Text
  { key: '--text-primary', group: 'text', scope: 'appearance-scoped', description: 'Primary text' },
  { key: '--text-secondary', group: 'text', scope: 'appearance-scoped', description: 'Secondary text' },
  { key: '--text-disabled', group: 'text', scope: 'appearance-scoped', description: 'Disabled text' },
  { key: '--text-white', group: 'text', scope: 'appearance-invariant', description: 'Always-white text' },

  // Border
  { key: '--border-base', group: 'border', scope: 'appearance-scoped', description: 'Base border' },
  { key: '--border-light', group: 'border', scope: 'appearance-scoped', description: 'Light border' },
  { key: '--border-special', group: 'border', scope: 'appearance-scoped', description: 'Special-case border' },

  // Semantic
  { key: '--primary', group: 'semantic', scope: 'appearance-scoped', description: 'Primary / accent color' },
  { key: '--success', group: 'semantic', scope: 'appearance-scoped', description: 'Success color' },
  { key: '--warning', group: 'semantic', scope: 'appearance-scoped', description: 'Warning color' },
  { key: '--danger', group: 'semantic', scope: 'appearance-scoped', description: 'Danger / error color' },
  { key: '--info', group: 'semantic', scope: 'appearance-scoped', description: 'Info color' },

  // Brand
  { key: '--brand', group: 'brand', scope: 'appearance-scoped', description: 'Brand color' },
  { key: '--brand-light', group: 'brand', scope: 'appearance-scoped', description: 'Brand light background' },
  { key: '--brand-hover', group: 'brand', scope: 'appearance-scoped', description: 'Brand hover color' },

  // Component
  {
    key: '--message-user-bg',
    group: 'component',
    scope: 'appearance-scoped',
    description: 'User message bubble background',
  },
  { key: '--message-tips-bg', group: 'component', scope: 'appearance-scoped', description: 'Tips message background' },
  {
    key: '--workspace-btn-bg',
    group: 'component',
    scope: 'appearance-scoped',
    description: 'Workspace button background',
  },
  {
    key: '--thought-gradient',
    group: 'component',
    scope: 'appearance-scoped',
    description: 'Thinking panel background gradient',
  },

  // Special
  { key: '--fill', group: 'special', scope: 'appearance-scoped', description: 'Generic fill' },
  { key: '--fill-0', group: 'special', scope: 'appearance-scoped', description: 'Fill 0 (translucent in dark)' },
  { key: '--dialog-fill-0', group: 'special', scope: 'appearance-scoped', description: 'Dialog fill' },
  { key: '--inverse', group: 'special', scope: 'appearance-invariant', description: 'Inverse (always white)' },
] as const;

/** Set of every overridable token key, for O(1) validation (module-private). */
const THEME_TOKEN_KEYS: ReadonlySet<string> = new Set(THEME_TOKENS.map((t) => t.key));

/** Whether a CSS custom property is part of the overridable token contract. */
export function isThemeTokenKey(key: string): boolean {
  return THEME_TOKEN_KEYS.has(key);
}
