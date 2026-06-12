/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IMessageText } from '@/common/chat/chatLib';
import { mergeTextMessageContent, preferTextMessageVersion } from '@/common/chat/chatLib';

/**
 * Streaming text deltas for the same `msg_id` are merged into the
 * existing message via `mergeTextMessageContent`. The function must:
 *   - concatenate `content` strings
 *   - carry over the `is_finished` flag from whichever side has the
 *     authoritative value (the backend's end-of-turn event sends
 *     `is_finished: true` with an empty content delta; a regular delta
 *     sends `is_finished: false`).
 *   - not duplicate or drop unrelated fields like `replace` or
 *     `teammateMessage`.
 */

const text = (overrides: Partial<IMessageText['content']> = {}): IMessageText['content'] => ({
  content: '',
  ...overrides,
});

describe('mergeTextMessageContent — is_finished propagation', () => {
  it('keeps existing content and flips is_finished when an empty finish delta arrives', () => {
    // The classic end-of-turn shape: backend sends `{ content: '',
    // is_finished: true }` to signal the stream is done. The existing
    // accumulated text and the in-flight state must both be preserved.
    const existing = text({ content: 'abc', is_finished: false });
    const incoming = text({ content: '', is_finished: true });

    const merged = mergeTextMessageContent(existing, incoming);

    expect(merged.content).toBe('abc');
    expect(merged.is_finished).toBe(true);
  });

  it('keeps is_finished false when a plain content delta arrives', () => {
    const existing = text({ content: 'abc', is_finished: false });
    const incoming = text({ content: 'd', is_finished: false });

    const merged = mergeTextMessageContent(existing, incoming);

    expect(merged.content).toBe('abcd');
    expect(merged.is_finished).toBe(false);
  });

  it('appends content even when the existing entry was finished with empty content', () => {
    // Some backends first mark is_finished then keep streaming (e.g. a
    // tool-call interleaved with text). The empty initial content must
    // not block subsequent appends.
    const existing = text({ content: '', is_finished: true });
    const incoming = text({ content: 'first chunk', is_finished: false });

    const merged = mergeTextMessageContent(existing, incoming);

    expect(merged.content).toBe('first chunk');
    // Incoming is_finished is false; existing was true. The merge
    // implementation surfaces the incoming flag's value — the test
    // pins the actual current behaviour so we notice if it changes.
    expect(merged.is_finished).toBe(false);
  });
});

describe('mergeTextMessageContent — content concatenation', () => {
  it('concatenates plain string deltas in arrival order', () => {
    const existing = text({ content: 'hello' });
    const incoming = text({ content: ' world' });

    expect(mergeTextMessageContent(existing, incoming).content).toBe('hello world');
  });

  it('replaces the existing content when the incoming delta has replace=true', () => {
    const existing = text({ content: 'stale', replace: true });
    const incoming = text({ content: 'fresh', replace: true });

    const merged = mergeTextMessageContent(existing, incoming);

    expect(merged.content).toBe('fresh');
    expect(merged.replace).toBe(true);
  });
});

describe('preferTextMessageVersion — streaming vs DB snapshot', () => {
  const make = (overrides: Partial<IMessageText['content']>): IMessageText =>
    ({
      id: 'm-1',
      msg_id: 'm-1',
      conversation_id: 'conv-1',
      type: 'text',
      position: 'left',
      content: { content: '', ...overrides },
    }) as unknown as IMessageText;

  it('prefers the streaming version when it has more text than the DB snapshot', () => {
    const db = make({ content: 'hello' });
    const streaming = make({ content: 'hello world' });

    expect(preferTextMessageVersion(db, streaming)).toBe(streaming);
  });

  it('prefers the DB version when it has more text than the streaming snapshot', () => {
    const db = make({ content: 'hello world' });
    const streaming = make({ content: 'hello' });

    expect(preferTextMessageVersion(db, streaming)).toBe(db);
  });

  it('prefers the streaming version (replace=true) when the DB is not a replace', () => {
    const db = make({ content: 'same' });
    const streaming = make({ content: 'same', replace: true });

    expect(preferTextMessageVersion(db, streaming)).toBe(streaming);
  });
});
