/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildAtFileInsertion, resolveAtFileMenuKey } from '@/renderer/utils/chat/atFileQuery';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

describe('buildAtFileInsertion', () => {
  it('uses relative path when available', () => {
    const item: FileOrFolderItem = {
      name: 'main.ts',
      path: '/workspace/src/main.ts',
      relativePath: 'src/main.ts',
      isFile: true,
    };

    expect(buildAtFileInsertion(item)).toBe('@src/main.ts');
  });

  it('escapes boundary characters in inserted paths', () => {
    const item: FileOrFolderItem = {
      name: 'my file.ts',
      path: '/workspace/my file.ts',
      relativePath: 'my file.ts',
      isFile: true,
    };

    expect(buildAtFileInsertion(item)).toBe('@my\\ file.ts');
  });

  it('returns null when no path is available', () => {
    const item = {
      name: 'broken.ts',
      isFile: true,
    } as FileOrFolderItem;

    expect(buildAtFileInsertion(item)).toBeNull();
  });
});

describe('resolveAtFileMenuKey', () => {
  it('accepts on Enter and Tab', () => {
    expect(resolveAtFileMenuKey('Enter', true)).toBe('accept');
    expect(resolveAtFileMenuKey('Tab', true)).toBe('accept');
  });

  it('navigates on ArrowUp / ArrowDown', () => {
    expect(resolveAtFileMenuKey('ArrowUp', true)).toBe('up');
    expect(resolveAtFileMenuKey('ArrowDown', true)).toBe('down');
  });

  it('dismisses on Escape regardless of items', () => {
    expect(resolveAtFileMenuKey('Escape', true)).toBe('dismiss');
    expect(resolveAtFileMenuKey('Escape', false)).toBe('dismiss');
  });

  it('does not handle other keys', () => {
    expect(resolveAtFileMenuKey('a', true)).toBeNull();
    expect(resolveAtFileMenuKey(' ', true)).toBeNull();
  });

  it('with no items, only Escape resolves (accept/nav are null so keys are not hijacked)', () => {
    expect(resolveAtFileMenuKey('Enter', false)).toBeNull();
    expect(resolveAtFileMenuKey('Tab', false)).toBeNull();
    expect(resolveAtFileMenuKey('ArrowDown', false)).toBeNull();
  });
});
