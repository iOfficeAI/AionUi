/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The list reload a split-group mutation waits on before navigating: a failed
 * reload must not wipe the published list, and a reload that resolves after a
 * newer one was issued must not overwrite the newer snapshot.
 */

import { describe, expect, it, vi } from 'vitest';

type Deferred = { resolve: (value: unknown) => void; reject: (reason: unknown) => void };
const { pending } = vi.hoisted(() => ({ pending: [] as Deferred[] }));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: {
        invoke: vi.fn(
          () =>
            new Promise((resolve, reject) => {
              pending.push({ resolve, reject });
            })
        ),
      },
    },
    conversation: {
      listChanged: { on: () => () => {} },
      responseStream: { on: () => () => {} },
      turnCompleted: { on: () => () => {} },
      confirmation: { remove: { on: () => () => {} } },
    },
    application: {
      writeRendererLog: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({ addEventListener: () => () => {} }));

import {
  getSnapshotConversations,
  refreshConversationList,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';

const row = (id: string) => ({ id, name: id, type: 'acp', extra: {}, created_at: 1, modified_at: 1 });
const ids = () => getSnapshotConversations().map((conversation) => conversation.id);

describe('refreshConversationList', () => {
  it('publishes the list and resolves', async () => {
    const request = refreshConversationList();
    pending.shift()?.resolve({ items: [row('a')] });
    await request;
    expect(ids()).toEqual(['a']);
  });

  it('keeps the last good list and rejects when the reload fails', async () => {
    const request = refreshConversationList();
    pending.shift()?.reject(new Error('backend down'));
    await expect(request).rejects.toThrow('backend down');
    expect(ids()).toEqual(['a']);
  });

  it('settles a superseded request only when the newer snapshot has landed', async () => {
    const first = refreshConversationList();
    const second = refreshConversationList();
    const [firstRequest, secondRequest] = [pending.shift(), pending.shift()];
    // The older request lands first, with a list from between two writes: it
    // must neither publish nor let its caller proceed.
    firstRequest?.resolve({ items: [row('a')] });
    let firstSettled = false;
    void first.then(() => {
      firstSettled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(firstSettled).toBe(false);
    expect(ids()).toEqual(['a']);

    secondRequest?.resolve({ items: [row('a'), row('b')] });
    await second;
    await first;
    expect(ids()).toEqual(['a', 'b']);
  });

  it('rejects a superseded request when the newer one fails, instead of resolving on the old list', async () => {
    const first = refreshConversationList();
    const second = refreshConversationList();
    const [firstRequest, secondRequest] = [pending.shift(), pending.shift()];
    firstRequest?.resolve({ items: [row('x')] });
    secondRequest?.reject(new Error('backend down'));
    await expect(second).rejects.toThrow('backend down');
    await expect(first).rejects.toThrow('backend down');
    expect(ids()).toEqual(['a', 'b']);
  });
});
