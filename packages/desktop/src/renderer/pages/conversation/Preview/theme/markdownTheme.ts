/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ComponentProps } from 'react';
import type { Streamdown } from 'streamdown';

/** Single Shiki theme accepted by Streamdown's shikiTheme prop (a BundledTheme). */
type ShikiTheme = NonNullable<ComponentProps<typeof Streamdown>['shikiTheme']>[number];

/**
 * The [light, dark] Shiki theme pair used for code blocks in markdown preview.
 * Chosen to visually match the plain CodeMirror light/dark editor themes.
 * This is the seam for future custom themes: changing the mapping here is enough.
 */
const MARKDOWN_SHIKI_THEMES: [ShikiTheme, ShikiTheme] = ['github-light', 'github-dark'];

/** Returns the [light, dark] Shiki theme pair for markdown code blocks. */
export const getMarkdownShikiThemes = (): [ShikiTheme, ShikiTheme] => MARKDOWN_SHIKI_THEMES;

/** Maps the app's light/dark mode to a Mermaid built-in theme name. */
export const getMermaidTheme = (mode: 'light' | 'dark'): 'default' | 'dark' => (mode === 'dark' ? 'dark' : 'default');
