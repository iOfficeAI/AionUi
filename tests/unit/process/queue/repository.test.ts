/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the Chisl queue repository (forge-5-01-03).
 * Uses an in-memory SQLite database so the actual schema and SQL run.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  openChislQueueStore,
  createChislQueueItem,
  getChislQueueItem,
  listChislQueueItems,
  listNonTerminalChislQueueItems,
  updateChislQueueItem,
  deleteChislQueueItem,
  type ChislQueueStore,
} from '@/process/services/queue/repository';
import { initChislQueueSchema, CHISL_QUEUE_TABLES } from '@/process/services/queue/schema';

let store: ChislQueueStore;

beforeEach(() => {
  store = openChislQueueStore(':memory:');
});

afterEach(() => {
  store.close();
});

function listTableNames(): string[] {
  return (store.driver
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[]).map((row) => row.name);
}

describe('openChislQueueStore', () => {
  it('initializes the queue schema on open', () => {
    const tables = listTableNames();
    for (const expected of CHISL_QUEUE_TABLES) {
      expect(tables).toContain(expected);
    }
  });

  it('initializing twice is idempotent', () => {
    initChislQueueSchema(store.driver);
    const tables = listTableNames();
    const counts = new Map<string, number>();
    for (const t of tables) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [, count] of counts) {
      expect(count).toBe(1);
    }
  });
});

describe('createChislQueueItem', () => {
  it('inserts a row with all required fields and default status queued', () => {
    const item = createChislQueueItem(store, {
      command_type: 'prompt',
      payload: { text: 'hello' },
    });
    expect(item.id).toMatch(/[0-9a-f-]{36}/i);
    expect(item.status).toBe('queued');
    expect(item.payload).toEqual({ text: 'hello' });
    expect(item.retryCount).toBe(0);
    expect(item.maxRetries).toBe(3);
  });

  it('auto-allocates monotonic per-session order', () => {
    const a = createChislQueueItem(store, {
      command_type: 'prompt',
      payload: {},
      session_id: 's1',
    });
    const b = createChislQueueItem(store, {
      command_type: 'prompt',
      payload: {},
      session_id: 's1',
    });
    const c = createChislQueueItem(store, {
      command_type: 'prompt',
      payload: {},
      session_id: 's2',
    });
    expect(b.sessionOrder).toBe(a.sessionOrder + 1);
    expect(c.sessionOrder).toBe(0);
  });
});

describe('durable round-trip', () => {
  it('persists and reloads non-terminal items', () => {
    const created = createChislQueueItem(store, {
      command_type: 'prompt',
      payload: { foo: 'bar' },
      session_id: 's1',
      metadata: { source: 'test' },
    });
    const updated = updateChislQueueItem(store, created.id, {
      status: 'running',
    });
    expect(updated?.status).toBe('running');
    const loaded = getChislQueueItem(store, created.id);
    expect(loaded?.status).toBe('running');
    expect(loaded?.metadata).toEqual({ source: 'test' });
  });

  it('lists non-terminal items only', () => {
    const a = createChislQueueItem(store, {
      command_type: 'prompt',
      payload: {},
      session_id: 's1',
    });
    const b = createChislQueueItem(store, {
      command_type: 'prompt',
      payload: {},
      session_id: 's2',
    });
    updateChislQueueItem(store, a.id, { status: 'complete' });
    updateChislQueueItem(store, b.id, { status: 'running' });
    const nonTerminal = listNonTerminalChislQueueItems(store);
    expect(nonTerminal).toHaveLength(1);
    expect(nonTerminal[0]?.id).toBe(b.id);
    const all = listChislQueueItems(store);
    expect(all).toHaveLength(2);
  });

  it('survives store close and reopen via on-disk path', () => {
    const tmp = `/tmp/chisl-queue-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const first = openChislQueueStore(tmp);
    const created = createChislQueueItem(first, {
      command_type: 'prompt',
      payload: { hi: 1 },
      session_id: 's1',
    });
    first.close();

    const second = openChislQueueStore(tmp);
    const loaded = getChislQueueItem(second, created.id);
    expect(loaded?.payload).toEqual({ hi: 1 });
    second.close();
  });

  it('deleteChislQueueItem removes the row', () => {
    const created = createChislQueueItem(store, {
      command_type: 'prompt',
      payload: {},
    });
    deleteChislQueueItem(store, created.id);
    expect(getChislQueueItem(store, created.id)).toBeNull();
  });
});
