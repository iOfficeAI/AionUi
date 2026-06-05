/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the Chisl queue SQLite schema (forge-5-01-03).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initChislQueueSchema, CHISL_QUEUE_TABLES } from '@/process/services/queue/schema';
import { openChislQueueStore, type ChislQueueStore } from '@/process/services/queue/repository';

let store: ChislQueueStore;

beforeEach(() => {
  store = openChislQueueStore(':memory:');
});

afterEach(() => {
  store.close();
});

function listTables(): string[] {
  return (store.driver
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`
    )
    .all() as { name: string }[]).map((row) => row.name);
}

function listIndexes(table: string): string[] {
  return (store.driver
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? ORDER BY name ASC`)
    .all(table) as { name: string }[]).map((row) => row.name);
}

describe('initChislQueueSchema', () => {
  it('creates all required Chisl queue tables', () => {
    const tables = listTables();
    for (const expected of CHISL_QUEUE_TABLES) {
      expect(tables).toContain(expected);
    }
  });

  it('is idempotent when invoked repeatedly', () => {
    initChislQueueSchema(store.driver);
    initChislQueueSchema(store.driver);
    const tables = listTables();
    for (const expected of CHISL_QUEUE_TABLES) {
      expect(tables.filter((name) => name === expected)).toHaveLength(1);
    }
  });
});

describe('queue_items indexes', () => {
  it('creates the status, session_id, and session_order indexes', () => {
    const indexes = listIndexes('queue_items');
    expect(indexes).toContain('idx_queue_items_status');
    expect(indexes).toContain('idx_queue_items_session_id');
    expect(indexes).toContain('idx_queue_items_session_order');
  });
});
