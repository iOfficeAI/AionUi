import { describe, expect, it } from 'vitest';
import { getMarkdownShikiThemes, getMermaidTheme } from '@renderer/pages/conversation/Preview/theme/markdownTheme';

describe('markdownTheme', () => {
  it('returns a [light, dark] shiki theme pair in fixed order', () => {
    const pair = getMarkdownShikiThemes();
    expect(pair).toHaveLength(2);
    expect(pair[0]).toBe('github-light');
    expect(pair[1]).toBe('github-dark');
  });

  it('maps app theme mode to mermaid theme', () => {
    expect(getMermaidTheme('dark')).toBe('dark');
    expect(getMermaidTheme('light')).toBe('default');
  });
});
