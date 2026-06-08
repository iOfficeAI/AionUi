/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Maps editor-inferred language ids to `aionui-lsp` session language keys
 * (`AionCore/crates/aionui-lsp/src/languages.rs`).
 */

const LSP_SUPPORTED = new Set(['typescript', 'javascript', 'python', 'rust', 'go', 'powershell']);

/** Monaco document selector ids for a backend LSP language (tsx/jsx → typescript/javascript). */
export const monacoDocumentSelectorsForLsp = (lspLanguage: string): string[] => {
  switch (lspLanguage) {
    case 'typescript':
      return ['typescript', 'tsx'];
    case 'javascript':
      return ['javascript', 'jsx'];
    default:
      return [lspLanguage];
  }
};

/**
 * Returns the LSP backend language id when the buffer language is supported,
 * otherwise null (Monaco built-in workers only).
 */
export const resolveLspLanguageForBuffer = (editorLanguage: string): string | null => {
  if (editorLanguage === 'tsx') return LSP_SUPPORTED.has('typescript') ? 'typescript' : null;
  if (editorLanguage === 'jsx') return LSP_SUPPORTED.has('javascript') ? 'javascript' : null;
  return LSP_SUPPORTED.has(editorLanguage) ? editorLanguage : null;
};

export const isLspBackedEditorLanguage = (editorLanguage: string): boolean =>
  resolveLspLanguageForBuffer(editorLanguage) !== null;
