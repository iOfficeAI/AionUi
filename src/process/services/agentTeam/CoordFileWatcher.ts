/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ICoordTimelineEntry } from './types';

/**
 * Watches a coord messages.jsonl file for new appended lines.
 * Uses fs.watch with debounce and byte-offset tracking for incremental reads.
 */
export class CoordFileWatcher {
  private watcher: fs.FSWatcher | null = null;
  private byteOffset = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;
  private readonly messagesPath: string;
  private onNewMessages: ((messages: ICoordTimelineEntry[]) => void) | null = null;
  private destroyed = false;

  constructor(coordDir: string, debounceMs = 100) {
    this.messagesPath = path.join(coordDir, 'messages.jsonl');
    this.debounceMs = debounceMs;
  }

  /** Start watching. Calls callback with new messages on each change. */
  start(callback: (messages: ICoordTimelineEntry[]) => void): void {
    if (this.destroyed) return;
    this.onNewMessages = callback;

    // Initialize byte offset to current file size (skip existing content)
    try {
      const stats = fs.statSync(this.messagesPath);
      this.byteOffset = stats.size;
    } catch {
      // File doesn't exist yet, start from 0
      this.byteOffset = 0;
    }

    // Ensure the file exists before watching
    const dir = path.dirname(this.messagesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.messagesPath)) {
      fs.writeFileSync(this.messagesPath, '', 'utf-8');
    }

    try {
      this.watcher = fs.watch(this.messagesPath, () => {
        this.scheduleRead();
      });

      this.watcher.on('error', (err) => {
        console.error('[CoordFileWatcher] Watch error:', err.message);
      });
    } catch (err) {
      console.error('[CoordFileWatcher] Failed to start watching:', err);
    }
  }

  /** Stop watching and clean up */
  stop(): void {
    this.destroyed = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.onNewMessages = null;
  }

  /** Read all messages from the beginning (for timeline snapshot) */
  readAll(): ICoordTimelineEntry[] {
    try {
      const content = fs.readFileSync(this.messagesPath, 'utf-8');
      return this.parseLines(content);
    } catch {
      return [];
    }
  }

  private scheduleRead(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.readNewLines();
    }, this.debounceMs);
  }

  private readNewLines(): void {
    if (this.destroyed || !this.onNewMessages) return;

    try {
      const stats = fs.statSync(this.messagesPath);
      if (stats.size <= this.byteOffset) return;

      const fd = fs.openSync(this.messagesPath, 'r');
      const bufferSize = stats.size - this.byteOffset;
      const buffer = Buffer.alloc(bufferSize);
      fs.readSync(fd, buffer, 0, bufferSize, this.byteOffset);
      fs.closeSync(fd);

      this.byteOffset = stats.size;

      const newContent = buffer.toString('utf-8');
      const messages = this.parseLines(newContent);

      if (messages.length > 0) {
        this.onNewMessages(messages);
      }
    } catch (err) {
      console.error('[CoordFileWatcher] Read error:', err);
    }
  }

  private parseLines(content: string): ICoordTimelineEntry[] {
    const messages: ICoordTimelineEntry[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        messages.push(JSON.parse(trimmed) as ICoordTimelineEntry);
      } catch {
        console.warn('[CoordFileWatcher] Failed to parse line:', trimmed.slice(0, 80));
      }
    }
    return messages;
  }
}
