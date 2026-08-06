/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Replays the exact live-frame sequence of a codex detached exec (ELECTRON-3XG):
 * the command's tool card streams under the user turn, the model ends the turn
 * and emits its text, and the command's OWN terminal lands minutes later under
 * the CLI-initiated (orphan) turn — a different msg_id, same call_id, and (before
 * the backend fix) an empty name.
 *
 * The card must settle in place: one tool card, terminal status, no duplicate.
 */

import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import { buildMessageIndex, composeMessageWithIndex } from '@/renderer/pages/conversation/Messages/hooks';

const CALL_ID = 'exec-3e883148-8029-4701-8e54-805cf70535d9';

const toolCard = (msgId: string, status: string, name: string, output?: string): TMessage =>
  ({
    id: `live-${Math.random()}`,
    msg_id: msgId,
    conversation_id: 'conv-1',
    type: 'tool_call',
    position: 'left',
    created_at: 1,
    content: { call_id: CALL_ID, name, status, output },
  }) as TMessage;

const text = (msgId: string, body: string): TMessage =>
  ({
    id: `text-${msgId}`,
    msg_id: msgId,
    conversation_id: 'conv-1',
    type: 'text',
    position: 'left',
    created_at: 2,
    content: { content: body },
  }) as TMessage;

describe('detached exec card live merge', () => {
  it('settles the running card in place when the terminal arrives under a later turn', () => {
    let list: TMessage[] = [];
    const merge = (m: TMessage) => {
      const index = buildMessageIndex(list);
      list = composeMessageWithIndex(m, list, index);
    };

    // user turn: the command starts and streams
    merge(toolCard('turn-a', 'running', 'commandExecution'));
    merge(toolCard('turn-a', 'running', 'commandExecution', 'build_line_1'));
    // the model ends its turn with text while the command keeps running
    merge(text('turn-a', 'The first lines are: build_line_1'));
    // minutes later: the command's own terminal, under the orphan turn's msg_id
    merge(toolCard('turn-orphan', 'completed', '', 'build_line_1..300'));

    const toolCards = list.filter((m) => m.type === 'tool_call');
    expect(toolCards, 'the terminal must settle the existing card, not add a second one').toHaveLength(1);
    expect((toolCards[0] as { content: { status?: string } }).content.status).toBe('completed');
  });

  it('keeps the tool name when the late terminal carries one (backend name retention)', () => {
    let list: TMessage[] = [];
    const merge = (m: TMessage) => {
      list = composeMessageWithIndex(m, list, buildMessageIndex(list));
    };
    merge(toolCard('turn-a', 'running', 'commandExecution'));
    merge(text('turn-a', 'done talking'));
    merge(toolCard('turn-orphan', 'completed', 'commandExecution'));

    const card = list.find((m) => m.type === 'tool_call') as { content: { name?: string; status?: string } };
    expect(card.content.name).toBe('commandExecution');
    expect(card.content.status).toBe('completed');
  });
});
