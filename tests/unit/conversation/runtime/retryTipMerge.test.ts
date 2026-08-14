/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Replays the live frames of a codex turn that stalls against its upstream:
 * the backend emits one warning tip per retry attempt, all carrying the same
 * `supersedes_key`. The user should watch a single card count up (1/5, 2/5 …)
 * instead of collecting a stack of near-identical "Reconnecting" cards.
 *
 * This exercises the path the renderer actually uses — transformMessage into
 * composeMessageWithIndex — not the standalone composeMessage helper.
 */

import { describe, expect, it } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { transformMessage, type IMessageTips, type TMessage } from '@/common/chat/chatLib';
import {
  buildMessageIndex,
  composeMessageWithIndex,
  foldSupersededTips,
  normalizeDbMessage,
  prependHistoryMessages,
} from '@/renderer/pages/conversation/Messages/hooks';

const TURN_MSG_ID = 'turn-a';

const retryFrame = (attempt: number, key = 'codex-retry:turn-a'): IResponseMessage =>
  ({
    type: 'tips',
    msg_id: TURN_MSG_ID,
    conversation_id: 'conv-1',
    data: {
      content: `Reconnecting... ${attempt}/5 — We're currently experiencing high demand`,
      type: 'warning',
      supersedes_key: key,
    },
  }) as unknown as IResponseMessage;

const textFrame = (body: string): IResponseMessage =>
  ({
    type: 'text',
    msg_id: TURN_MSG_ID,
    conversation_id: 'conv-1',
    data: body,
  }) as unknown as IResponseMessage;

describe('codex retry tip live merge', () => {
  const replay = (frames: IResponseMessage[]): TMessage[] => {
    let list: TMessage[] = [];
    for (const frame of frames) {
      const message = transformMessage(frame);
      if (!message) continue;
      list = composeMessageWithIndex(message, list, buildMessageIndex(list));
    }
    return list;
  };

  it('counts up in one card instead of stacking a card per attempt', () => {
    const list = replay([retryFrame(1), retryFrame(2), retryFrame(3), retryFrame(4), retryFrame(5)]);

    const tips = list.filter((message) => message.type === 'tips');
    expect(tips).toHaveLength(1);
    expect((tips[0] as IMessageTips).content.content).toContain('5/5');
  });

  it('finds its card again after other frames land in between', () => {
    const list = replay([retryFrame(1), textFrame('partial answer'), retryFrame(2)]);

    expect(list.filter((message) => message.type === 'tips')).toHaveLength(1);
    // The interleaved text must survive: the retry card is replaced by key, so
    // it cannot clobber the message that happens to share the turn's msg_id.
    expect(list.filter((message) => message.type === 'text')).toHaveLength(1);
  });

  it('keeps a second turn’s retry card separate from the first', () => {
    const list = replay([retryFrame(1), retryFrame(2, 'codex-retry:turn-b')]);

    expect(list.filter((message) => message.type === 'tips')).toHaveLength(2);
  });
});

/**
 * The rows below are the shape the backend actually persisted during a live run
 * against codex 0.147.0: every attempt is stored (the backend cannot know which
 * one is last), all sharing one key per retry round, with the tip payload kept
 * as a JSON string in `content`.
 */
describe('codex retry tip history fold', () => {
  const KEY_A = 'codex-retry:019fdbc6-cf7a-74c1-ba24-e0a63bda9485';
  const KEY_B = 'codex-retry:019fdbca-84a8-74d3-b8bc-c6170b1dddb6';

  const persistedRetry = (rowId: string, attempt: number, key: string): TMessage =>
    ({
      id: rowId,
      conversation_id: 'conv-1',
      type: 'tips',
      position: 'left',
      status: 'finish',
      content: JSON.stringify({
        content: `Reconnecting... ${attempt}/5 — We're currently experiencing high demand`,
        type: 'warning',
        code: null,
        params: null,
        supersedes_key: key,
      }),
    }) as unknown as TMessage;

  const persistedRun = (): TMessage[] =>
    [
      ...[1, 2, 3, 4, 5].map((n) => persistedRetry(`a${n}`, n, KEY_A)),
      ...[1, 2, 3, 4, 5].map((n) => persistedRetry(`b${n}`, n, KEY_B)),
    ].map(normalizeDbMessage);

  it('carries the merge key through DB normalization', () => {
    const rows = persistedRun();
    expect((rows[0] as IMessageTips).content.supersedes_key).toBe(KEY_A);
  });

  it('shows one card per retry round instead of re-expanding the stack', () => {
    const folded = foldSupersededTips(persistedRun());

    expect(folded).toHaveLength(2);
    expect((folded[0] as IMessageTips).content.content).toContain('5/5');
    expect((folded[1] as IMessageTips).content.content).toContain('5/5');
    // The card keeps the position (and id) of the attempt it started at.
    expect(folded[0].id).toBe('a1');
  });

  it('folds a run whose attempts straddle a page boundary', () => {
    const rows = persistedRun();
    const olderPage = rows.slice(0, 3);
    const alreadyLoaded = rows.slice(3);

    const list = prependHistoryMessages(alreadyLoaded, olderPage);

    expect(list.filter((message) => message.type === 'tips')).toHaveLength(2);
  });

  it('leaves tips without a key untouched', () => {
    const drift = normalizeDbMessage({
      id: 'drift',
      conversation_id: 'conv-1',
      type: 'tips',
      position: 'left',
      content: JSON.stringify({ content: 'The installed codex is newer…', type: 'info', code: 'CLI_VERSION_NEWER' }),
    } as unknown as TMessage);

    const folded = foldSupersededTips([drift, ...persistedRun(), drift]);

    expect(folded.filter((message) => message.type === 'tips')).toHaveLength(4);
  });
});
