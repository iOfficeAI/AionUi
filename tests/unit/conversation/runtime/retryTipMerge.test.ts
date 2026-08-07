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
import { buildMessageIndex, composeMessageWithIndex } from '@/renderer/pages/conversation/Messages/hooks';

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
