/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  fromBackendWorkspaceFlatFiles,
  fromBackendWorkspaceList,
  type RawWorkspaceFlatFile,
} from '@/common/adapter/workspaceMapper';

describe('workspaceMapper', () => {
  it('maps workspace flat files from backend snake_case to frontend camelCase', () => {
    const raw: RawWorkspaceFlatFile[] = [
      {
        name: 'main.ts',
        full_path: '/workspace/src/main.ts',
        relative_path: 'src/main.ts',
      },
    ];

    expect(fromBackendWorkspaceFlatFiles(raw)).toEqual([
      {
        name: 'main.ts',
        fullPath: '/workspace/src/main.ts',
        relativePath: 'src/main.ts',
      },
    ]);
  });

  it('does not leak snake_case path fields', () => {
    const [file] = fromBackendWorkspaceFlatFiles([
      {
        name: 'README.md',
        full_path: '/workspace/README.md',
        relative_path: 'README.md',
      },
    ]);

    expect(file).toBeDefined();
    expect((file as Record<string, unknown>).full_path).toBeUndefined();
    expect((file as Record<string, unknown>).relative_path).toBeUndefined();
    expect(file?.fullPath).toBe('/workspace/README.md');
    expect(file?.relativePath).toBe('README.md');
  });

  it('keeps workspace-relative search result paths intact', () => {
    const [root] = fromBackendWorkspaceList(
      [
        {
          name: 'src/components/SearchPanel.tsx',
          type: 'file',
          match_kind: 'name',
        },
      ],
      '/workspace',
      '.'
    );

    expect(root?.children?.[0]).toMatchObject({
      name: 'src/components/SearchPanel.tsx',
      fullPath: '/workspace/src/components/SearchPanel.tsx',
      relativePath: 'src/components/SearchPanel.tsx',
      isFile: true,
      searchMatchKind: 'name',
    });
  });

  it('maps content search match kind from backend results', () => {
    const [root] = fromBackendWorkspaceList(
      [
        {
          name: 'docs/notes.md',
          type: 'file',
          match_kind: 'content',
        },
      ],
      '/workspace',
      '.'
    );

    expect(root?.children?.[0]).toMatchObject({
      relativePath: 'docs/notes.md',
      searchMatchKind: 'content',
    });
  });

  it('does not duplicate parent path for workspace-relative search results under a subdirectory', () => {
    const [root] = fromBackendWorkspaceList(
      [
        {
          name: 'src/components/SearchPanel.tsx',
          type: 'file',
        },
      ],
      '/workspace',
      'src'
    );

    expect(root?.children?.[0]).toMatchObject({
      fullPath: '/workspace/src/components/SearchPanel.tsx',
      relativePath: 'src/components/SearchPanel.tsx',
    });
  });
});
