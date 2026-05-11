/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for common/config/configMigration.ts (T4 in N3 test checklist).
 * Tests config and provider migration logic with mocked dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
// Phase 8 §8.5 gate: N3 helper must be imported by at least one N3 domain test.
// Consumed by the helper smoke-test block at the bottom; plan explicitly allows
// an extra demo test that is NOT counted against the T1-T6 clause.
import { createMockHttpBridge } from '../_helpers/mockHttpBridge';

// Mock dependencies BEFORE importing the module under test
vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: { invoke: vi.fn(), provider: vi.fn() },
      createProvider: { invoke: vi.fn(), provider: vi.fn() },
    },
  },
}));

// Import after mocks are registered
import { migrateConfigStorage, migrateProviders, type ConfigFile } from '@/common/config/configMigration';
import { httpRequest } from '@/common/adapter/httpBridge';
import { ipcBridge } from '@/common';

describe('configMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('migrateConfigStorage', () => {
    it('skips migration when already done flag is set', async () => {
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'migration.configStorageDone') return Promise.resolve(true);
          return Promise.reject(new Error('not found'));
        }),
        set: vi.fn(),
      };
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateConfigStorage(configFile);

      expect(httpRequest).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('already done'));
    });

    it('skips migration when no keys are found', async () => {
      const configFile: ConfigFile = {
        get: vi.fn().mockRejectedValue(new Error('not found')),
        set: vi.fn(),
      };
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateConfigStorage(configFile);

      // Only the GET for existing keys check, no PUT
      expect(httpRequest).not.toHaveBeenCalledWith('PUT', expect.anything(), expect.anything());
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('skipped'));
      expect(configFile.set).toHaveBeenCalledWith('migration.configStorageDone', true);
    });

    it('collects multiple legacy keys and sends one PUT with merge strategy', async () => {
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'migration.configStorageDone') return Promise.reject(new Error('not found'));
          if (key === 'language') return Promise.resolve('zh-CN');
          if (key === 'theme') return Promise.resolve('dark');
          return Promise.reject(new Error('not found'));
        }),
        set: vi.fn(),
      };
      // GET returns empty (no existing keys) → all legacy keys are new
      (httpRequest as ReturnType<typeof vi.fn>).mockImplementation((method: string) => {
        if (method === 'GET') return Promise.resolve({});
        return Promise.resolve(undefined);
      });
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateConfigStorage(configFile);

      expect(httpRequest).toHaveBeenCalledWith('PUT', '/api/settings/client', {
        language: 'zh-CN',
        theme: 'dark',
      });
      expect(configFile.set).toHaveBeenCalledWith('migration.configStorageDone', true);
    });

    it('skips keys that already exist in backend (merge strategy)', async () => {
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'migration.configStorageDone') return Promise.reject(new Error('not found'));
          if (key === 'language') return Promise.resolve('en');
          if (key === 'theme') return Promise.resolve('dark');
          return Promise.reject(new Error('not found'));
        }),
        set: vi.fn(),
      };
      // GET returns 'theme' as already existing → only 'language' should be written
      (httpRequest as ReturnType<typeof vi.fn>).mockImplementation((method: string) => {
        if (method === 'GET') return Promise.resolve({ theme: 'light' });
        return Promise.resolve(undefined);
      });
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateConfigStorage(configFile);

      expect(httpRequest).toHaveBeenCalledWith('PUT', '/api/settings/client', {
        language: 'en',
      });
    });

    it('ignores null values', async () => {
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'migration.configStorageDone') return Promise.reject(new Error('not found'));
          if (key === 'language') return Promise.resolve('en');
          if (key === 'theme') return Promise.resolve(null);
          return Promise.reject(new Error('not found'));
        }),
        set: vi.fn(),
      };
      (httpRequest as ReturnType<typeof vi.fn>).mockImplementation((method: string) => {
        if (method === 'GET') return Promise.resolve({});
        return Promise.resolve(undefined);
      });
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateConfigStorage(configFile);

      const putCall = (httpRequest as ReturnType<typeof vi.fn>).mock.calls.find((c: unknown[]) => c[0] === 'PUT');
      expect(putCall?.[2]).toEqual({ language: 'en' });
      expect(putCall?.[2]).not.toHaveProperty('theme');
    });

    it('handles configFile.get exceptions by skipping those keys', async () => {
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'migration.configStorageDone') return Promise.reject(new Error('not found'));
          if (key === 'language') return Promise.resolve('en');
          throw new Error('access error');
        }),
        set: vi.fn(),
      };
      (httpRequest as ReturnType<typeof vi.fn>).mockImplementation((method: string) => {
        if (method === 'GET') return Promise.resolve({});
        return Promise.resolve(undefined);
      });
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateConfigStorage(configFile);

      expect(httpRequest).toHaveBeenCalledWith('PUT', '/api/settings/client', {
        language: 'en',
      });
    });
  });

  describe('migrateProviders', () => {
    it('returns early when migration flag is already true', async () => {
      const configFile: ConfigFile = {
        get: vi.fn().mockResolvedValue(true),
        set: vi.fn(),
      };

      await migrateProviders(configFile);

      expect(ipcBridge.mode.listProviders.invoke).not.toHaveBeenCalled();
    });

    it('skips and sets flag when backend already has providers', async () => {
      const configFile: ConfigFile = {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn(),
      };
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'existing' }]);
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(configFile.set).toHaveBeenCalledWith('migration.electronProvidersImported', true);
      expect(ipcBridge.mode.createProvider.invoke).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith(
        '[Migration] providers migration skipped — backend already has %d providers',
        1
      );
    });

    it('migrates 4 legacy providers with field mapping', async () => {
      const legacyProviders = [
        {
          id: 'p1',
          platform: 'openai',
          name: 'Provider 1',
          baseUrl: 'https://api.openai.com',
          apiKey: 'key1',
          model: ['gpt-4'],
          enabled: true,
          contextLimit: 8000,
        },
        {
          id: 'p2',
          platform: 'anthropic',
          name: 'Provider 2',
          baseUrl: 'https://api.anthropic.com',
          apiKey: 'key2',
          model: ['claude-3'],
        },
        {
          id: 'p3',
          platform: 'bedrock',
          name: 'Provider 3',
          baseUrl: '',
          apiKey: '',
          model: ['claude-3-sonnet'],
          bedrockConfig: {
            authMethod: 'accessKey',
            region: 'us-east-1',
            accessKeyId: 'AKIA',
            secretAccessKey: 'secret',
          },
        },
        {
          id: 'p4',
          platform: 'openai',
          name: 'Provider 4',
          baseUrl: 'https://api.openai.com',
          apiKey: 'key4',
          model: ['gpt-3.5-turbo'],
          modelHealth: {
            'gpt-3.5-turbo': {
              status: 'healthy',
              lastCheck: 100,
              latency: 50,
            },
          },
        },
      ];

      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'migration.electronProvidersImported') return Promise.resolve(undefined);
          if (key === 'model.config') return Promise.resolve(legacyProviders as never);
          return Promise.reject(new Error('not found'));
        }),
        set: vi.fn(),
      };
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'created' });
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(ipcBridge.mode.createProvider.invoke).toHaveBeenCalledTimes(4);

      // Verify snake_case field mapping
      const firstCall = (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(firstCall).toEqual({
        id: 'p1',
        platform: 'openai',
        name: 'Provider 1',
        base_url: 'https://api.openai.com',
        api_key: 'key1',
        models: ['gpt-4'],
        enabled: true,
        capabilities: undefined,
        context_limit: 8000,
        model_protocols: undefined,
        model_enabled: undefined,
        model_health: undefined,
        bedrock_config: undefined,
      });

      // Verify bedrockConfig mapping
      const thirdCall = (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>).mock.calls[2][0];
      expect(thirdCall.bedrock_config).toEqual({
        auth_method: 'accessKey',
        region: 'us-east-1',
        access_key_id: 'AKIA',
        secret_access_key: 'secret',
        profile: undefined,
      });

      // Verify modelHealth mapping
      const fourthCall = (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>).mock.calls[3][0];
      expect(fourthCall.model_health).toEqual({
        'gpt-3.5-turbo': {
          status: 'healthy',
          last_check: 100,
          latency: 50,
          error: undefined,
        },
      });

      expect(configFile.set).toHaveBeenCalledWith('migration.electronProvidersImported', true);
    });

    it('continues migration and sets flag even when some providers fail', async () => {
      const legacyProviders = [
        {
          id: 'p1',
          platform: 'openai',
          name: 'Provider 1',
          baseUrl: 'https://api.openai.com',
          apiKey: 'key1',
          model: ['gpt-4'],
        },
        {
          id: 'p2',
          platform: 'anthropic',
          name: 'Provider 2',
          baseUrl: 'https://api.anthropic.com',
          apiKey: 'key2',
          model: ['claude-3'],
        },
      ];

      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'migration.electronProvidersImported') return Promise.resolve(undefined);
          if (key === 'model.config') return Promise.resolve(legacyProviders as never);
          return Promise.reject(new Error('not found'));
        }),
        set: vi.fn(),
      };
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ id: 'p1' })
        .mockRejectedValueOnce(new Error('fail'));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(warnSpy).toHaveBeenCalledWith('[Migration] failed to create provider %s:', 'p2', expect.any(Error));
      expect(configFile.set).toHaveBeenCalledWith('migration.electronProvidersImported', true);
    });

    it('handles missing model.config by setting flag', async () => {
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'migration.electronProvidersImported') return Promise.resolve(undefined);
          return Promise.reject(new Error('not found'));
        }),
        set: vi.fn(),
      };
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(configFile.set).toHaveBeenCalledWith('migration.electronProvidersImported', true);
      expect(ipcBridge.mode.createProvider.invoke).not.toHaveBeenCalled();
    });

    it('handles empty model.config array by setting flag', async () => {
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'migration.electronProvidersImported') return Promise.resolve(undefined);
          if (key === 'model.config') return Promise.resolve([] as never);
          return Promise.reject(new Error('not found'));
        }),
        set: vi.fn(),
      };
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(configFile.set).toHaveBeenCalledWith('migration.electronProvidersImported', true);
      expect(ipcBridge.mode.createProvider.invoke).not.toHaveBeenCalled();
    });
  });

  // Helper smoke test: validates that the N3 frozen helper signature is reachable
  // from a domain test file (satisfies Phase 8 §8.5 grep gate — not counted in T4).
  describe('mockHttpBridge helper reachability (Phase 8 §8.5 smoke)', () => {
    it('createMockHttpBridge exposes the frozen public API surface', () => {
      const mock = createMockHttpBridge({ unmatched: 'warn' });
      expect(typeof mock.onGet).toBe('function');
      expect(typeof mock.onPost).toBe('function');
      expect(typeof mock.emit).toBe('function');
      expect(typeof mock.reset).toBe('function');
      expect(typeof mock.asModule).toBe('function');
      expect(mock.routeCount).toBe(0);
      expect(mock.wsListenerCount).toBe(0);
    });
  });
});
