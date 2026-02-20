/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SwarmFeedManager } from '../../../src/agent/swarm/SwarmFeedManager';

describe('SwarmFeedManager', () => {
  let feedManager: SwarmFeedManager;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-test-'));
    feedManager = new SwarmFeedManager(tmpDir, '.swarm/feed.jsonl');
    feedManager.init();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('init creates .swarm directory and empty feed file', () => {
    expect(fs.existsSync(path.join(tmpDir, '.swarm'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.swarm', 'feed.jsonl'))).toBe(true);
  });

  test('append adds entry with auto-incremented seq', () => {
    feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'Task A' });
    feedManager.append({ from: 'navigator', to: 'driver', type: 'directive', content: 'Do X' });

    const entries = feedManager.readAll();
    expect(entries).toHaveLength(2);
    expect(entries[0].seq).toBe(1);
    expect(entries[1].seq).toBe(2);
    expect(entries[1].from).toBe('navigator');
  });

  test('append generates unique IDs and timestamps', () => {
    feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'Task A' });
    feedManager.append({ from: 'navigator', to: 'driver', type: 'directive', content: 'Do X' });

    const entries = feedManager.readAll();
    expect(entries[0].id).toBeDefined();
    expect(entries[1].id).toBeDefined();
    expect(entries[0].id).not.toBe(entries[1].id);
    expect(entries[0].ts).toBeDefined();
  });

  test('readNewFor returns only messages addressed to the role', () => {
    feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'Task' });
    feedManager.append({ from: 'navigator', to: 'driver', type: 'directive', content: 'Do X' });
    feedManager.append({ from: 'driver', to: 'navigator', type: 'action', content: 'Did X' });

    const forDriver = feedManager.readNewFor('driver');
    expect(forDriver).toHaveLength(2); // user→all + navigator→driver
    expect(forDriver[0].content).toBe('Task');
    expect(forDriver[1].content).toBe('Do X');

    const forNavigator = feedManager.readNewFor('navigator');
    expect(forNavigator).toHaveLength(2); // user→all + driver→navigator
  });

  test('readNewFor respects cursor — does not return already-read messages', () => {
    feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'Task' });
    feedManager.readNewFor('driver'); // advance cursor

    feedManager.append({ from: 'navigator', to: 'driver', type: 'directive', content: 'Do Y' });
    const newMessages = feedManager.readNewFor('driver');
    expect(newMessages).toHaveLength(1);
    expect(newMessages[0].content).toBe('Do Y');
  });

  test('isDone returns true when done entry exists', () => {
    feedManager.append({ from: 'navigator', to: 'all', type: 'done', content: 'Complete' });
    expect(feedManager.isDone()).toBe(true);
  });

  test('isDone returns false when no done entry', () => {
    feedManager.append({ from: 'navigator', to: 'driver', type: 'directive', content: 'Work' });
    expect(feedManager.isDone()).toBe(false);
  });

  test('getSeq returns current sequence number', () => {
    expect(feedManager.getSeq()).toBe(0);
    feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'Task' });
    expect(feedManager.getSeq()).toBe(1);
    feedManager.append({ from: 'navigator', to: 'driver', type: 'directive', content: 'Do X' });
    expect(feedManager.getSeq()).toBe(2);
  });

  test('readAll returns empty array for empty feed', () => {
    const entries = feedManager.readAll();
    expect(entries).toEqual([]);
  });

  test('recovers state from existing feed on re-init', () => {
    feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'Task' });
    feedManager.append({ from: 'navigator', to: 'driver', type: 'directive', content: 'Do X' });

    // Create a new manager from the same path
    const feedManager2 = new SwarmFeedManager(tmpDir, '.swarm/feed.jsonl');
    feedManager2.init();

    expect(feedManager2.getSeq()).toBe(2);
    const entries = feedManager2.readAll();
    expect(entries).toHaveLength(2);
  });

  test('append sets initial status to pending', () => {
    feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'Task' });
    const entries = feedManager.readAll();
    expect(entries[0].status).toBe('pending');
  });

  test('updateStatus changes status of a specific entry', () => {
    feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'A' });
    feedManager.append({ from: 'driver', to: 'navigator', type: 'directive', content: 'B' });

    const entries = feedManager.readAll();
    feedManager.updateStatus(entries[0].id, 'delivered');

    const updated = feedManager.readAll();
    expect(updated[0].status).toBe('delivered');
    expect(updated[1].status).toBe('pending'); // unchanged
  });

  test('markDelivered updates multiple entries', () => {
    feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'A' });
    feedManager.append({ from: 'driver', to: 'navigator', type: 'directive', content: 'B' });

    const entries = feedManager.readAll();
    feedManager.markDelivered(entries);

    const updated = feedManager.readAll();
    expect(updated[0].status).toBe('delivered');
    expect(updated[1].status).toBe('delivered');
  });

  test('markProcessed updates entry status', () => {
    const entry = feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'A' });
    feedManager.markProcessed(entry.id);

    const updated = feedManager.readAll();
    expect(updated[0].status).toBe('processed');
  });
});
