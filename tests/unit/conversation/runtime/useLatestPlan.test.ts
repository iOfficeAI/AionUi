/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import { selectLatestPlan } from '@/renderer/pages/conversation/PlanBar/useLatestPlan';

const plan = (msgId: string, createdAt: number, turnId?: string): TMessage =>
  ({
    id: `plan:${msgId}`,
    msg_id: msgId,
    conversation_id: 'conv-1',
    type: 'plan',
    position: 'left',
    created_at: createdAt,
    content: { entries: [{ content: `from ${msgId}`, status: 'pending' }], turn_id: turnId },
  }) as TMessage;

const text = (createdAt: number): TMessage =>
  ({
    id: `t-${createdAt}`,
    msg_id: `t-${createdAt}`,
    conversation_id: 'conv-1',
    type: 'text',
    position: 'left',
    created_at: createdAt,
    content: { content: 'hi' },
  }) as TMessage;

describe('selectLatestPlan', () => {
  it('returns undefined when the list has no plan', () => {
    expect(selectLatestPlan([text(1), text(2)])).toBeUndefined();
  });

  it('picks the newest plan by created_at, not by list order', () => {
    const list = [plan('turn-c', 300), text(400), plan('turn-a', 100)];
    expect(selectLatestPlan(list)?.msg_id).toBe('turn-c');
  });

  it('carries turn_id through so the caller can gate on the running turn', () => {
    expect(selectLatestPlan([plan('turn-a', 1, 'turn-id-1')])?.content.turn_id).toBe('turn-id-1');
  });
});

describe('plan turn_id passthrough', () => {
  it('copies turn_id from the WS envelope into the plan content', () => {
    const transformed = transformMessage({
      type: 'plan',
      conversation_id: 'conv-1',
      msg_id: 'turn-a',
      turn_id: 'turn-id-1',
      data: { entries: [{ content: 'step one', status: 'pending' }] },
    } as never);

    expect(transformed?.type).toBe('plan');
    expect((transformed as { content: { turn_id?: string } }).content.turn_id).toBe('turn-id-1');
  });

  it('leaves turn_id absent when the envelope carries none', () => {
    const transformed = transformMessage({
      type: 'plan',
      conversation_id: 'conv-1',
      msg_id: 'turn-a',
      data: { entries: [] },
    } as never);

    expect((transformed as { content: { turn_id?: string } }).content.turn_id).toBeUndefined();
  });
});
