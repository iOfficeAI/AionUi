import { convertLatexDelimiters } from '@/renderer/utils/chat/latexDelimiters';
import { describe, expect, it } from 'vitest';

describe('convertLatexDelimiters', () => {
  it('converts block display math \\[...\\] to $$...$$', () => {
    const input = 'Here is block math: \\[E = mc^2\\]';
    const output = convertLatexDelimiters(input);
    expect(output).toBe('Here is block math: $$E = mc^2$$');
  });

  it('converts inline math \\(...\\) to $...$', () => {
    const input = 'Here is inline math: \\(x + y = z\\)';
    const output = convertLatexDelimiters(input);
    expect(output).toBe('Here is inline math: $x + y = z$');
  });

  it('preserves code blocks unchanged', () => {
    const input = '```\n\\[E = mc^2\\]\n```\nOutside: \\[a + b\\]';
    const output = convertLatexDelimiters(input);
    expect(output).toBe('```\n\\[E = mc^2\\]\n```\nOutside: $$a + b$$');
  });

  it('preserves inline code unchanged', () => {
    const input = 'Use `\\[E = mc^2\\]` in LaTeX, but \\(a = b\\) in math.';
    const output = convertLatexDelimiters(input);
    expect(output).toBe('Use `\\[E = mc^2\\]` in LaTeX, but $a = b$ in math.');
  });

  it('handles empty or non-string inputs safely', () => {
    expect(convertLatexDelimiters('')).toBe('');
    expect(convertLatexDelimiters(null as unknown as string)).toBe('');
  });
});
