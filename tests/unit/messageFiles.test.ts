/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { collectChatFileRefs, splitChatFileRefs } from '@/renderer/utils/file/messageFiles';
import { projectFileRef, uploadFileRef } from '@/common/types/chatFile';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

describe('collectChatFileRefs', () => {
  const projectItem = (pe_id: string, relative_path: string): FileOrFolderItem => ({
    path: relative_path,
    name: relative_path.split('/').pop() ?? relative_path,
    isFile: true,
    chatRef: projectFileRef(pe_id, relative_path),
  });

  it('maps uploads to upload refs', () => {
    expect(collectChatFileRefs(['/abs/a.txt', '/abs/b.txt'], [])).toEqual([
      { kind: 'upload', path: '/abs/a.txt' },
      { kind: 'upload', path: '/abs/b.txt' },
    ]);
  });

  it('sends tree items carrying a chatRef verbatim as project refs', () => {
    expect(collectChatFileRefs([], [projectItem('pe-1', 'src/main.ts')])).toEqual([
      { kind: 'project', pe_id: 'pe-1', relative_path: 'src/main.ts' },
    ]);
  });

  it('treats atPath items without a chatRef (OS-picker mentions) as upload refs', () => {
    const mention: FileOrFolderItem = { path: '/abs/mention.md', name: 'mention.md', isFile: true };
    expect(collectChatFileRefs([], [mention, '/abs/str.txt'])).toEqual([
      { kind: 'upload', path: '/abs/mention.md' },
      { kind: 'upload', path: '/abs/str.txt' },
    ]);
  });

  it('dedupes project refs by pe identity and uploads by path', () => {
    const result = collectChatFileRefs(
      ['/abs/a.txt', '/abs/a.txt'],
      [projectItem('pe-1', 'src/main.ts'), projectItem('pe-1', 'src/main.ts')]
    );
    expect(result).toEqual([
      { kind: 'upload', path: '/abs/a.txt' },
      { kind: 'project', pe_id: 'pe-1', relative_path: 'src/main.ts' },
    ]);
  });

  it('keeps same relative_path under different pes as distinct project refs', () => {
    const result = collectChatFileRefs([], [projectItem('pe-1', 'a.ts'), projectItem('pe-2', 'a.ts')]);
    expect(result).toHaveLength(2);
  });

  it('drops empty upload paths and empty string mentions', () => {
    expect(collectChatFileRefs(['', '/abs/a.txt'], [''])).toEqual([{ kind: 'upload', path: '/abs/a.txt' }]);
  });

  it('returns an empty array for empty inputs', () => {
    expect(collectChatFileRefs([], [])).toEqual([]);
  });
});

describe('splitChatFileRefs', () => {
  it('routes upload refs to the uploadFile lane', () => {
    const { uploadFiles, atPath } = splitChatFileRefs([uploadFileRef('/abs/a.txt'), uploadFileRef('/abs/b.txt')]);
    expect(uploadFiles).toEqual(['/abs/a.txt', '/abs/b.txt']);
    expect(atPath).toEqual([]);
  });

  it('rebuilds project refs as atPath items carrying their chatRef', () => {
    const { uploadFiles, atPath } = splitChatFileRefs([projectFileRef('pe-1', 'src/main.ts')]);
    expect(uploadFiles).toEqual([]);
    expect(atPath).toEqual([
      {
        path: 'src/main.ts',
        name: 'main.ts',
        isFile: true,
        chatRef: { kind: 'project', pe_id: 'pe-1', relative_path: 'src/main.ts' },
      },
    ]);
  });

  it('round-trips through collectChatFileRefs back to the same refs', () => {
    const refs = [uploadFileRef('/abs/a.txt'), projectFileRef('pe-1', 'src/main.ts')];
    const { uploadFiles, atPath } = splitChatFileRefs(refs);
    expect(collectChatFileRefs(uploadFiles, atPath)).toEqual(refs);
  });
});
