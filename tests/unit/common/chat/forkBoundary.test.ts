/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { messagesAfterForkBoundary } from '@/common/chat/forkBoundary';
import type { TMessage } from '@/common/chat/chatLib';

const message = (id: string): TMessage => ({ id, msg_id: id }) as unknown as TMessage;

describe('messagesAfterForkBoundary', () => {
  it('returns the list unchanged without a boundary', () => {
    const list = [message('a'), message('b')];
    expect(messagesAfterForkBoundary(list, undefined)).toBe(list);
  });

  it('drops everything up to and including the fork anchor', () => {
    const list = [message('p1'), message('p2'), message('anchor'), message('s1'), message('s2')];
    expect(messagesAfterForkBoundary(list, 'anchor').map((m) => m.id)).toEqual(['s1', 's2']);
  });

  it('matches by row id when msg_id is absent', () => {
    const list = [{ id: 'row-anchor' } as unknown as TMessage, { id: 's1' } as unknown as TMessage];
    expect(messagesAfterForkBoundary(list, 'row-anchor').map((m) => m.id)).toEqual(['s1']);
  });

  it('returns the list unchanged when the boundary is older than the window', () => {
    const list = [message('s1'), message('s2')];
    expect(messagesAfterForkBoundary(list, 'anchor')).toBe(list);
  });
});
