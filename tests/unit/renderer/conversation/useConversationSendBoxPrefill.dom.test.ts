/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  appendPromptToDraft,
  requestConversationSendBoxPrefill,
  useConversationSendBoxPrefill,
} from '@/renderer/hooks/chat/useSendBoxDraft';

describe('conversation SendBox prefill', () => {
  it('preserves an existing draft when adding the scheduled-task prompt', () => {
    expect(appendPromptToDraft('', 'Use /cron')).toBe('Use /cron');
    expect(appendPromptToDraft('Keep this draft', 'Use /cron')).toBe('Keep this draft\nUse /cron');
    expect(appendPromptToDraft('Keep this draft\n', 'Use /cron')).toBe('Keep this draft\nUse /cron');
  });

  it('leaves the draft unchanged when the prompt is empty', () => {
    expect(appendPromptToDraft('Keep this draft', '')).toBe('Keep this draft');
  });

  it('ignores invalid requests and an unscoped consumer', () => {
    const consumer = vi.fn();
    const unscoped = renderHook(() => useConversationSendBoxPrefill(undefined, consumer));

    act(() => {
      requestConversationSendBoxPrefill('', 'Use /cron');
      requestConversationSendBoxPrefill('prefill-invalid', '');
    });

    expect(consumer).not.toHaveBeenCalled();
    unscoped.unmount();
  });

  it('delivers immediately to the mounted conversation only', () => {
    const currentConsumer = vi.fn();
    const backgroundConsumer = vi.fn();

    const current = renderHook(() => useConversationSendBoxPrefill('prefill-current', currentConsumer));
    const background = renderHook(() => useConversationSendBoxPrefill('prefill-background', backgroundConsumer));

    act(() => requestConversationSendBoxPrefill('prefill-current', 'Use /cron'));

    expect(currentConsumer).toHaveBeenCalledOnce();
    expect(currentConsumer).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Use /cron' }));
    expect(backgroundConsumer).not.toHaveBeenCalled();

    current.unmount();
    background.unmount();
  });

  it('holds a background prefill until its SendBox mounts and consumes it once', () => {
    const wrongConversationConsumer = vi.fn();
    const targetConsumer = vi.fn();

    act(() => requestConversationSendBoxPrefill('prefill-later', 'Use /cron later'));

    const wrongConversation = renderHook(() =>
      useConversationSendBoxPrefill('prefill-other', wrongConversationConsumer)
    );
    expect(wrongConversationConsumer).not.toHaveBeenCalled();
    wrongConversation.unmount();

    const target = renderHook(() => useConversationSendBoxPrefill('prefill-later', targetConsumer));
    expect(targetConsumer).toHaveBeenCalledOnce();
    target.unmount();

    const remountedTarget = renderHook(() => useConversationSendBoxPrefill('prefill-later', targetConsumer));
    expect(targetConsumer).toHaveBeenCalledOnce();
    remountedTarget.unmount();
  });

  it('cancels a stale background target when a newer destination is requested', () => {
    const staleConsumer = vi.fn();
    const latestConsumer = vi.fn();

    act(() => {
      requestConversationSendBoxPrefill('prefill-stale', 'Stale prompt');
      requestConversationSendBoxPrefill('prefill-latest', 'Latest prompt');
    });

    const staleTarget = renderHook(() => useConversationSendBoxPrefill('prefill-stale', staleConsumer));
    const latestTarget = renderHook(() => useConversationSendBoxPrefill('prefill-latest', latestConsumer));

    expect(staleConsumer).not.toHaveBeenCalled();
    expect(latestConsumer).toHaveBeenCalledOnce();
    expect(latestConsumer).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Latest prompt' }));

    staleTarget.unmount();
    latestTarget.unmount();
  });

  it('does not let an older cleanup remove a newer consumer for the same conversation', () => {
    const firstConsumer = vi.fn();
    const secondConsumer = vi.fn();
    const first = renderHook(() => useConversationSendBoxPrefill('prefill-replaced-listener', firstConsumer));
    const second = renderHook(() => useConversationSendBoxPrefill('prefill-replaced-listener', secondConsumer));

    first.unmount();
    act(() => requestConversationSendBoxPrefill('prefill-replaced-listener', 'Use latest consumer'));

    expect(firstConsumer).not.toHaveBeenCalled();
    expect(secondConsumer).toHaveBeenCalledOnce();
    second.unmount();
  });
});
