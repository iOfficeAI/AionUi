/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Behavioural tests for the rAF + setTimeout batching in
 * `useAddOrUpdateMessage`.
 *
 * The hook queues pending messages and schedules a single flush per
 * frame via `requestAnimationFrame`, with a 50ms setTimeout fallback for
 * windows where rAF is suspended (hidden / occluded). Whichever fires
 * first must cancel the other so we never commit twice per frame.
 *
 * These tests stub `window.requestAnimationFrame` so we can observe and
 * control when (or whether) the rAF callback runs.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import React, { useEffect, useRef, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageText, TMessage } from '@/common/chat/chatLib';
import {
  MessageListProvider,
  useAddOrUpdateMessage,
  useMessageList,
} from '@/renderer/pages/conversation/Messages/hooks';

const textMessage = (msgId: string, content: string, isFinished?: boolean): IMessageText =>
  ({
    id: msgId,
    msg_id: msgId,
    type: 'text',
    conversation_id: 'conv-1',
    position: 'left',
    content: isFinished === undefined ? { content } : { content, is_finished: isFinished },
  }) as unknown as IMessageText;

type ProbeState = {
  /** Reference to the latest messages array seen by the probe. */
  latestMessages: TMessage[];
  /** How many distinct messages-array references have been observed. */
  stateRenders: number;
};

/**
 * Renders the hook inside a `MessageListProvider` and exposes a probe
 * that tracks the current `useMessageList()` value plus how many distinct
 * state updates have been published. We count "distinct state updates"
 * by reference equality of the messages array — the context setter
 * always produces a fresh array on update, so a new reference == a new
 * committed update.
 */
function makeWrapper(): {
  wrapper: ({ children }: { children: ReactNode }) => React.ReactElement;
  readProbe: () => ProbeState;
} {
  const holder: { current: ProbeState } = { current: { latestMessages: [], stateRenders: 0 } };

  const wrapper = ({ children }: { children: ReactNode }) => (
    <MessageListProvider>
      <Probe holder={holder} />
      {children}
    </MessageListProvider>
  );

  return { wrapper, readProbe: () => holder.current };
}

function Probe({ holder }: { holder: { current: ProbeState } }): null {
  const messages = useMessageList();
  const lastRef = useRef<TMessage[] | null>(null);
  const countRef = useRef(0);

  if (lastRef.current !== messages) {
    lastRef.current = messages;
    countRef.current += 1;
    holder.current = { latestMessages: messages, stateRenders: countRef.current };
  }

  // Block lint about hook side-effects in render; the side effect is
  // idempotent (reference equality check) and does not call setState.
  useEffect(() => undefined);

  return null;
}

describe('useAddOrUpdateMessage — rAF + setTimeout batching', () => {
  let rafSpy: ReturnType<typeof vi.spyOn>;
  let cancelRafSpy: ReturnType<typeof vi.spyOn>;
  let capturedRaf: FrameRequestCallback | null;
  let nextRafId: number;
  let cancelRafCalls: number;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    capturedRaf = null;
    nextRafId = 1;
    cancelRafCalls = 0;
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      capturedRaf = cb;
      return nextRafId++;
    });
    cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      cancelRafCalls += 1;
    });
  });

  afterEach(() => {
    rafSpy.mockRestore();
    cancelRafSpy.mockRestore();
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.useRealTimers();
  });

  it('coalesces several rapid calls into a single state update that fires on the rAF tick', async () => {
    const { wrapper, readProbe } = makeWrapper();
    const { result } = renderHook(() => useAddOrUpdateMessage(), { wrapper });

    // Initial render observed exactly one messages reference (the default []).
    const baselineRenders = readProbe().stateRenders;

    // Three rapid calls in the same tick — the rAF should be armed but
    // no state update should leak through yet.
    act(() => {
      result.current(textMessage('m1', 'hello'), true);
      result.current(textMessage('m2', 'world'), true);
      result.current(textMessage('m1', ' hello-2')); // delta on m1
    });
    expect(capturedRaf).not.toBeNull();
    expect(readProbe().stateRenders).toBe(baselineRenders);
    expect(readProbe().latestMessages).toEqual([]);

    // Run the captured rAF callback — the hook should flush all three
    // pending items in a single update, then clear the rAF + setTimeout
    // handles so neither fires a second time.
    await act(async () => {
      capturedRaf?.(performance.now());
    });

    const finalProbe = readProbe();
    expect(finalProbe.latestMessages).toHaveLength(2);
    // Exactly ONE state update on top of the baseline — that's the
    // batching invariant.
    expect(finalProbe.stateRenders).toBe(baselineRenders + 1);

    const byMsgId = new Map(
      finalProbe.latestMessages.map((m) => [m.msg_id ?? '', (m.content as { content: string }).content])
    );
    // m1 had two deltas ('hello' + ' hello-2') → merged into 'hello hello-2'.
    expect(byMsgId.get('m1')).toBe('hello hello-2');
    expect(byMsgId.get('m2')).toBe('world');

    // The flush calls clearScheduled() which calls cancelAnimationFrame
    // on the still-stored rAF id.
    expect(cancelRafCalls).toBeGreaterThanOrEqual(1);

    // After the flush the hook should be back to a quiescent state:
    // calling it again must re-arm rAF, not stack on a stale handle.
    capturedRaf = null;
    act(() => {
      result.current(textMessage('m3', 'after-flush'), true);
    });
    expect(capturedRaf).not.toBeNull();
  });

  it('falls back to the 50ms setTimeout when rAF never fires', () => {
    // Only fake the timer functions — leave `requestAnimationFrame`
    // alone so the rAF spy from `beforeEach` keeps working in other
    // tests that share the same module instance.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    // rAF never fires: the spy returns an id but the callback is never
    // invoked from the test.
    rafSpy.mockImplementation(() => 42);
    capturedRaf = null;

    const { wrapper, readProbe } = makeWrapper();
    const { result } = renderHook(() => useAddOrUpdateMessage(), { wrapper });
    const baselineRenders = readProbe().stateRenders;

    act(() => {
      result.current(textMessage('m1', 'a'), true);
      result.current(textMessage('m1', 'b')); // delta merges with m1
    });

    // Just before the 50ms deadline, nothing has flushed.
    act(() => {
      vi.advanceTimersByTime(49);
    });
    expect(readProbe().stateRenders).toBe(baselineRenders);
    expect(readProbe().latestMessages).toEqual([]);

    // Crossing 50ms fires the fallback flush.
    act(() => {
      vi.advanceTimersByTime(1);
    });

    const finalProbe = readProbe();
    expect(finalProbe.stateRenders).toBe(baselineRenders + 1);
    expect(finalProbe.latestMessages).toHaveLength(1);
    expect(finalProbe.latestMessages[0].msg_id).toBe('m1');
    // The two deltas with the same msg_id must be merged into one entry.
    expect((finalProbe.latestMessages[0].content as { content: string }).content).toBe('ab');
  });

  it('does not double-commit when rAF fires first', async () => {
    // The rAF path calls clearScheduled() which cancels the 50ms
    // setTimeout, so even if a stray timer would have fired we should
    // not see a second state update.
    const { wrapper, readProbe } = makeWrapper();
    const { result } = renderHook(() => useAddOrUpdateMessage(), { wrapper });
    const baselineRenders = readProbe().stateRenders;

    act(() => {
      result.current(textMessage('m1', 'a'), true);
      result.current(textMessage('m2', 'b'), true);
    });

    // Fire the rAF callback.
    await act(async () => {
      capturedRaf?.(performance.now());
    });
    expect(readProbe().stateRenders).toBe(baselineRenders + 1);
    expect(readProbe().latestMessages).toHaveLength(2);

    // Wait well past the 50ms fallback deadline using real time, to
    // catch any orphan timer that wasn't cleared.
    await new Promise((resolve) => setTimeout(resolve, 80));
    await waitFor(() => {
      expect(readProbe().stateRenders).toBe(baselineRenders + 1);
    });
  });
});
