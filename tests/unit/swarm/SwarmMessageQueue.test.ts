/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SwarmMessageQueue } from '../../../src/agent/swarm/SwarmMessageQueue';

describe('SwarmMessageQueue', () => {
  let mq: SwarmMessageQueue;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-mq-test-'));
    mq = new SwarmMessageQueue(tmpDir, 'driver');
    mq.init();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('init creates .swarm directory and MQ file', () => {
    expect(fs.existsSync(path.join(tmpDir, '.swarm'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.swarm', 'driver-mq.jsonl'))).toBe(true);
  });

  test('enqueue adds entry with pending status', () => {
    const entry = mq.enqueue({ content: 'Do X', source: 'hook' });

    expect(entry.id).toBeDefined();
    expect(entry.seq).toBe(1);
    expect(entry.role).toBe('driver');
    expect(entry.status).toBe('pending');
    expect(entry.content).toBe('Do X');
    expect(entry.source).toBe('hook');
  });

  test('enqueue auto-increments seq', () => {
    mq.enqueue({ content: 'A', source: 'hook' });
    mq.enqueue({ content: 'B', source: 'hook' });

    const entries = mq.readAll();
    expect(entries[0].seq).toBe(1);
    expect(entries[1].seq).toBe(2);
  });

  test('markDelivered updates status in file', () => {
    const entry = mq.enqueue({ content: 'Do X', source: 'hook' });
    mq.markDelivered(entry.id);

    const entries = mq.readAll();
    expect(entries[0].status).toBe('delivered');
    expect(entries[0].updatedAt).not.toBe(entries[0].createdAt);
  });

  test('markProcessed updates status in file', () => {
    const entry = mq.enqueue({ content: 'Do X', source: 'hook' });
    mq.markDelivered(entry.id);
    mq.markProcessed(entry.id);

    const entries = mq.readAll();
    expect(entries[0].status).toBe('processed');
  });

  test('markError updates status in file', () => {
    const entry = mq.enqueue({ content: 'Do X', source: 'hook' });
    mq.markError(entry.id);

    const entries = mq.readAll();
    expect(entries[0].status).toBe('error');
  });

  test('getPending returns only pending entries', () => {
    const e1 = mq.enqueue({ content: 'A', source: 'hook' });
    mq.enqueue({ content: 'B', source: 'hook' });
    mq.markDelivered(e1.id);

    const pending = mq.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].content).toBe('B');
  });

  test('getRecoverable returns pending and delivered entries', () => {
    const e1 = mq.enqueue({ content: 'A', source: 'hook' });
    const e2 = mq.enqueue({ content: 'B', source: 'hook' });
    const e3 = mq.enqueue({ content: 'C', source: 'hook' });
    mq.markDelivered(e1.id);
    mq.markProcessed(e2.id);
    // e3 stays pending

    const recoverable = mq.getRecoverable();
    expect(recoverable).toHaveLength(2); // e1 (delivered) + e3 (pending)
    expect(recoverable.map((e) => e.content).sort()).toEqual(['A', 'C']);
  });

  test('enqueue preserves files', () => {
    const entry = mq.enqueue({
      content: 'Do X',
      source: 'hook',
      files: ['src/a.ts', 'src/b.ts'],
    });

    const entries = mq.readAll();
    expect(entries[0].files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  test('recovers seq from existing file', () => {
    mq.enqueue({ content: 'A', source: 'hook' });
    mq.enqueue({ content: 'B', source: 'hook' });

    // Create a new MQ instance from the same path
    const mq2 = new SwarmMessageQueue(tmpDir, 'driver');
    mq2.init();

    const entry = mq2.enqueue({ content: 'C', source: 'hook' });
    expect(entry.seq).toBe(3); // continues from existing seq
  });

  test('status updates do not affect other entries', () => {
    const e1 = mq.enqueue({ content: 'A', source: 'hook' });
    const e2 = mq.enqueue({ content: 'B', source: 'hook' });
    mq.markDelivered(e1.id);

    const entries = mq.readAll();
    expect(entries[0].status).toBe('delivered');
    expect(entries[1].status).toBe('pending'); // unchanged
  });

  test('getFilePath returns correct path', () => {
    expect(mq.getFilePath()).toBe(path.join(tmpDir, '.swarm', 'driver-mq.jsonl'));
  });

  test('getRole returns the role', () => {
    expect(mq.getRole()).toBe('driver');
  });

  test('navigator queue uses correct filename', () => {
    const navMq = new SwarmMessageQueue(tmpDir, 'navigator');
    navMq.init();
    expect(navMq.getFilePath()).toBe(path.join(tmpDir, '.swarm', 'navigator-mq.jsonl'));
    expect(fs.existsSync(navMq.getFilePath())).toBe(true);
  });
});
