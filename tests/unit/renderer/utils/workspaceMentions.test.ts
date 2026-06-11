/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
import { filterWorkspaceMentionItems } from '@/renderer/utils/file/workspaceMentions';

describe('filterWorkspaceMentionItems', () => {
  it('orders exact and prefix matches before path-only matches', () => {
    const items: FileOrFolderItem[] = [
      {
        path: '/workspace/src/components/Button.tsx',
        name: 'Button.tsx',
        isFile: true,
        relativePath: 'src/components/Button.tsx',
      },
      {
        path: '/workspace/docs/button-guide.md',
        name: 'button-guide.md',
        isFile: true,
        relativePath: 'docs/button-guide.md',
      },
      {
        path: '/workspace/src/button/helpers.ts',
        name: 'helpers.ts',
        isFile: true,
        relativePath: 'src/button/helpers.ts',
      },
    ];

    const result = filterWorkspaceMentionItems(items, 'button');

    expect(result.map((item) => item.relativePath)).toEqual([
      'src/components/Button.tsx',
      'docs/button-guide.md',
      'src/button/helpers.ts',
    ]);
  });

  it('keeps filtering when a workspace file has no name field at runtime', () => {
    const itemWithoutName = {
      path: '/workspace/src/components/MissingName.tsx',
      isFile: true,
      relativePath: 'src/components/MissingName.tsx',
    } as unknown as FileOrFolderItem;

    const result = filterWorkspaceMentionItems([itemWithoutName], 'missing');

    expect(result).toEqual([itemWithoutName]);
  });
});
