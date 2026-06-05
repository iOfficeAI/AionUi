/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  applyChislQueueRetry,
  applyChislQueueStatusTransition,
  bootstrapChislQueueRecovery,
  cancelChislQueueItem,
  classifyChislQueueRetryError,
  createDefaultChislQueueItemFields,
  hasBlockingSameSessionItem,
  isSameSessionDispatchable,
  listGloballyDispatchableItems,
  shouldRetryChislQueueItem,
} from '@/process/services/queue/stateMachine';
import type { ChislQueueItem } from '@/process/services/queue/types';

function item(
  overrides: Partial<ChislQueueItem> & Pick<ChislQueueItem, 'id' | 'sessionID' | 'sessionOrder'>
): ChislQueueItem {
  return createDefaultChislQueueItemFields({
    commandType: 'prompt',
    payload: { text: 'hi' },
    ...overrides,
  });
}

describe('createDefaultChislQueueItemFields', () => {
  it('sets queued defaults and timestamps', () => {
    const created = createDefaultChislQueueItemFields({
      commandType: 'prompt',
      payload: { x: 1 },
    });
    expect(created.status).toBe('queued');
    expect(created.retryCount).toBe(0);
    expect(created.maxRetries).toBe(3);
    expect(created.sessionID).toBeNull();
    expect(created.dispatchedAt).toBeNull();
    expect(created.completedAt).toBeNull();
  });
});

describe('same-session serialization', () => {
  it('blocks dispatch when lower-order item is active', () => {
    const items = [
      item({ id: 'a', sessionID: 's1', sessionOrder: 0, status: 'running' }),
      item({ id: 'b', sessionID: 's1', sessionOrder: 1, status: 'queued' }),
    ];
    expect(hasBlockingSameSessionItem(items, items[1]!)).toBe(true);
    expect(isSameSessionDispatchable(items, items[1]!)).toBe(false);
  });

  it('allows next item after prior reaches terminal state', () => {
    const items = [
      item({ id: 'a', sessionID: 's1', sessionOrder: 0, status: 'complete' }),
      item({ id: 'b', sessionID: 's1', sessionOrder: 1, status: 'queued' }),
    ];
    expect(isSameSessionDispatchable(items, items[1]!)).toBe(true);
  });

  it('blocks permission_reply from dispatch', () => {
    const items = [
      createDefaultChislQueueItemFields({
        id: 'p',
        sessionID: 's1',
        sessionOrder: 0,
        commandType: 'permission_reply',
        payload: {},
      }),
    ];
    expect(isSameSessionDispatchable(items, items[0]!)).toBe(false);
  });
});

describe('cross-session dispatchability', () => {
  it('respects global concurrency limit default 5', () => {
    const active = Array.from({ length: 5 }, (_, i) =>
      item({ id: `active-${i}`, sessionID: `s-${i}`, sessionOrder: 0, status: 'running' })
    );
    const queued = item({ id: 'q', sessionID: 's-new', sessionOrder: 0, status: 'queued' });
    expect(listGloballyDispatchableItems([...active, queued])).toEqual([]);
  });

  it('selects dispatchable items across sessions up to limit', () => {
    const items = [
      item({ id: 'a', sessionID: 's1', sessionOrder: 0, status: 'queued', createdAt: 1 }),
      item({ id: 'b', sessionID: 's2', sessionOrder: 0, status: 'queued', createdAt: 2 }),
      item({ id: 'c', sessionID: 's3', sessionOrder: 0, status: 'queued', createdAt: 3 }),
    ];
    const dispatchable = listGloballyDispatchableItems(items, { globalConcurrencyLimit: 2 });
    expect(dispatchable.map((d) => d.id)).toEqual(['a', 'b']);
  });
});

describe('status transitions', () => {
  it('queued -> dispatching -> running -> complete', () => {
    let current = createDefaultChislQueueItemFields({
      commandType: 'prompt',
      payload: {},
    });
    current = applyChislQueueStatusTransition(current, 'dispatching');
    expect(current.dispatchedAt).not.toBeNull();
    current = applyChislQueueStatusTransition(current, 'running');
    current = applyChislQueueStatusTransition(current, 'complete');
    expect(current.status).toBe('complete');
    expect(current.completedAt).not.toBeNull();
  });
});

describe('retry classification', () => {
  it('classifies retryable errors', () => {
    expect(classifyChislQueueRetryError({ httpStatus: 503 }, 0, 3).retryable).toBe(true);
    expect(classifyChislQueueRetryError({ httpStatus: 429 }, 0, 3).retryable).toBe(true);
    expect(classifyChislQueueRetryError({ code: 'network' }, 0, 3).retryable).toBe(true);
    expect(classifyChislQueueRetryError({ code: 'busy' }, 0, 3).retryable).toBe(true);
  });

  it('classifies non-retryable errors', () => {
    expect(classifyChislQueueRetryError({ httpStatus: 400 }, 0, 3).retryable).toBe(false);
    expect(classifyChislQueueRetryError({ code: 'validation' }, 0, 3).retryable).toBe(false);
    expect(classifyChislQueueRetryError({ httpStatus: 404 }, 0, 3).retryable).toBe(false);
  });

  it('fails when retries exhausted', () => {
    expect(shouldRetryChislQueueItem(
      createDefaultChislQueueItemFields({ commandType: 'prompt', payload: {}, retryCount: 3 }),
      { httpStatus: 503 }
    )).toBe(false);
    const retried = applyChislQueueRetry(
      createDefaultChislQueueItemFields({ commandType: 'prompt', payload: {}, retryCount: 3, maxRetries: 3 }),
      { httpStatus: 503 }
    );
    expect(retried.status).toBe('failed');
  });

  it('requeues on retryable failure', () => {
    const retried = applyChislQueueRetry(
      createDefaultChislQueueItemFields({ commandType: 'prompt', payload: {} }),
      { httpStatus: 503, message: 'down' }
    );
    expect(retried.status).toBe('queued');
    expect(retried.retryCount).toBe(1);
    expect(retried.dispatchedAt).toBeNull();
  });
});

describe('cancellation', () => {
  it('cancels queued items locally', () => {
    const queued = item({ id: 'q', sessionID: 's1', sessionOrder: 0, status: 'queued' });
    const result = cancelChislQueueItem(queued, 'user', []);
    expect(result.outcome).toBe('cancelled_locally');
    if (result.outcome === 'cancelled_locally') {
      expect(result.item.status).toBe('cancelled');
    }
  });

  it('enqueues abort for running items', () => {
    const running = item({ id: 'r', sessionID: 's1', sessionOrder: 0, status: 'running' });
    const result = cancelChislQueueItem(running, 'user', [running]);
    expect(result.outcome).toBe('abort_enqueued');
    if (result.outcome === 'abort_enqueued') {
      expect(result.abortItem.commandType).toBe('abort');
      expect(result.abortItem.parentID).toBe('r');
      expect(result.item.metadata?.cancellationIntent).toBe(true);
    }
  });
});

describe('recovery bootstrap', () => {
  it('does not treat absence from session status as completion', () => {
    const running = item({ id: 'r', sessionID: 'missing', sessionOrder: 0, status: 'running' });
    const result = bootstrapChislQueueRecovery({
      items: [running],
      sessionStatusKnownIds: new Set(['other']),
    });
    expect(result.nonTerminalItems).toHaveLength(1);
    expect(result.absentFromSessionStatusNotCompleted).toHaveLength(1);
    expect(result.absentFromSessionStatusNotCompleted[0]?.status).toBe('running');
    expect(result.absentFromSessionStatusNotCompleted[0]?.status).not.toBe('complete');
  });
});
