/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CODE_EDITOR_CONFIG,
  getCodeEditorConfig,
} from '@/renderer/pages/conversation/Preview/theme/codeEditorConfig';

describe('codeEditorConfig', () => {
  it('exposes mono font + 13px defaults', () => {
    expect(DEFAULT_CODE_EDITOR_CONFIG.fontFamily).toBe('var(--font-mono)');
    expect(DEFAULT_CODE_EDITOR_CONFIG.fontSize).toBe('var(--code-font-size, 13px)');
    expect(DEFAULT_CODE_EDITOR_CONFIG.lineHeight).toBe('1.5');
    expect(DEFAULT_CODE_EDITOR_CONFIG.tabSize).toBe(2);
    expect(DEFAULT_CODE_EDITOR_CONFIG.wrap).toBe(true);
  });

  it('getCodeEditorConfig returns the default config', () => {
    expect(getCodeEditorConfig()).toEqual(DEFAULT_CODE_EDITOR_CONFIG);
  });
});
