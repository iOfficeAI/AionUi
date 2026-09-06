/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { CollisionDetection, DroppableContainer } from '@dnd-kit/core';
import {
  GAP_COLLISION,
  collisionDetection,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/ConversationDragContext';
import type { ConversationDropTarget } from '@/renderer/pages/conversation/GroupedHistory/utils/conversationDropTargets';

type Args = Parameters<CollisionDetection>[0];

const container = (id: string, data: ConversationDropTarget): DroppableContainer =>
  ({
    id,
    key: id,
    data: { current: data },
    disabled: false,
    node: { current: null },
    rect: { current: null },
  }) as unknown as DroppableContainer;

const rect = (top: number, height = 34) => ({ top, height, left: 0, width: 300, bottom: top + height, right: 300 });

/** Two plain rows, a block, and a row inside it, stacked with the list's 2px gap. */
const rows = [
  container('a', { kind: 'conversation', conversation_id: 'a', surface: 'row' }),
  container('b', { kind: 'conversation', conversation_id: 'b', surface: 'row' }),
  container('split-group:g1', { kind: 'split_group', group_id: 'g1' }),
  container('chat-area:a', { kind: 'conversation', conversation_id: 'a', surface: 'chat' }),
];
const rects = new Map([
  ['a', rect(100)],
  ['b', rect(136)],
  ['split-group:g1', rect(172, 82)],
  ['chat-area:a', { top: 0, height: 800, left: 400, width: 1000, bottom: 800, right: 1400 }],
]);

const argsAt = (x: number, y: number): Args =>
  ({
    active: { id: 'm1', data: { current: {} }, rect: { current: { initial: null, translated: null } } },
    collisionRect: { top: y - 10, bottom: y + 10, left: x - 10, right: x + 10, width: 20, height: 20 },
    droppableContainers: rows,
    droppableRects: rects,
    pointerCoordinates: { x, y },
  }) as unknown as Args;

describe('collisionDetection for the sidebar drag', () => {
  it('reports the droppable under the pointer as an ordinary collision', () => {
    const [hit] = collisionDetection(argsAt(150, 117));
    expect(hit.id).toBe('a');
    expect(hit.data?.[GAP_COLLISION]).toBeUndefined();
  });

  it('marks a pick from the gap beside an unpinned row as a gap collision', () => {
    // 135.5 is in the 2px gap between row a (ends 134) and row b (starts 136), nearer b.
    const [hit] = collisionDetection(argsAt(150, 135.5));
    expect(hit.id).toBe('b');
    expect(hit.data?.[GAP_COLLISION]).toBe(true);
  });

  it('marks a pick from the gap beside a split-group block the same way', () => {
    // 171.5 is between row b (ends 170) and the block (starts 172), nearer the block.
    const [hit] = collisionDetection(argsAt(150, 171.5));
    expect(hit.id).toBe('split-group:g1');
    expect(hit.data?.[GAP_COLLISION]).toBe(true);
  });

  it('reports nothing over blank space, so a release there fuses nothing', () => {
    expect(collisionDetection(argsAt(150, 600))).toEqual([]);
  });
});
