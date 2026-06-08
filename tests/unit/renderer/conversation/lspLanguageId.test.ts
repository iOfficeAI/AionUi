/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  monacoDocumentSelectorsForLsp,
  resolveLspLanguageForBuffer,
} from '@/renderer/pages/conversation/Editor/lspLanguageId';

describe('lspLanguageId', () => {
  it('maps tsx to typescript LSP', () => {
    expect(resolveLspLanguageForBuffer('tsx')).toBe('typescript');
    expect(monacoDocumentSelectorsForLsp('typescript')).toContain('tsx');
  });

  it('returns null for unsupported languages', () => {
    expect(resolveLspLanguageForBuffer('markdown')).toBeNull();
  });

  it('maps rust to rust LSP', () => {
    expect(resolveLspLanguageForBuffer('rust')).toBe('rust');
  });
});
