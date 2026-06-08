/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { resolveParentForkMsgIdFromMessages } from '@/common/chat/resolveParentForkMsgId';
import type { TMessage } from '@/common/chat/chatLib';

describe('resolveParentForkMsgIdFromMessages', () => {
  it('uses the newest message msg_id as fork anchor', () => {
    const forkId = resolveParentForkMsgIdFromMessages([
      { id: 'a', msg_id: 'msg-a', conversation_id: 'p', type: 'text', position: 'right', created_at: 1 } as TMessage,
      { id: 'b', msg_id: 'msg-b', conversation_id: 'p', type: 'text', position: 'left', created_at: 2 } as TMessage,
    ]);
    expect(forkId).toBe('msg-b');
  });

  it('falls back to message id when the newest message has no msg_id', () => {
    const forkId = resolveParentForkMsgIdFromMessages([
      { id: 'a', msg_id: 'msg-a', conversation_id: 'p', type: 'text', position: 'right', created_at: 1 } as TMessage,
      { id: 'b', conversation_id: 'p', type: 'text', position: 'left', created_at: 2 } as TMessage,
    ]);

    expect(forkId).toBe('b');
  });

  it('returns undefined when the parent has no messages yet', () => {
    expect(resolveParentForkMsgIdFromMessages([])).toBeUndefined();
  });
});
