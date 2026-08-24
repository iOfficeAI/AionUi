/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ThemeTokens, TokenMap } from '@/common/theme/types';
import { isThemeTokenKey } from '@/common/theme/tokenContract';

/** Normalize both the flat and layered {@link ThemeTokens} shapes into layers. */
function toLayers(tokens: ThemeTokens): { root?: TokenMap; light?: TokenMap; dark?: TokenMap } {
  const isLayered = 'root' in tokens || 'light' in tokens || 'dark' in tokens;
  if (isLayered) return tokens as { root?: TokenMap; light?: TokenMap; dark?: TokenMap };
  return { root: tokens as TokenMap };
}

/** Render one selector block, keeping only keys that belong to the token contract. */
function renderBlock(selector: string, map?: TokenMap): string | null {
  if (!map) return null;
  const body = Object.entries(map)
    .filter(([k]) => isThemeTokenKey(k))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return body ? `${selector} {\n${body}\n}` : null;
}

/**
 * Build the tokens stylesheet from a theme's structured `tokens`. `root` tokens
 * apply regardless of appearance; `light` / `dark` tokens are scoped per appearance.
 *
 * Appearance selectors use `:root[data-theme='…']` (specificity 0,2,0) on purpose:
 * the default color scheme sets its dark values under
 * `[data-color-scheme='default'][data-theme='dark']` (also 0,2,0). A bare
 * `[data-theme='dark']` (0,1,0) would lose to that baseline regardless of source
 * order, so token overrides would silently no-op in dark mode. Matching the
 * baseline specificity + appending this stylesheet last in <head> lets overrides win.
 *
 * Returns `null` when there is nothing to emit (no tokens, or only unknown keys).
 */
export function tokensToCss(tokens?: ThemeTokens): string | null {
  if (!tokens) return null;
  const layers = toLayers(tokens);
  const blocks = [
    renderBlock(':root', layers.root),
    renderBlock(":root[data-theme='light']", layers.light),
    renderBlock(":root[data-theme='dark']", layers.dark),
  ].filter((b): b is string => b !== null);
  return blocks.length > 0 ? blocks.join('\n') : null;
}
