/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Backing storage service for the `aion.storage` API exposed to sandboxed extensions.
 *
 * ## Context
 *
 * Worker 端扩展通过 `aion.storage.get/set/delete` 发起 api-call 消息,
 * SandboxHost 收到后路由到 apiHandlers, 而 apiHandlers 就是由这个类生成的。
 *
 * ## Current status: 未接入
 *
 * 目前 `createSandbox()` 尚未被任何地方调用 (ChannelPlugin 和 Lifecycle hooks
 * 仍在主进程裸跑), 所以这个类暂时没有调用方。它将在 ChannelPlugin/Lifecycle
 * 迁移到 SandboxHost 时被接入, 届时的用法:
 *
 * ```typescript
 * import { getExtensionStorage } from './ExtensionStorage';
 *
 * const storage = getExtensionStorage();
 * await createSandbox({
 *   extensionName: 'my-ext',
 *   extensionDir: '/path/to/ext',
 *   entryPoint: 'main.js',
 *   permissions: manifest.permissions,
 *   apiHandlers: storage.createApiHandlers('my-ext'),
 * });
 * ```
 *
 * ## Storage layout
 *
 * Each extension gets an isolated JSON file:
 *   ~/.aionui/extension-storage/{extensionName}.json
 *
 * All operations are synchronous I/O wrapped in async interface to match the
 * sandbox message protocol. Data is small (per-extension config/state), so
 * this is acceptable without a database.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDataPath } from '@process/utils';
import { isPathWithinDirectory } from './pathSafety';

const STORAGE_DIR_NAME = 'extension-storage';

/**
 * Simple JSON-file-based KV storage for extensions.
 *
 * Each extension gets an isolated JSON file:
 *   ~/.aionui/extension-storage/{extensionName}.json
 *
 * All operations are synchronous I/O wrapped in async interface to match the
 * sandbox message protocol. Data is small (per-extension config/state), so
 * this is acceptable without a database.
 */
export class ExtensionStorage {
  private readonly storageDir: string;
  /** In-memory cache per extension to avoid repeated fs reads. */
  private readonly cache = new Map<string, Record<string, unknown>>();

  constructor(storageDir?: string) {
    this.storageDir = storageDir ?? path.join(getDataPath(), STORAGE_DIR_NAME);
  }

  async get(extensionName: string, key: string): Promise<unknown> {
    const data = this.loadData(extensionName);
    return data[key] ?? null;
  }

  async set(extensionName: string, key: string, value: unknown): Promise<void> {
    const data = this.loadData(extensionName);
    const updated = { ...data, [key]: value };
    this.saveData(extensionName, updated);
  }

  async delete(extensionName: string, key: string): Promise<void> {
    const data = this.loadData(extensionName);
    const { [key]: _, ...rest } = data;
    this.saveData(extensionName, rest);
  }

  /**
   * Create apiHandlers bound to a specific extension, ready to pass to
   * SandboxHostOptions.apiHandlers.
   *
   * Returned keys ('storage.get', 'storage.set', 'storage.delete') match the
   * method names used by `callMainThread()` in sandboxWorker.ts, so the
   * SandboxHost can route Worker api-call messages directly to these handlers.
   */
  createApiHandlers(extensionName: string): Record<string, (...args: unknown[]) => Promise<unknown>> {
    return {
      'storage.get': async (key: unknown) => this.get(extensionName, String(key)),
      'storage.set': async (key: unknown, value: unknown) => this.set(extensionName, String(key), value),
      'storage.delete': async (key: unknown) => this.delete(extensionName, String(key)),
    };
  }

  private getFilePath(extensionName: string): string {
    const filePath = path.join(this.storageDir, `${extensionName}.json`);
    if (!isPathWithinDirectory(filePath, this.storageDir)) {
      throw new Error(`[ExtensionStorage] Invalid extension name: "${extensionName}"`);
    }
    return filePath;
  }

  private loadData(extensionName: string): Record<string, unknown> {
    const cached = this.cache.get(extensionName);
    if (cached) return cached;

    const filePath = this.getFilePath(extensionName);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      this.cache.set(extensionName, data);
      return data;
    } catch {
      // File doesn't exist or is corrupted — start fresh
      const empty: Record<string, unknown> = {};
      this.cache.set(extensionName, empty);
      return empty;
    }
  }

  private saveData(extensionName: string, data: Record<string, unknown>): void {
    fs.mkdirSync(this.storageDir, { recursive: true });
    const filePath = this.getFilePath(extensionName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.cache.set(extensionName, data);
  }
}

/** Lazy singleton — avoids calling getDataPath() at import time (fails outside Electron). */
let _instance: ExtensionStorage | null = null;

export function getExtensionStorage(): ExtensionStorage {
  if (!_instance) {
    _instance = new ExtensionStorage();
  }
  return _instance;
}
