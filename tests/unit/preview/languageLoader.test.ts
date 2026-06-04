import { describe, expect, it } from 'vitest';
import {
  matchLanguageDescription,
  shouldDisableHighlighting,
} from '@/renderer/pages/conversation/Preview/theme/languageLoader';

describe('matchLanguageDescription', () => {
  it('matches by explicit language name', () => {
    expect(matchLanguageDescription('typescript')?.name).toBe('TypeScript');
  });

  it('matches by file name extension when language name is absent', () => {
    expect(matchLanguageDescription(undefined, 'main.py')?.name).toBe('Python');
  });

  it('returns null for unknown language and file', () => {
    expect(matchLanguageDescription('not-a-language', 'file.unknownext')).toBeNull();
  });
});

describe('shouldDisableHighlighting', () => {
  it('disables for content over the viewer threshold (30k)', () => {
    expect(shouldDisableHighlighting(30_001)).toBe(true);
  });

  it('keeps highlighting for small content', () => {
    expect(shouldDisableHighlighting(100)).toBe(false);
  });
});
