// tests/unit/process/acp/session/InputPreprocessor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { InputPreprocessor } from '@process/acp/session/InputPreprocessor';

describe('InputPreprocessor', () => {
  it('returns text-only content when no files', () => {
    const pp = new InputPreprocessor(vi.fn());
    const result = pp.process('hello world');
    expect(result).toEqual([{ type: 'text', text: 'hello world' }]);
  });
  it('appends file items for provided files', () => {
    const readFile = vi.fn((path: string) => `content of ${path}`);
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('check this', ['/foo/bar.ts']);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'text', text: 'check this' });
    expect(result[1]).toEqual({ type: 'file', path: '/foo/bar.ts', content: 'content of /foo/bar.ts' });
  });
  it('resolves @file references in text', () => {
    const readFile = vi.fn((path: string) => `content of ${path}`);
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('review @/src/index.ts');
    expect(result.some((item) => item.type === 'file')).toBe(true);
  });
  it('handles file read errors gracefully', () => {
    const readFile = vi.fn(() => {
      throw new Error('ENOENT');
    });
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('check this', ['/nonexistent.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
  });
});
