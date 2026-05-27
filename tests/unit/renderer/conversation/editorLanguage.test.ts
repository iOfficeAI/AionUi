/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getEditorFileName, inferEditorLanguage, isLikelyEditableTextFile } from '@/renderer/pages/conversation/Editor';

describe('editorLanguage', () => {
  it('infers Monaco languages from common text file extensions', () => {
    expect(inferEditorLanguage('/workspace/src/App.tsx')).toBe('typescript');
    expect(inferEditorLanguage('C:\\workspace\\README.md')).toBe('markdown');
    expect(inferEditorLanguage('/workspace/config.unknown')).toBe('plaintext');
  });

  it('extracts filenames across operating systems', () => {
    expect(getEditorFileName('/tmp/example.json')).toBe('example.json');
    expect(getEditorFileName('C:\\tmp\\example.json')).toBe('example.json');
  });

  it('classifies editable text files and rejects unsupported extensions', () => {
    expect(isLikelyEditableTextFile('script.py')).toBe(true);
    expect(isLikelyEditableTextFile('.gitignore')).toBe(true);
    expect(isLikelyEditableTextFile('photo.png')).toBe(false);
  });
});
