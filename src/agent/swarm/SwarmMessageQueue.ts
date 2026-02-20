/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { uuid } from '@/common/utils';
import type { SwarmMqEntry } from './types';

/**
 * Persistent per-agent message queue backed by a JSONL file.
 *
 * File: .swarm/{role}-mq.jsonl
 *
 * Each entry tracks its lifecycle:
 *   pending   → message queued, not yet sent to the agent
 *   delivered → message sent to the agent process
 *   processed → agent finished processing this message
 *   error     → delivery or processing failed
 *
 * The file is the source of truth — on recovery, pending/delivered
 * entries are re-delivered.
 */
export class SwarmMessageQueue {
  private filePath: string;
  private role: string;
  private seq: number = 0;

  constructor(workspacePath: string, role: string) {
    this.role = role;
    this.filePath = path.join(workspacePath, '.swarm', `${role}-mq.jsonl`);
  }

  /** Initialize the queue file, recover seq from existing entries */
  init(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(this.filePath)) {
      const entries = this.readAll();
      if (entries.length > 0) {
        this.seq = entries[entries.length - 1].seq;
      }
    } else {
      fs.writeFileSync(this.filePath, '', 'utf-8');
    }
  }

  /** Enqueue a new message (status: pending) */
  enqueue(message: { content: string; source: string; priority?: string; files?: string[] }): SwarmMqEntry {
    this.seq++;
    const entry: SwarmMqEntry = {
      id: uuid(),
      seq: this.seq,
      role: this.role,
      status: 'pending',
      content: message.content,
      source: message.source,
      priority: message.priority || 'normal',
      files: message.files,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf-8');
    return entry;
  }

  /** Update the status of an entry by ID. Rewrites the file. */
  updateStatus(entryId: string, status: SwarmMqEntry['status']): void {
    const entries = this.readAll();
    const updated = entries.map((e) => {
      if (e.id === entryId) {
        return { ...e, status, updatedAt: new Date().toISOString() };
      }
      return e;
    });
    this.writeAll(updated);
  }

  /** Mark an entry as delivered */
  markDelivered(entryId: string): void {
    this.updateStatus(entryId, 'delivered');
  }

  /** Mark an entry as processed */
  markProcessed(entryId: string): void {
    this.updateStatus(entryId, 'processed');
  }

  /** Mark an entry as error */
  markError(entryId: string): void {
    this.updateStatus(entryId, 'error');
  }

  /** Get all pending entries (for delivery) */
  getPending(): SwarmMqEntry[] {
    return this.readAll().filter((e) => e.status === 'pending');
  }

  /** Get all recoverable entries (pending or delivered but not yet processed) */
  getRecoverable(): SwarmMqEntry[] {
    return this.readAll().filter((e) => e.status === 'pending' || e.status === 'delivered');
  }

  /** Read all entries */
  readAll(): SwarmMqEntry[] {
    if (!fs.existsSync(this.filePath)) return [];
    const content = fs.readFileSync(this.filePath, 'utf-8').trim();
    if (!content) return [];
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as SwarmMqEntry);
  }

  /** Rewrite the entire file (used for status updates) */
  private writeAll(entries: SwarmMqEntry[]): void {
    const content = entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length > 0 ? '\n' : '');
    fs.writeFileSync(this.filePath, content, 'utf-8');
  }

  /** Get the file path (for inspection/debugging) */
  getFilePath(): string {
    return this.filePath;
  }

  /** Get role */
  getRole(): string {
    return this.role;
  }
}
