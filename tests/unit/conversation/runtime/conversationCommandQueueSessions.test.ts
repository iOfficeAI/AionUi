/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `@@` session references must survive the draft box.
 *
 * This is the feature's most likely silent failure: a message that goes through
 * the queue and loses its references still sends successfully, and the agent
 * simply never receives the `[[AION_SESSIONS]]` block. Neither layer reports
 * anything. The passthrough therefore gets its own test rather than being
 * assumed from the type carrying the field.
 */

import { describe, expect, it } from 'vitest';
import {
  createQueuedCommandItem,
  normalizeQueueState,
  restoreQueuedCommand,
  updateQueuedCommand,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { uploadFileRef } from '@/common/types/chatFile';

describe('command queue session references', () => {
  it('carries sessions from the enqueue input onto the queued item', () => {
    const item = createQueuedCommandItem({
      input: 'ask them',
      files: [],
      sessions: [{ id: 'conv_target' }],
    });
    expect(item.sessions).toEqual([{ id: 'conv_target' }]);
  });

  it('leaves sessions absent when the user referenced nothing', () => {
    const item = createQueuedCommandItem({ input: 'plain', files: [] });
    expect(item.sessions).toBeUndefined();
  });

  it('normalises an empty selection to absent rather than an empty array', () => {
    const item = createQueuedCommandItem({ input: 'plain', files: [], sessions: [] });
    expect(item.sessions).toBeUndefined();
  });

  it('keeps sessions alongside files', () => {
    const item = createQueuedCommandItem({
      input: 'look and ask',
      files: [uploadFileRef('/a.txt')],
      sessions: [{ id: 'conv_a' }, { id: 'conv_b' }],
    });
    expect(item.files).toHaveLength(1);
    expect(item.sessions).toEqual([{ id: 'conv_a' }, { id: 'conv_b' }]);
  });

  it('survives a persist/restore round trip', () => {
    const state = normalizeQueueState({
      items: [{ id: 'q1', input: 'ask them', files: [], sessions: [{ id: 'conv_target' }], created_at: 1 }],
      isPaused: false,
      mode: 'manual',
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0].sessions).toEqual([{ id: 'conv_target' }]);
  });

  it('tolerates state persisted before the field existed', () => {
    const state = normalizeQueueState({
      items: [{ id: 'q1', input: 'old', files: [], created_at: 1 }],
      isPaused: false,
      mode: 'manual',
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0].sessions).toBeUndefined();
  });

  it('drops malformed persisted refs without losing the typed message', () => {
    const state = normalizeQueueState({
      items: [
        {
          id: 'q1',
          input: 'ask them',
          files: [],
          sessions: [{ id: '' }, { nope: 1 }, 'conv_x', { id: 'conv_ok' }],
          created_at: 1,
        },
      ],
      isPaused: false,
      mode: 'manual',
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0].input).toBe('ask them');
    expect(state.items[0].sessions).toEqual([{ id: 'conv_ok' }]);
  });

  it('preserves sessions when an unrelated field is edited', () => {
    const item = createQueuedCommandItem({ input: 'old', files: [], sessions: [{ id: 'conv_target' }] });
    const [updated] = updateQueuedCommand([item], item.id, { input: 'new' });
    expect(updated.input).toBe('new');
    expect(updated.sessions).toEqual([{ id: 'conv_target' }]);
  });

  it('preserves sessions when a failed send is promoted back to the front', () => {
    const failed = createQueuedCommandItem({ input: 'ask them', files: [], sessions: [{ id: 'conv_target' }] });
    const other = createQueuedCommandItem({ input: 'other', files: [] });
    const [front] = restoreQueuedCommand([other, failed], failed);
    expect(front.id).toBe(failed.id);
    expect(front.sessions).toEqual([{ id: 'conv_target' }]);
  });
});
