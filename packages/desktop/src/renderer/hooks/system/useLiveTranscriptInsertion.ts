/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useRef } from 'react';
import { appendSpeechTranscript } from '@/renderer/hooks/system/useSpeechInput';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';

type ChainedDispatch = {
  dispatch: React.Dispatch<React.SetStateAction<string>>;
  /** Drop the pending chain; call when the committed value has caught up. */
  reset: () => void;
};

/**
 * Adapt a plain `(value: string) => void` setter (controlled-component
 * `value`/`onChange` shape) into a React-style dispatch. Same-tick updates
 * chain through a pending value instead of re-reading the stale committed
 * prop — otherwise two writers in one tick (e.g. the live-region restore
 * followed by the terminal transcript append) would both resolve against the
 * pre-update value and the last plain `onChange` would win, doubling text.
 *
 * Callers must invoke `reset()` whenever the committed value changes (e.g. a
 * `useEffect` keyed on the prop) so external edits become the new base.
 */
export const createChainedDispatch = (getCommitted: () => string, emit: (value: string) => void): ChainedDispatch => {
  let pending: string | null = null;

  return {
    dispatch: (update) => {
      const base = pending ?? getCommitted();
      const next = typeof update === 'function' ? update(base) : update;
      pending = next;
      emit(next);
    },
    reset: () => {
      pending = null;
    },
  };
};

/** Anchor state of an active streaming session, or null when inactive. */
type LiveTranscriptAnchor = {
  /** Entire input value captured right before the first live update. */
  text: string;
};

/**
 * Anchor-based live insertion: while a streaming voice session is active, the
 * text after the anchor is owned by the session and replaced on every update.
 *
 * Protocol (mirrors `useSpeechInput`'s `onLiveTranscript`):
 * - First non-null text of a session captures the entire prior input as the
 *   anchor and appends the live text per `appendSpeechTranscript` rules.
 * - Subsequent non-null texts replace the live region wholesale
 *   (anchor + live text). User keystrokes inside the live region during
 *   recording are intentionally overwritten.
 * - `null` restores the pre-session anchor text and deactivates the session;
 *   the terminal `onTranscript` then appends the final text via the existing
 *   transcript handler. `null` without an active session is a no-op.
 */
export const useLiveTranscriptInsertion = (setInput: React.Dispatch<React.SetStateAction<string>>) => {
  const setInputRef = useLatestRef(setInput);
  const anchorRef = useRef<LiveTranscriptAnchor | null>(null);

  const handleLiveTranscript = useCallback(
    (text: string | null) => {
      if (text === null) {
        const anchor = anchorRef.current;
        if (!anchor) {
          return;
        }
        anchorRef.current = null;
        setInputRef.current(() => anchor.text);
        return;
      }

      const anchor = anchorRef.current;
      if (!anchor) {
        // First live update of a session: capture the anchor from the latest
        // input value, then append the live text after it.
        setInputRef.current((prev) => {
          anchorRef.current = { text: prev };
          return appendSpeechTranscript(prev, text);
        });
        return;
      }

      setInputRef.current(() => appendSpeechTranscript(anchor.text, text));
    },
    [setInputRef]
  );

  return { handleLiveTranscript };
};
