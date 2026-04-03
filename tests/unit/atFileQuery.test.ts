import { buildAtFileInsertion, escapeAtFilePath, getActiveAtFileQuery } from '@/renderer/utils/chat/atFileQuery';
import { describe, expect, it } from 'vitest';

describe('atFileQuery', () => {
  it('detects an active @ token at the caret', () => {
    expect(getActiveAtFileQuery('Check @src/utils/date.ts', 'Check @src/utils/date.ts'.length)).toEqual({
      start: 6,
      end: 24,
      query: 'src/utils/date.ts',
      rawQuery: 'src/utils/date.ts',
      token: '@src/utils/date.ts',
    });
  });

  it('ignores @ inside a regular word', () => {
    expect(getActiveAtFileQuery('name@example.com', 'name@example.com'.length)).toBeNull();
  });

  it('unescapes spaces inside the active query', () => {
    expect(getActiveAtFileQuery('@docs/My\\ File.md', '@docs/My\\ File.md'.length)?.query).toBe('docs/My File.md');
  });

  it('escapes file paths when building insertion text', () => {
    expect(escapeAtFilePath('docs/My File (1).md')).toBe('docs/My\\ File\\ \\(1\\).md');
    expect(
      buildAtFileInsertion({
        path: '/workspace/docs/My File (1).md',
        name: 'My File (1).md',
        isFile: true,
        relativePath: 'docs/My File (1).md',
      })
    ).toBe('@docs/My\\ File\\ \\(1\\).md');
  });
});
