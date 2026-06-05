/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Central code editor configuration.
 * This is the single source of truth for font, size, and layout settings.
 * Future enhancement: inject settings from user preferences.
 */
type CodeEditorConfig = {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  tabSize: number;
  wrap: boolean;
};

const DEFAULT_CODE_EDITOR_CONFIG: CodeEditorConfig = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--code-font-size, 13px)',
  lineHeight: '1.5',
  tabSize: 2,
  wrap: true,
};

/**
 * Get the current code editor configuration.
 * @returns The code editor configuration
 */
const getCodeEditorConfig = (): CodeEditorConfig => DEFAULT_CODE_EDITOR_CONFIG;

export { DEFAULT_CODE_EDITOR_CONFIG, getCodeEditorConfig };
export type { CodeEditorConfig };
