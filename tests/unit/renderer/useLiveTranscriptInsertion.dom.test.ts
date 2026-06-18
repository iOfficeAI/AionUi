/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Anchor-based live transcript insertion (streaming voice input, Task B5):
 * while a streaming session is active, the text after the anchor is owned by
 * the session and replaced wholesale on every live update. `null` restores
 * the pre-session anchor; the terminal `onTranscript` then appends the final
 * text via the regular transcript handler (no double write).
 */

import { act, renderHook } from '@testing-library/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { createChainedDispatch, useLiveTranscriptInsertion } from '@/renderer/hooks/system/useLiveTranscriptInsertion';
import { appendSpeechTranscript } from '@/renderer/hooks/system/useSpeechInput';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';

/** Real useState harness so the hook is exercised against actual React state. */
const useHarness = () => {
  const [input, setInput] = useState('');
  const { handleLiveTranscript } = useLiveTranscriptInsertion(setInput);
  return { input, setInput, handleLiveTranscript };
};

describe('useLiveTranscriptInsertion', () => {
  it('inserts live text into an empty input, replaces on update, and clears on null without double-writing the final', () => {
    const { result } = renderHook(useHarness);

    act(() => result.current.handleLiveTranscript('hello'));
    expect(result.current.input).toBe('hello');

    act(() => result.current.handleLiveTranscript('hello world'));
    expect(result.current.input).toBe('hello world');

    act(() => result.current.handleLiveTranscript(null));
    expect(result.current.input).toBe('');

    // Terminal onTranscript flow: the regular handler appends the final text
    // onto the restored anchor — exactly one copy ends up in the input.
    act(() => result.current.setInput((prev) => appendSpeechTranscript(prev, 'hello world')));
    expect(result.current.input).toBe('hello world');
  });

  it('anchors to the existing input, joins with newline, and restores the draft on null', () => {
    const { result } = renderHook(useHarness);

    act(() => result.current.setInput('draft'));

    act(() => result.current.handleLiveTranscript('a'));
    expect(result.current.input).toBe('draft\na');

    act(() => result.current.handleLiveTranscript('ab'));
    expect(result.current.input).toBe('draft\nab');

    act(() => result.current.handleLiveTranscript(null));
    expect(result.current.input).toBe('draft');
  });

  it('ignores null when no session is active', () => {
    const { result } = renderHook(useHarness);

    act(() => result.current.setInput('untouched'));
    act(() => result.current.handleLiveTranscript(null));
    expect(result.current.input).toBe('untouched');
  });

  it('captures a fresh anchor for a second session after the first completes', () => {
    const { result } = renderHook(useHarness);

    // First session.
    act(() => result.current.handleLiveTranscript('first'));
    act(() => result.current.handleLiveTranscript(null));
    expect(result.current.input).toBe('');
    act(() => result.current.setInput((prev) => appendSpeechTranscript(prev, 'first')));
    expect(result.current.input).toBe('first');

    // Second session anchors on the input that now includes the first final.
    act(() => result.current.handleLiveTranscript('second'));
    expect(result.current.input).toBe('first\nsecond');

    act(() => result.current.handleLiveTranscript(null));
    expect(result.current.input).toBe('first');
  });

  it('keeps the anchor unchanged for whitespace-only live text (appendSpeechTranscript rules)', () => {
    const { result } = renderHook(useHarness);

    act(() => result.current.setInput('draft'));

    act(() => result.current.handleLiveTranscript('   '));
    expect(result.current.input).toBe('draft');

    // The session is still active: a later real update replaces the live region.
    act(() => result.current.handleLiveTranscript('spoken'));
    expect(result.current.input).toBe('draft\nspoken');

    act(() => result.current.handleLiveTranscript(null));
    expect(result.current.input).toBe('draft');
  });
});

/**
 * Mimics SendBox's controlled-prop shape: the "parent" owns the state and the
 * "child" only sees a `value` prop plus a PLAIN `(value: string) => void`
 * onChange (no functional updates). React batches plain-value calls within
 * one tick — last write wins — so the child must chain same-tick updates
 * through `createChainedDispatch`, exactly as SendBox does.
 */
const useControlledHarness = () => {
  // Parent layer.
  const [input, setInput] = useState('');
  const onChange = useCallback((value: string) => setInput(value), []);

  // Child layer (SendBox shape): `input` prop + plain `onChange`.
  const latestInputRef = useLatestRef(input);
  const onChangeRef = useLatestRef(onChange);
  const speechDispatch = useMemo(
    () =>
      createChainedDispatch(
        () => latestInputRef.current,
        (value) => onChangeRef.current(value)
      ),
    [latestInputRef, onChangeRef]
  );
  useEffect(() => {
    speechDispatch.reset();
  }, [input, speechDispatch]);
  const handleSpeechTranscript = useCallback(
    (transcript: string) => {
      speechDispatch.dispatch((prev) => appendSpeechTranscript(prev, transcript));
    },
    [speechDispatch]
  );
  const { handleLiveTranscript } = useLiveTranscriptInsertion(speechDispatch.dispatch);

  return { input, setInput, handleLiveTranscript, handleSpeechTranscript };
};

describe('useLiveTranscriptInsertion — controlled SendBox shape (plain onChange)', () => {
  it('does not double the final text when the live-region restore and the terminal append land in the same tick', () => {
    const { result } = renderHook(useControlledHarness);

    act(() => result.current.setInput('draft'));

    // Streaming session over "draft".
    act(() => result.current.handleLiveTranscript('hello world'));
    expect(result.current.input).toBe('draft\nhello world');

    // Terminal sequence from useSpeechInput fires synchronously in ONE tick:
    // onLiveTranscript(null) then onTranscript('hello world'). Without the
    // pending-value chain both writers resolve against the stale committed
    // prop and the batched last write yields "draft\nhello world\nhello world".
    act(() => {
      result.current.handleLiveTranscript(null);
      result.current.handleSpeechTranscript('hello world');
    });
    expect(result.current.input).toBe('draft\nhello world');
  });

  it('chains same-tick live updates of an in-flight session', () => {
    const { result } = renderHook(useControlledHarness);

    act(() => {
      result.current.handleLiveTranscript('he');
      result.current.handleLiveTranscript('hello');
    });
    expect(result.current.input).toBe('hello');

    act(() => {
      result.current.handleLiveTranscript(null);
      result.current.handleSpeechTranscript('hello');
    });
    expect(result.current.input).toBe('hello');
  });
});

describe('createChainedDispatch', () => {
  it('chains same-tick functional updates through the pending value', () => {
    const emitted: string[] = [];
    const { dispatch } = createChainedDispatch(
      () => 'base',
      (value) => emitted.push(value)
    );

    dispatch((prev) => `${prev}+1`);
    dispatch((prev) => `${prev}+2`);

    expect(emitted).toEqual(['base+1', 'base+1+2']);
  });

  it('treats a plain value mid-chain as the new base', () => {
    const emitted: string[] = [];
    const { dispatch } = createChainedDispatch(
      () => 'base',
      (value) => emitted.push(value)
    );

    dispatch((prev) => `${prev}+1`);
    dispatch('override');
    dispatch((prev) => `${prev}!`);

    expect(emitted).toEqual(['base+1', 'override', 'override!']);
  });

  it('re-reads the committed value after reset()', () => {
    let committed = 'a';
    const emitted: string[] = [];
    const { dispatch, reset } = createChainedDispatch(
      () => committed,
      (value) => emitted.push(value)
    );

    dispatch((prev) => `${prev}1`);
    expect(emitted).toEqual(['a1']);

    // Commit lands (possibly with an external edit), chain is reset.
    committed = 'typed';
    reset();

    dispatch((prev) => `${prev}!`);
    expect(emitted).toEqual(['a1', 'typed!']);
  });
});
