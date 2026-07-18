/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StorageInterceptor } from '@/common/platform/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestStorage = {
  name: string;
  count: number;
};

type TestStorageBridge = {
  interceptor: (interceptor: StorageInterceptor<TestStorage>) => void;
};

const loadStorage = async () => {
  vi.resetModules();
  const [{ bridge }, { buildStorage }] = await Promise.all([
    import('@/common/platform/bridge'),
    import('@/common/platform/storage'),
  ]);
  let incoming: { emit: (name: string, data: unknown) => unknown } | undefined;

  bridge.adapter({
    emit(name, data) {
      return incoming?.emit(name, data);
    },
    on(emitter) {
      incoming = emitter;
    },
  });

  return { buildStorage };
};

const registerMemoryStore = (storage: TestStorageBridge) => {
  const values = new Map<keyof TestStorage, TestStorage[keyof TestStorage]>();
  storage.interceptor({
    get: async <K extends keyof TestStorage>(key: K) => values.get(key) as TestStorage[K],
    set: async <K extends keyof TestStorage>(key: K, value: TestStorage[K]) => {
      values.set(key, value);
      return value;
    },
    remove: async (key) => {
      values.delete(key);
    },
    clear: async () => {
      values.clear();
    },
  });
};

describe('local storage bridge', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('persists and retrieves values through the registered interceptor', async () => {
    const { buildStorage } = await loadStorage();
    const storage = buildStorage<TestStorage>('test.settings');
    registerMemoryStore(storage);

    await storage.set('name', 'AionUi');

    await expect(storage.get('name')).resolves.toBe('AionUi');
  });

  it('supports remove and clear operations', async () => {
    const { buildStorage } = await loadStorage();
    const storage = buildStorage<TestStorage>('test.settings');
    registerMemoryStore(storage);
    await storage.set('name', 'AionUi');
    await storage.set('count', 2);

    await storage.remove('name');
    await expect(storage.get('name')).resolves.toBeUndefined();
    await storage.clear();
    await expect(storage.get('count')).resolves.toBeUndefined();
  });

  it('isolates storage namespaces', async () => {
    const { buildStorage } = await loadStorage();
    const first = buildStorage<TestStorage>('test.first');
    const second = buildStorage<TestStorage>('test.second');
    registerMemoryStore(first);
    registerMemoryStore(second);

    await first.set('name', 'first');

    await expect(first.get('name')).resolves.toBe('first');
    await expect(second.get('name')).resolves.toBeUndefined();
  });
});
