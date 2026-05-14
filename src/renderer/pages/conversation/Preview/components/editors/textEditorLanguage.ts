/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LanguageName } from '@uiw/codemirror-extensions-langs';

const TEXT_LANGUAGE_ALIASES: Record<string, LanguageName> = {
  plain: 'text',
  plaintext: 'text',
  txt: 'text',
  log: 'text',
  conf: 'text',
  cfg: 'text',
  env: 'text',
  gitignore: 'text',
  dockerignore: 'text',
  editorconfig: 'text',
};

/**
 * Normalize a file language or extension into a CodeMirror language name.
 */
export function normalizeTextEditorLanguage(language?: string): LanguageName | null {
  const normalized = language?.trim().toLowerCase().replace(/^\./, '');
  if (!normalized) return null;

  if (normalized in TEXT_LANGUAGE_ALIASES) {
    return TEXT_LANGUAGE_ALIASES[normalized];
  }

  return normalized as LanguageName;
}
