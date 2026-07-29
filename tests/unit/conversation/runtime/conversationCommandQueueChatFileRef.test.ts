/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  createQueuedCommandItem,
  normalizeQueueState,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { projectFileRef, uploadFileRef } from '@/common/types/chatFile';

describe('command queue ChatFileRef handling', () => {
  it('dedupes queued files by ref identity, keeping first-seen order', () => {
    const item = createQueuedCommandItem({
      input: 'hi',
      files: [
        uploadFileRef('/a.txt'),
        projectFileRef('pe-1', 'x.ts'),
        uploadFileRef('/a.txt'),
        projectFileRef('pe-1', 'x.ts'),
      ],
    });
    expect(item.files).toEqual([
      { kind: 'upload', path: '/a.txt' },
      { kind: 'project', pe_id: 'pe-1', relative_path: 'x.ts' },
    ]);
  });

  it('keeps same relative_path under different pes as distinct queued refs', () => {
    const item = createQueuedCommandItem({
      input: 'hi',
      files: [projectFileRef('pe-1', 'a.ts'), projectFileRef('pe-2', 'a.ts')],
    });
    expect(item.files).toHaveLength(2);
  });

  it('drops a persisted item whose files are legacy plain strings, not ChatFileRefs', () => {
    // Simulates a queue persisted by the pre-refactor build (files: string[]).
    const state = normalizeQueueState({
      items: [{ id: 'q1', input: 'legacy', files: ['/abs/old.txt'], created_at: 1 }],
      isPaused: false,
      mode: 'auto',
    });
    expect(state.items).toEqual([]);
  });

  it('keeps a persisted item whose files are valid ChatFileRefs', () => {
    const state = normalizeQueueState({
      items: [{ id: 'q1', input: 'ok', files: [{ kind: 'upload', path: '/abs/new.txt' }], created_at: 1 }],
      isPaused: false,
      mode: 'auto',
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0].files).toEqual([{ kind: 'upload', path: '/abs/new.txt' }]);
  });
});
