import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { filterWorkspaceMentionItems, flattenWorkspaceMentionItems } from '@/renderer/utils/file/workspaceMentions';
import { describe, expect, it } from 'vitest';

describe('workspaceMentions', () => {
  it('flattens nested workspace trees into file mention items', () => {
    const tree: IDirOrFile[] = [
      {
        name: 'workspace',
        fullPath: '/workspace',
        relativePath: '',
        isDir: true,
        isFile: false,
        children: [
          {
            name: 'src',
            fullPath: '/workspace/src',
            relativePath: 'src',
            isDir: true,
            isFile: false,
            children: [
              {
                name: 'date.ts',
                fullPath: '/workspace/src/date.ts',
                relativePath: 'src/date.ts',
                isDir: false,
                isFile: true,
              },
            ],
          },
        ],
      },
    ];

    expect(flattenWorkspaceMentionItems(tree)).toEqual([
      {
        path: '/workspace/src/date.ts',
        name: 'date.ts',
        isFile: true,
        relativePath: 'src/date.ts',
      },
    ]);
  });

  it('prefers filename matches over path-only matches', () => {
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

  it('returns the first sorted results when the query is empty', () => {
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

  it('filters obvious junk files from flattened mention items', () => {
    const tree: IDirOrFile[] = [
      {
        name: 'workspace',
        fullPath: '/workspace',
        relativePath: '',
        isDir: true,
        isFile: false,
        children: [
          {
            name: '.DS_Store',
            fullPath: '/workspace/.DS_Store',
            relativePath: '.DS_Store',
            isDir: false,
            isFile: true,
          },
          {
            name: 'README.md',
            fullPath: '/workspace/README.md',
            relativePath: 'README.md',
            isDir: false,
            isFile: true,
          },
        ],
      },
    ];

    expect(flattenWorkspaceMentionItems(tree).map((item) => item.name)).toEqual(['README.md']);
  });
});
