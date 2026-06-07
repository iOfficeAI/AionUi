/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { createDebouncedBatch, type DebouncedBatch } from './debounce';
import { shouldIgnoreIndexPath, toWorkspaceRelativePath, type IndexIgnoreOptions } from './ignore';

const DEFAULT_DEBOUNCE_MS = 300;
const IS_RECURSIVE_FS_WATCH_SUPPORTED = process.platform === 'darwin' || process.platform === 'win32';

export type RawWatcherEvent = {
  relativePath: string;
  absolutePath: string;
  kind: 'change' | 'delete';
};

export type ChislIndexWatcherOptions = IndexIgnoreOptions & {
  workspaceRoot: string;
  debounceMs?: number;
};

export type ChislIndexWatcherEvents = {
  event: (events: readonly RawWatcherEvent[]) => void;
  error: (error: unknown) => void;
};

export class ChislIndexWatcher {
  private readonly workspaceRoot: string;
  private readonly options: IndexIgnoreOptions;
  private readonly debounceMs: number;
  private readonly emitter = new EventEmitter();
  private readonly batch: DebouncedBatch<RawWatcherEvent>;
  private readonly watchers: Set<{ close(): void }> = new Set();
  private started = false;
  private pendingDirsToWatch: Promise<void> | null = null;

  constructor(options: ChislIndexWatcherOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.options = options;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.batch = createDebouncedBatch<RawWatcherEvent>(this.debounceMs, (items) => {
      this.emitter.emit('event', items);
    });
  }

  on<K extends keyof ChislIndexWatcherEvents>(event: K, listener: ChislIndexWatcherEvents[K]): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof ChislIndexWatcherEvents>(event: K, listener: ChislIndexWatcherEvents[K]): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  get isRunning(): boolean {
    return this.started;
  }

  start(): void {
    if (this.started) return;
    if (!existsSync(this.workspaceRoot)) {
      throw new Error(`Chisl index watcher root does not exist: ${this.workspaceRoot}`);
    }
    this.started = true;
    try {
      if (IS_RECURSIVE_FS_WATCH_SUPPORTED) {
        this.attachRecursiveWatcher(this.workspaceRoot);
      } else {
        this.pendingDirsToWatch = this.attachPerDirectoryWatchers(this.workspaceRoot).catch((err) => {
          this.emitter.emit('error', err);
        });
      }
    } catch (err) {
      this.started = false;
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch {
        // ignore close errors
      }
    }
    this.watchers.clear();
    this.batch.clear();
    if (this.pendingDirsToWatch) {
      try {
        await this.pendingDirsToWatch;
      } catch {
        // ignore
      }
      this.pendingDirsToWatch = null;
    }
    this.emitter.removeAllListeners();
  }

  /** Flush any debounced events immediately. */
  flush(): void {
    this.batch.flush();
  }

  private attachRecursiveWatcher(dir: string): void {
    // Lazy require so test environments without native fs.watch can still load the module.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs');
    const handle = fs.watch(dir, { recursive: true, persistent: false }, (eventType, filename) => {
      if (!filename) return;
      this.handleNativeEvent(dir, filename.toString(), eventType);
    });
    handle.on('error', (err) => this.emitter.emit('error', err));
    this.watchers.add(handle);
  }

  private async attachPerDirectoryWatchers(dir: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs');
    const visited = new Set<string>();

    const watchOne = (absoluteDir: string) => {
      if (visited.has(absoluteDir)) return;
      visited.add(absoluteDir);
      const handle = fs.watch(absoluteDir, { persistent: false }, (eventType, filename) => {
        if (!filename) return;
        this.handleNativeEvent(absoluteDir, filename.toString(), eventType);
        // On Linux we don't get recursive events; rescan this directory for new subdirs.
        void this.rescanDirectory(absoluteDir);
      });
      handle.on('error', (err) => this.emitter.emit('error', err));
      this.watchers.add(handle);
    };

    watchOne(dir);
    await this.rescanDirectory(dir);
  }

  private async rescanDirectory(dir: string): Promise<void> {
    let entries: import('fs').Dirent<string>[];
    try {
      entries = await readdir(dir, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childAbsolute = path.join(dir, entry.name);
      const childRelative = path.relative(this.workspaceRoot, childAbsolute).split(path.sep).join('/');
      if (shouldIgnoreIndexPath(childRelative, childAbsolute, this.options)) continue;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs') as typeof import('fs');
      try {
        const handle = fs.watch(childAbsolute, { persistent: false }, (eventType, filename) => {
          if (!filename) return;
          this.handleNativeEvent(childAbsolute, filename.toString(), eventType);
          void this.rescanDirectory(childAbsolute);
        });
        handle.on('error', (err) => this.emitter.emit('error', err));
        this.watchers.add(handle);
      } catch {
        // ignore individual watch errors
      }
    }
  }

  private handleNativeEvent(baseDir: string, filename: string, eventType: string): void {
    const absolutePath = path.resolve(baseDir, filename);
    const relativePath = toWorkspaceRelativePath(this.workspaceRoot, absolutePath);
    if (!relativePath) return;
    if (shouldIgnoreIndexPath(relativePath, absolutePath, this.options)) return;

    if (eventType === 'rename') {
      // Treat rename as delete when the file no longer exists, otherwise as a change.
      void this.classifyRename(relativePath, absolutePath);
      return;
    }

    this.batch.add({ relativePath, absolutePath, kind: 'change' });
  }

  private async classifyRename(relativePath: string, absolutePath: string): Promise<void> {
    try {
      const s = await stat(absolutePath);
      if (s.isFile()) {
        this.batch.add({ relativePath, absolutePath, kind: 'change' });
      } else {
        this.batch.add({ relativePath, absolutePath, kind: 'delete' });
      }
    } catch {
      this.batch.add({ relativePath, absolutePath, kind: 'delete' });
    }
  }
}
