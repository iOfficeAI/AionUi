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
    assistants: {
      list: { invoke: vi.fn() },
    },
    channel: {
      getPlatformSettings: { invoke: vi.fn() },
      setAssistantSetting: { invoke: vi.fn() },
      setDefaultModelSetting: { invoke: vi.fn() },
      syncChannelSettings: { invoke: vi.fn() },
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
    (ipcBridge.assistants.list.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (ipcBridge.channel.getPlatformSettings.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (ipcBridge.channel.setAssistantSetting.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (ipcBridge.channel.setDefaultModelSetting.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (ipcBridge.channel.syncChannelSettings.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  describe('migrateConfigStorage', () => {
    it('skips migration when no keys are found', async () => {
      const configFile: ConfigFile = {
        get: vi.fn().mockRejectedValue(new Error('not found')),
        set: vi.fn(),
      };
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateConfigStorage(configFile);

      expect(httpRequest).not.toHaveBeenCalledWith('PUT', expect.anything(), expect.anything());
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('skipped'));
      expect(configFile.set).not.toHaveBeenCalled();
    });

    it('collects multiple legacy keys and sends one PUT with merge strategy', async () => {
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'language') return Promise.resolve('zh-CN');
          if (key === 'theme') return Promise.resolve('dark');
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

      expect(httpRequest).toHaveBeenCalledWith('PUT', '/api/settings/client', {
        language: 'zh-CN',
        theme: 'dark',
      });
      expect(configFile.set).not.toHaveBeenCalled();
    });

    it('skips keys that already exist in backend (merge strategy)', async () => {
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'language') return Promise.resolve('en');
          if (key === 'theme') return Promise.resolve('dark');
          return Promise.reject(new Error('not found'));
        }),
        set: vi.fn(),
      };
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

    it('does not probe removed ACP cache keys during migration', async () => {
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'language') return Promise.resolve('en');
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

      expect(configFile.get).not.toHaveBeenCalledWith('acp.cachedInitializeResult');
      expect(configFile.get).not.toHaveBeenCalledWith('acp.cached_config_options');
      expect(configFile.get).not.toHaveBeenCalledWith('acp.cachedModes');
    });

    it('does not probe removed ACP/Codex legacy config blobs during migration', async () => {
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'language') return Promise.resolve('en');
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

      expect(configFile.get).not.toHaveBeenCalledWith('acp.config');
      expect(configFile.get).not.toHaveBeenCalledWith('codex.config');
    });

    it('migrates legacy channel settings through dedicated channel APIs', async () => {
      const legacyChannelAgent = {
        assistant_id: 'missing_assistant',
        backend: 'codex',
        name: 'Telegram Assistant',
      };
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'assistant.telegram.agent') return Promise.resolve(legacyChannelAgent);
          if (key === 'assistant.telegram.defaultModel') {
            return Promise.resolve({ id: 'provider_1', use_model: 'gpt-5' });
          }
          return Promise.reject(new Error('not found'));
        }),
        set: vi.fn(),
      };
      (httpRequest as ReturnType<typeof vi.fn>).mockImplementation((method: string) => {
        if (method === 'GET') return Promise.resolve({});
        return Promise.resolve(undefined);
      });
      (ipcBridge.assistants.list.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'bare_codex',
          source: 'generated',
          agent_id: 'agent-codex',
          agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
        },
      ]);
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateConfigStorage(configFile);

      expect(httpRequest).not.toHaveBeenCalledWith('PUT', '/api/settings/client', {
        'assistant.telegram.agent': expect.anything(),
        'assistant.telegram.defaultModel': expect.anything(),
      });
      expect(ipcBridge.channel.setAssistantSetting.invoke).toHaveBeenCalledWith({
        platform: 'telegram',
        assistant: { assistant_id: 'bare_codex' },
      });
      expect(ipcBridge.channel.setDefaultModelSetting.invoke).toHaveBeenCalledWith({
        platform: 'telegram',
        default_model: { id: 'provider_1', use_model: 'gpt-5' },
      });
      expect(ipcBridge.channel.syncChannelSettings.invoke).toHaveBeenCalledWith({
        platform: 'telegram',
      });
    });

    it('preserves backend channel settings and skips rewriting existing values', async () => {
      const configFile: ConfigFile = {
        get: vi.fn((key: string) => {
          if (key === 'assistant.telegram.agent') return Promise.resolve({ backend: 'codex' });
          if (key === 'assistant.telegram.defaultModel') {
            return Promise.resolve({ id: 'provider_1', use_model: 'gpt-5' });
          }
          return Promise.reject(new Error('not found'));
        }),
        set: vi.fn(),
      };
      (httpRequest as ReturnType<typeof vi.fn>).mockImplementation((method: string) => {
        if (method === 'GET') return Promise.resolve({});
        return Promise.resolve(undefined);
      });
      (ipcBridge.assistants.list.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'bare_codex',
          source: 'generated',
          agent_id: 'agent-codex',
          agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
        },
      ]);
      (ipcBridge.channel.getPlatformSettings.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
        platform: 'telegram',
        assistant: { assistant_id: 'existing_assistant' },
        default_model: { id: 'provider_existing', use_model: 'o3' },
      });
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateConfigStorage(configFile);

      expect(ipcBridge.channel.setAssistantSetting.invoke).not.toHaveBeenCalled();
      expect(ipcBridge.channel.setDefaultModelSetting.invoke).not.toHaveBeenCalled();
      expect(ipcBridge.channel.syncChannelSettings.invoke).not.toHaveBeenCalled();
    });
  });

  describe('migrateProviders', () => {
    /**
     * In-memory fake of the local config file. Backed by a Map so we can both
     * seed legacy data and assert that the migration sets the completion flag
     * (ELECTRON-1KT). `get` returns `undefined` for missing keys (matching the
     * real JsonFileBuilder behaviour); tests that simulate read failures
     * override `get` directly.
     */
    function makeConfig(seed: Record<string, unknown> = {}): ConfigFile & { store: Map<string, unknown> } {
      const store = new Map<string, unknown>(Object.entries(seed));
      return {
        get: vi.fn(async (key: string) => store.get(key) as never),
        set: vi.fn(async (key: string, value: unknown) => {
          store.set(key, value);
        }),
        store,
      } as unknown as ConfigFile & { store: Map<string, unknown> };
    }

    it('skips when all legacy providers already exist in backend', async () => {
      const legacyProviders = [{ id: 'p1', platform: 'openai', name: 'P1', baseUrl: '', apiKey: '', model: ['gpt-4'] }];
      const configFile = makeConfig({ 'model.config': legacyProviders });
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'p1' }]);
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(ipcBridge.mode.createProvider.invoke).not.toHaveBeenCalled();
      // Legacy field must remain untouched (downgrade safety); only the new
      // completion flag is written.
      expect(configFile.store.get('model.config')).toBe(legacyProviders);
      expect(configFile.store.get('migration.providersMigrated_v1')).toBe(true);
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('already exist in backend'), 1);
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

      const configFile = makeConfig({ 'model.config': legacyProviders });
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'created' });
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(ipcBridge.mode.createProvider.invoke).toHaveBeenCalledTimes(4);

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

      const thirdCall = (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>).mock.calls[2][0];
      expect(thirdCall.bedrock_config).toEqual({
        auth_method: 'accessKey',
        region: 'us-east-1',
        access_key_id: 'AKIA',
        secret_access_key: 'secret',
        profile: undefined,
      });

      const fourthCall = (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>).mock.calls[3][0];
      expect(fourthCall.model_health).toEqual({
        'gpt-3.5-turbo': {
          status: 'healthy',
          last_check: 100,
          latency: 50,
          error: undefined,
        },
      });

      // Legacy field is preserved; the new completion flag is written.
      expect(configFile.store.get('model.config')).toBe(legacyProviders);
      expect(configFile.store.get('migration.providersMigrated_v1')).toBe(true);
    });

    it('only migrates providers not already in backend (by id)', async () => {
      const legacyProviders = [
        { id: 'p1', platform: 'openai', name: 'P1', baseUrl: '', apiKey: '', model: ['gpt-4'] },
        { id: 'p2', platform: 'anthropic', name: 'P2', baseUrl: '', apiKey: '', model: ['claude-3'] },
      ];
      const configFile = makeConfig({ 'model.config': legacyProviders });
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'p1' }]);
      (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p2' });
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(ipcBridge.mode.createProvider.invoke).toHaveBeenCalledTimes(1);
      expect((ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>).mock.calls[0][0].id).toBe('p2');
    });

    it('continues migration even when some providers fail', async () => {
      const legacyProviders = [
        { id: 'p1', platform: 'openai', name: 'P1', baseUrl: '', apiKey: '', model: ['gpt-4'] },
        { id: 'p2', platform: 'anthropic', name: 'P2', baseUrl: '', apiKey: '', model: ['claude-3'] },
      ];
      const configFile = makeConfig({ 'model.config': legacyProviders });
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ id: 'p1' })
        .mockRejectedValueOnce(new Error('fail'));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(warnSpy).toHaveBeenCalledWith('[Migration] failed to create provider %s:', 'p2', expect.any(Error));
      // Partial failure: legacy field untouched AND flag must remain unset so
      // the next launch retries the still-missing row.
      expect(configFile.store.get('model.config')).toBe(legacyProviders);
      expect(configFile.store.has('migration.providersMigrated_v1')).toBe(false);
    });

    it('handles missing model.config gracefully', async () => {
      // get() rejects for everything (legacy file truly absent). The flag
      // read failure is caught as "not migrated yet"; the model.config read
      // failure routes to the early return that now also sets the flag so
      // we don't redundantly hit this path on every subsequent boot.
      const setMock = vi.fn();
      const configFile: ConfigFile = {
        get: vi.fn().mockRejectedValue(new Error('not found')),
        set: setMock,
      };
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(ipcBridge.mode.listProviders.invoke).not.toHaveBeenCalled();
      expect(ipcBridge.mode.createProvider.invoke).not.toHaveBeenCalled();
      // The only write must be the completion flag — never the legacy field.
      expect(setMock).toHaveBeenCalledWith('migration.providersMigrated_v1', true);
      const legacyWrite = setMock.mock.calls.find((c) => c[0] === 'model.config');
      expect(legacyWrite).toBeUndefined();
    });

    it('handles empty model.config array gracefully', async () => {
      const configFile = makeConfig();
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(ipcBridge.mode.listProviders.invoke).not.toHaveBeenCalled();
      expect(ipcBridge.mode.createProvider.invoke).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // ELECTRON-1KT regression coverage: the providers migration must persist
    // a one-shot flag on success and short-circuit on subsequent launches so
    // user-deleted providers don't reappear on every restart.
    // ---------------------------------------------------------------------

    it('sets completion flag after successful migration of legacy providers', async () => {
      const legacyProviders = [{ id: 'p1', platform: 'openai', name: 'P1', baseUrl: '', apiKey: '', model: ['gpt-4'] }];
      const configFile = makeConfig({ 'model.config': legacyProviders });
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(ipcBridge.mode.createProvider.invoke).toHaveBeenCalledTimes(1);
      expect(configFile.store.get('migration.providersMigrated_v1')).toBe(true);
      // Legacy field is intentionally preserved on disk for downgrade safety.
      expect(configFile.store.get('model.config')).toEqual(legacyProviders);
    });

    it('skips migration entirely on subsequent runs once flag is set', async () => {
      // Simulate a second launch: legacy file still on disk, flag already true.
      const legacyProviders = [{ id: 'p1', platform: 'openai', name: 'P1', baseUrl: '', apiKey: '', model: ['gpt-4'] }];
      const configFile = makeConfig({
        'model.config': legacyProviders,
        'migration.providersMigrated_v1': true,
      });
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      // Critical: the migration must not even read the legacy provider list,
      // and createProvider must never be called.
      expect(ipcBridge.mode.listProviders.invoke).not.toHaveBeenCalled();
      expect(ipcBridge.mode.createProvider.invoke).not.toHaveBeenCalled();
    });

    it('does not re-import a provider deleted by the user after migration (ELECTRON-1KT)', async () => {
      // Run 1: full migration succeeds, flag gets set.
      const legacyProviders = [
        { id: 'p1', platform: 'openai', name: 'P1', baseUrl: '', apiKey: '', model: ['gpt-4'] },
        { id: 'p2', platform: 'anthropic', name: 'P2', baseUrl: '', apiKey: '', model: ['claude-3'] },
      ];
      const configFile = makeConfig({ 'model.config': legacyProviders });
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ok' });
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);
      expect(configFile.store.get('migration.providersMigrated_v1')).toBe(true);

      // Run 2: user has deleted `p1` from the backend. The legacy list on
      // disk is unchanged. listProviders would now return only [p2]. With
      // the flag in place, the migration must NOT call createProvider for
      // p1 — that's the bug being fixed.
      vi.clearAllMocks();
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'p2' }]);
      (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });

      await migrateProviders(configFile);

      expect(ipcBridge.mode.listProviders.invoke).not.toHaveBeenCalled();
      expect(ipcBridge.mode.createProvider.invoke).not.toHaveBeenCalled();
    });

    it('does not set flag on partial failure so retry can fill the gap', async () => {
      const legacyProviders = [
        { id: 'p1', platform: 'openai', name: 'P1', baseUrl: '', apiKey: '', model: ['gpt-4'] },
        { id: 'p2', platform: 'anthropic', name: 'P2', baseUrl: '', apiKey: '', model: ['claude-3'] },
      ];
      const configFile = makeConfig({ 'model.config': legacyProviders });
      (ipcBridge.mode.listProviders.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (ipcBridge.mode.createProvider.invoke as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ id: 'p1' })
        .mockRejectedValueOnce(new Error('boom'));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      // Flag must remain unset so the next launch retries the still-missing row.
      expect(configFile.store.has('migration.providersMigrated_v1')).toBe(false);
    });

    it('sets flag when there is no legacy model.config to migrate', async () => {
      // Fresh install or already-cleaned config: nothing to do, but we still
      // want to set the flag so we never re-read this path again.
      const configFile = makeConfig();
      vi.spyOn(console, 'info').mockImplementation(() => {});

      await migrateProviders(configFile);

      expect(configFile.store.get('migration.providersMigrated_v1')).toBe(true);
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
