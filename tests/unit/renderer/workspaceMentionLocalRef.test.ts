/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tripwire for ELECTRON-3TG: the legacy loading-window `@`-mention fallback
 * (used while a project's pe roots are unresolved) must tag its items with a
 * `local` chat-ref, NOT let them fall through to an `upload` ref. An `upload`
 * ref carrying a workspace/absolute path is rejected by the backend as outside
 * its managed upload dir (400) — the reporter's failure. `local` refs are sent
 * as-is and canonicalized backend-side (handles Windows verbatim `\\?\`).
 *
 * If the fallback mapping regresses to dropping `chatRef`, the send path falls
 * back to `upload` and these assertions fail.
 */

import { describe, expect, it } from 'vitest';

import type { IWorkspaceFlatFile } from '@/common/adapter/ipcBridge';
import { workspaceMentionItemFromListing } from '@/renderer/utils/file/workspaceMentions';
import { collectChatFileRefs } from '@/renderer/utils/file/messageFiles';

const listing = (fullPath: string): IWorkspaceFlatFile => ({
  name: fullPath.split(/[\\/]/).pop() || fullPath,
  fullPath,
  relativePath: 'src/index.vue',
});

describe('workspace @mention fallback → local chat-ref (ELECTRON-3TG)', () => {
  it('tags the fallback item with a local chat-ref carrying the absolute path', () => {
    const item = workspaceMentionItemFromListing(listing('/Users/me/proj/src/index.vue'));
    expect(item.chatRef).toEqual({ kind: 'local', path: '/Users/me/proj/src/index.vue' });
  });

  it('sends the fallback item as a local ref (NOT upload) through collectChatFileRefs', () => {
    const item = workspaceMentionItemFromListing(listing('/Users/me/proj/src/index.vue'));
    const refs = collectChatFileRefs([], [item]);
    expect(refs).toEqual([{ kind: 'local', path: '/Users/me/proj/src/index.vue' }]);
    expect(refs.every((r) => r.kind !== 'upload')).toBe(true);
  });

  it('passes a Windows verbatim path through as-is (no front-end strip; backend canonicalizes)', () => {
    const verbatim = '\\\\?\\G:\\proj\\src\\index.vue';
    const item = workspaceMentionItemFromListing(listing(verbatim));
    const refs = collectChatFileRefs([], [item]);
    expect(refs).toEqual([{ kind: 'local', path: verbatim }]);
  });

  it('regression witness: an item WITHOUT a chatRef falls back to an upload ref (the 400 path)', () => {
    const bare = { path: '/Users/me/proj/src/index.vue', name: 'index.vue', isFile: true };
    const refs = collectChatFileRefs([], [bare]);
    expect(refs).toEqual([{ kind: 'upload', path: '/Users/me/proj/src/index.vue' }]);
  });
});
