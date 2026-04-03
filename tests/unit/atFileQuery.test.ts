import {
  buildAtFileInsertion,
  escapeAtFilePath,
  getActiveAtFileQuery,
  getAllAtFileQueries,
} from '@/renderer/utils/chat/atFileQuery';
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

  it('finds all @ file queries in a message', () => {
    expect(getAllAtFileQueries('Use @README.md with @docs/My\\ File.md')).toEqual([
      {
        start: 4,
        end: 14,
        query: 'README.md',
        rawQuery: 'README.md',
        token: '@README.md',
      },
      {
        start: 20,
        end: 37,
        query: 'docs/My File.md',
        rawQuery: 'docs/My\\ File.md',
        token: '@docs/My\\ File.md',
      },
    ]);
  });
});
