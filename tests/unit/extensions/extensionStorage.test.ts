/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExtensionStorage } from '../../../src/process/extensions/sandbox/ExtensionStorage';

const tempRoots: string[] = [];

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('extensions/ExtensionStorage', () => {
  describe('get/set/delete', () => {
    it('should return null for non-existent key', async () => {
      const storage = new ExtensionStorage(createTempDir('ext-storage-'));
      const result = await storage.get('my-ext', 'missing-key');
      expect(result).toBeNull();
    });

    it('should persist and retrieve a value', async () => {
      const dir = createTempDir('ext-storage-');
      const storage = new ExtensionStorage(dir);

      await storage.set('my-ext', 'theme', 'dark');
      const result = await storage.get('my-ext', 'theme');
      expect(result).toBe('dark');
    });

    it('should persist complex objects', async () => {
      const dir = createTempDir('ext-storage-');
      const storage = new ExtensionStorage(dir);
      const data = { nested: { items: [1, 2, 3] }, flag: true };

      await storage.set('my-ext', 'config', data);
      const result = await storage.get('my-ext', 'config');
      expect(result).toEqual(data);
    });

    it('should delete a key and return null after deletion', async () => {
      const dir = createTempDir('ext-storage-');
      const storage = new ExtensionStorage(dir);

      await storage.set('my-ext', 'temp', 'value');
      await storage.delete('my-ext', 'temp');
      const result = await storage.get('my-ext', 'temp');
      expect(result).toBeNull();
    });

    it('should not throw when deleting a non-existent key', async () => {
      const storage = new ExtensionStorage(createTempDir('ext-storage-'));
      await expect(storage.delete('my-ext', 'ghost')).resolves.toBeUndefined();
    });

    it('should isolate data between extensions', async () => {
      const dir = createTempDir('ext-storage-');
      const storage = new ExtensionStorage(dir);

      await storage.set('ext-a', 'key', 'value-a');
      await storage.set('ext-b', 'key', 'value-b');

      expect(await storage.get('ext-a', 'key')).toBe('value-a');
      expect(await storage.get('ext-b', 'key')).toBe('value-b');
    });

    it('should write JSON files to disk per extension', async () => {
      const dir = createTempDir('ext-storage-');
      const storage = new ExtensionStorage(dir);

      await storage.set('my-ext', 'key', 'value');
      const filePath = path.join(dir, 'my-ext.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(raw.key).toBe('value');
    });

    it('should survive a fresh instance reading from existing file', async () => {
      const dir = createTempDir('ext-storage-');

      const storage1 = new ExtensionStorage(dir);
      await storage1.set('my-ext', 'persistent', 42);

      // New instance, no in-memory cache — should read from disk
      const storage2 = new ExtensionStorage(dir);
      const result = await storage2.get('my-ext', 'persistent');
      expect(result).toBe(42);
    });

    it('should handle corrupted JSON file gracefully', async () => {
      const dir = createTempDir('ext-storage-');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'bad-ext.json'), '{{not json}}', 'utf-8');

      const storage = new ExtensionStorage(dir);
      const result = await storage.get('bad-ext', 'any-key');
      expect(result).toBeNull();
    });
  });

  describe('createApiHandlers', () => {
    it('should return handlers for storage.get, storage.set, storage.delete', () => {
      const storage = new ExtensionStorage(createTempDir('ext-storage-'));
      const handlers = storage.createApiHandlers('my-ext');

      expect(handlers).toHaveProperty('storage.get');
      expect(handlers).toHaveProperty('storage.set');
      expect(handlers).toHaveProperty('storage.delete');
      expect(typeof handlers['storage.get']).toBe('function');
      expect(typeof handlers['storage.set']).toBe('function');
      expect(typeof handlers['storage.delete']).toBe('function');
    });

    it('should route get/set/delete through bound extension name', async () => {
      const dir = createTempDir('ext-storage-');
      const storage = new ExtensionStorage(dir);
      const handlers = storage.createApiHandlers('bound-ext');

      await handlers['storage.set']('color', 'blue');
      const result = await handlers['storage.get']('color');
      expect(result).toBe('blue');

      await handlers['storage.delete']('color');
      const afterDelete = await handlers['storage.get']('color');
      expect(afterDelete).toBeNull();
    });
  });
});
