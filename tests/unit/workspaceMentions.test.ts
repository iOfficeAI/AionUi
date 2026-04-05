import { filterWorkspaceMentionItems } from '@/renderer/utils/file/workspaceMentions';
import { describe, expect, it } from 'vitest';

describe('workspaceMentions', () => {
  it('ranks the most relevant filename matches first', () => {
    const items = [
      {
        path: '/workspace/docs/date-guide.md',
        name: 'date-guide.md',
        isFile: true,
        relativePath: 'docs/date-guide.md',
      },
      {
        path: '/workspace/src/date.ts',
        name: 'date.ts',
        isFile: true,
        relativePath: 'src/date.ts',
      },
      {
        path: '/workspace/examples/utils.ts',
        name: 'utils.ts',
        isFile: true,
        relativePath: 'examples/date/utils.ts',
      },
    ];

    expect(filterWorkspaceMentionItems(items, 'date').map((item) => item.relativePath)).toEqual([
      'src/date.ts',
      'docs/date-guide.md',
      'examples/date/utils.ts',
    ]);
  });

  it('returns no results when the query is empty', () => {
    const items = [
      {
        path: '/workspace/b.ts',
        name: 'b.ts',
        isFile: true,
        relativePath: 'b.ts',
      },
      {
        path: '/workspace/a.ts',
        name: 'a.ts',
        isFile: true,
        relativePath: 'a.ts',
      },
    ];

    expect(filterWorkspaceMentionItems(items, '').map((item) => item.relativePath)).toEqual([]);
  });

  it('filters obvious junk files from mention results', () => {
    const items = [
      {
        path: '/workspace/.DS_Store',
        name: '.DS_Store',
        isFile: true,
        relativePath: '.DS_Store',
      },
      {
        path: '/workspace/README.md',
        name: 'README.md',
        isFile: true,
        relativePath: 'README.md',
      },
    ];

    expect(filterWorkspaceMentionItems(items, 'read').map((item) => item.name)).toEqual(['README.md']);
  });
});
