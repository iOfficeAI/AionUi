/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IWorkspaceFlatFile } from '@/common/adapter/ipcBridge';
import { collectChatFileRefs } from '@/renderer/utils/file/messageFiles';
import { workspaceMentionItemFromListing } from '@/renderer/utils/file/workspaceMentions';
import { describe, expect, it } from 'vitest';

const listing = (fullPath: string): IWorkspaceFlatFile => ({
  name: fullPath.split(/[\\/]/).pop() || fullPath,
  fullPath,
  relativePath: 'src/index.vue',
});

describe('workspace mention fallback', () => {
  it('uses a local chat reference instead of an upload reference', () => {
    const item = workspaceMentionItemFromListing(listing('/workspace/src/index.vue'));
    expect(collectChatFileRefs([], [item])).toEqual([{ kind: 'local', path: '/workspace/src/index.vue' }]);
  });

  it('preserves Windows verbatim paths for backend canonicalization', () => {
    const fullPath = '\\\\?\\G:\\workspace\\src\\index.vue';
    const item = workspaceMentionItemFromListing(listing(fullPath));
    expect(collectChatFileRefs([], [item])).toEqual([{ kind: 'local', path: fullPath }]);
  });
});
