import { describe, expect, it } from 'vitest';

import { normalizeTextEditorLanguage } from '@/renderer/pages/conversation/Preview/components/editors/textEditorLanguage';
import { getDefaultOpenMode } from '@/renderer/pages/conversation/Preview/components/PreviewPanel/editorDefaults';

describe('normalizeTextEditorLanguage', () => {
  it('maps plain text-like extensions to the text language', () => {
    expect(normalizeTextEditorLanguage('txt')).toBe('text');
    expect(normalizeTextEditorLanguage('log')).toBe('text');
    expect(normalizeTextEditorLanguage('plain')).toBe('text');
  });

  it('preserves code-oriented language names', () => {
    expect(normalizeTextEditorLanguage('py')).toBe('py');
    expect(normalizeTextEditorLanguage('c')).toBe('c');
    expect(normalizeTextEditorLanguage('markdown')).toBe('markdown');
  });

  it('returns null for empty input', () => {
    expect(normalizeTextEditorLanguage('')).toBeNull();
    expect(normalizeTextEditorLanguage(undefined)).toBeNull();
  });
});

describe('getDefaultOpenMode', () => {
  it('defaults editable code tabs to edit mode', () => {
    expect(
      getDefaultOpenMode({
        contentType: 'code',
        isEditable: true,
      })
    ).toBe('edit');
  });

  it('does not start in editor mode when any requirement is missing', () => {
    expect(
      getDefaultOpenMode({
        contentType: 'code',
        isEditable: false,
      })
    ).toBeNull();
    expect(
      getDefaultOpenMode({
        contentType: 'markdown',
        isEditable: true,
      })
    ).toBe('source');
    expect(
      getDefaultOpenMode({
        contentType: 'html',
        isEditable: true,
      })
    ).toBe('source');
  });
});
