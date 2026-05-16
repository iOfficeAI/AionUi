/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for common/config/storage.ts runtime exports (T5 in N3 test checklist).
 * Tests ConfigStorage/EnvStorage namespaces and BUILTIN_IMAGE_GEN_ID constant.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock @office-ai/platform with in-memory storage implementation
vi.mock('@office-ai/platform', () => {
  function buildStorage<T extends Record<string, unknown>>(namespace: string) {
    const store = new Map<keyof T, unknown>();
    return {
      namespace,
      get: vi.fn(async <K extends keyof T>(k: K): Promise<T[K] | undefined> => store.get(k) as T[K] | undefined),
      set: vi.fn(async <K extends keyof T>(k: K, v: T[K]): Promise<void> => {
        store.set(k, v);
      }),
      remove: vi.fn(async <K extends keyof T>(k: K): Promise<void> => {
        store.delete(k);
      }),
    };
  }
  return {
    storage: { buildStorage },
  };
});

// Import after mock is registered
import { ConfigStorage, EnvStorage, BUILTIN_IMAGE_GEN_ID } from '@/common/config/storage';

describe('storage runtime exports', () => {
  describe('BUILTIN_IMAGE_GEN_ID', () => {
    it('is "builtin-image-gen" constant', () => {
      expect(BUILTIN_IMAGE_GEN_ID).toBe('builtin-image-gen');
    });
  });

  describe('ConfigStorage', () => {
    it('exposes storage.buildStorage shape (get/set/remove)', () => {
      expect(typeof ConfigStorage.get).toBe('function');
      expect(typeof ConfigStorage.set).toBe('function');
      expect(typeof ConfigStorage.remove).toBe('function');
      expect(ConfigStorage.namespace).toBe('agent.config');
    });

    it('set/get roundtrip with language key', async () => {
      await ConfigStorage.set('language', 'zh-CN');
      const result = await ConfigStorage.get('language');
      expect(result).toBe('zh-CN');
    });
  });

  describe('EnvStorage', () => {
    it('is a different instance from ConfigStorage', () => {
      expect(ConfigStorage).not.toBe(EnvStorage);
      expect(ConfigStorage.namespace).not.toBe(EnvStorage.namespace);
    });

    it('uses "agent.env" namespace', () => {
      expect(EnvStorage.namespace).toBe('agent.env');
    });

    it('set/get roundtrip with aionui.dir object', async () => {
      const dirs = {
        workDir: '/a',
        cacheDir: '/b',
        dataDir: '/c',
        homeDir: '/d',
        tempDir: '/e',
        logDir: '/f',
        modelDir: '/g',
        backupDir: '/h',
      };

      await EnvStorage.set('aionui.dir', dirs);
      const result = await EnvStorage.get('aionui.dir');

      expect(result).toEqual(dirs);
    });
  });

  describe('storage isolation', () => {
    it('ConfigStorage and EnvStorage do not share state', async () => {
      // Set a key in ConfigStorage
      await ConfigStorage.set('language', 'en');

      // Set a different key in EnvStorage
      await EnvStorage.set('aionui.dir', {
        workDir: '/x',
        cacheDir: '/y',
        dataDir: '/z',
        homeDir: '/h',
        tempDir: '/t',
        logDir: '/l',
        modelDir: '/m',
        backupDir: '/b',
      });

      // Verify values are isolated
      const configLang = await ConfigStorage.get('language');
      const envDir = await EnvStorage.get('aionui.dir');

      expect(configLang).toBe('en');
      expect(envDir?.workDir).toBe('/x');

      // Verify EnvStorage does not have ConfigStorage's key
      const envLang = await EnvStorage.get('language' as never);
      expect(envLang).toBeUndefined();
    });
  });
});
