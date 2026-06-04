/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { getCodeEditorConfig } from './codeEditorConfig';

export type EditorThemeMode = 'light' | 'dark';

/**
 * Build the font/appearance extension from the central code editor config.
 * @returns A CodeMirror Extension with font family, size, line height, and gutter styling
 */
export const codeEditorFontTheme = (): Extension => {
  const cfg = getCodeEditorConfig();
  return EditorView.theme({
    '&': { fontSize: cfg.fontSize },
    '.cm-content': { fontFamily: cfg.fontFamily, lineHeight: cfg.lineHeight },
    '.cm-gutters': { fontFamily: cfg.fontFamily },
  });
};

/**
 * Map app theme mode to the base CodeMirror theme identifier.
 * This is the seam for future custom color schemes; currently maps light/dark to built-in themes.
 * @param mode - The app's light or dark theme mode
 * @returns The CodeMirror theme identifier
 */
export const getCodeEditorBaseTheme = (mode: EditorThemeMode): 'light' | 'dark' => mode;
