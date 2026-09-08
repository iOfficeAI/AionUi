/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import http, { type Server } from 'node:http';
import { GeaLarkAuthService } from '@aionui/web-host';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IProvider } from '@/common/config/storage';
import {
  createPersonalModelProviderId,
  LocalPersonalModelProxy,
  PersonalModelGatewayService,
  type PersonalModelAuthClient,
  type PersonalModelProviderStore,
  type PersonalModelProxy,
  type PersonalModelSecretRecord,
  type PersonalModelSecretVault,
} from '@/process/services/gea/PersonalModelGatewayService';

const ENVIRONMENT_ID = 'gea-env-a';

class MemoryVault implements PersonalModelSecretVault {
  available = true;
  records = new Map<string, PersonalModelSecretRecord>();

  isAvailable(): boolean {
    return this.available;
  }

  async get(
    environmentId: string,
    userId: string,
    credentialId: string,
    tenantId: string
  ): Promise<PersonalModelSecretRecord | null> {
    return this.records.get(`${environmentId}:${tenantId}:${userId}:${credentialId}`) ?? null;
  }

  async put(record: PersonalModelSecretRecord): Promise<void> {
    this.records.set(`${record.environmentId}:${record.tenantId}:${record.userId}:${record.credentialId}`, record);
  }

  async delete(environmentId: string, userId: string, credentialId: string, tenantId: string): Promise<void> {
    this.records.delete(`${environmentId}:${tenantId}:${userId}:${credentialId}`);
  }
}

class MemoryProviderStore implements PersonalModelProviderStore {
  providers: IProvider[] = [];

  async list(): Promise<IProvider[]> {
    return this.providers;
  }

  async save(provider: IProvider, exists: boolean): Promise<void> {
    if (exists) {
      this.providers = this.providers.map((item) => (item.id === provider.id ? provider : item));
    } else {
      this.providers.push(provider);
    }
  }
}

const createAuthClient = (status: 'PENDING_CLAIM' | 'ACTIVE' | 'ENABLED' | 'REVOKED' = 'PENDING_CLAIM') =>
  ({
    listPersonalModelCredentials: vi.fn().mockResolvedValue([
      {
        credentialId: 'credential-1',
        accessKeyId: 'uk-gea-1',
        status,
      },
    ]),
    claimPersonalModelCredential: vi.fn().mockResolvedValue({
      credentialId: 'credential-1',
      accessKeyId: 'uk-gea-1',
      status: 'ACTIVE',
      baseUrl: 'https://gea.example/gea-boot/ai/v1',
      secret: 'sk-user-sensitive',
    }),
    listPersonalModels: vi.fn().mockResolvedValue(['deepseek-v4-flash']),
  }) satisfies PersonalModelAuthClient;

describe('PersonalModelGatewayService', () => {
  it('claims, secures, and configures a provider without persisting the personal secret', async () => {
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({
        apiKey: 'local-proxy-key',
        baseUrl: 'http://127.0.0.1:34567/personal/gea-personal-test',
      }),
    };
    const authClient = createAuthClient();
    const service = new PersonalModelGatewayService(vault, providerStore, ENVIRONMENT_ID, proxy);

    await expect(
      service.sync({ id: 'user-1', username: 'zhangsan', realname: '张三' }, authClient, ['sales-forecast'])
    ).resolves.toEqual({
      configured: 1,
      failed: 0,
      skipped: 0,
      status: 'completed',
    });

    const record = await vault.get(ENVIRONMENT_ID, 'user-1', 'credential-1', '0');
    expect(record).toMatchObject({
      environmentId: ENVIRONMENT_ID,
      secret: 'sk-user-sensitive',
      tenantId: '0',
    });
    expect(providerStore.providers).toHaveLength(1);
    expect(providerStore.providers[0]).toMatchObject({
      id: expect.stringMatching(/^gea-personal-/),
      name: 'GEA · sales-forecast',
      api_key: 'local-proxy-key',
      models: ['deepseek-v4-flash'],
      enabled: true,
      model_settings: {
        'deepseek-v4-flash': { initial_tool_choice: 'required' },
      },
    });
    expect(JSON.stringify(providerStore.providers[0])).not.toContain('sk-user-sensitive');
  });

  it('refreshes only the rejected Agent models after a 404 without resending a chat', async () => {
    const vault = new MemoryVault();
    const store = new MemoryProviderStore();
    const callbacks = new Map<string, (status: 401 | 403 | 404) => Promise<void>>();
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockImplementation(async (_record, code, callback) => {
        callbacks.set(code, callback);
        return { apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/' + code };
      }),
    };
    const auth = createAuthClient();
    auth.listPersonalModels.mockResolvedValue(['CONFIG_OLD']);
    const service = new PersonalModelGatewayService(vault, store, ENVIRONMENT_ID, proxy);
    await service.sync({ id: 'user-1', username: 'test', realname: 'Test' }, auth, ['sales', 'finance']);
    auth.listPersonalModels.mockClear();
    auth.listPersonalModels.mockResolvedValue(['CONFIG_NEW']);
    await callbacks.get('sales')!(404);
    expect(auth.listPersonalModels).toHaveBeenCalledExactlyOnceWith(
      'https://gea.example/gea-boot/ai/v1',
      'sk-user-sensitive',
      'sales'
    );
    expect(store.providers.map((provider) => provider.models)).toEqual([['CONFIG_NEW'], ['CONFIG_OLD']]);
    expect(auth.claimPersonalModelCredential).toHaveBeenCalledTimes(1);
    expect(proxy.register).toHaveBeenCalledTimes(2);
  });

  it('reuses a securely stored secret and preserves user enable switches', async () => {
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    const firstProxy: PersonalModelProxy = {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/p' }),
    };
    const firstAuth = createAuthClient();
    const service = new PersonalModelGatewayService(vault, providerStore, ENVIRONMENT_ID, firstProxy);
    const user = { id: 'user-1', username: 'zhangsan', realname: '张三' };
    await service.sync(user, firstAuth, ['sales-forecast']);

    providerStore.providers[0] = {
      ...providerStore.providers[0],
      enabled: false,
      model_enabled: { 'deepseek-v4-flash': false },
    };
    const enabledAuth = createAuthClient('ACTIVE');
    await service.sync(user, enabledAuth, ['sales-forecast']);

    expect(enabledAuth.claimPersonalModelCredential).not.toHaveBeenCalled();
    expect(providerStore.providers[0]).toMatchObject({
      enabled: false,
      model_enabled: { 'deepseek-v4-flash': false },
    });
  });

  it('recovers a deployed shared ENABLED credential once and reuses it for both Agents', async () => {
    const vault = new MemoryVault();
    const store = new MemoryProviderStore();
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/test' }),
    };
    const client = createAuthClient('ENABLED');
    client.claimPersonalModelCredential.mockResolvedValue({
      credentialId: 'credential-1',
      accessKeyId: 'uk-gea-1',
      status: 'ENABLED',
      baseUrl: 'https://gea.example/gea-boot/ai/v1',
      secret: 'synthetic-recovered-secret',
    });
    const service = new PersonalModelGatewayService(vault, store, ENVIRONMENT_ID, proxy);
    const user = { id: 'user-1', username: 'test', realname: 'Test' };
    await expect(service.sync(user, client, ['sales', 'finance'])).resolves.toMatchObject({
      configured: 2,
      status: 'completed',
    });
    await service.sync(user, client, ['sales']);
    expect(client.claimPersonalModelCredential).toHaveBeenCalledTimes(1);
    expect(vault.records.size).toBe(1);
  });

  it('does not blindly repeat a failed ENABLED recovery on automatic synchronization', async () => {
    const client = createAuthClient('ENABLED');
    client.claimPersonalModelCredential.mockRejectedValue(new Error('one-time recovery unavailable'));
    const proxy: PersonalModelProxy = { deactivate: vi.fn().mockResolvedValue(undefined), register: vi.fn() };
    const service = new PersonalModelGatewayService(
      new MemoryVault(),
      new MemoryProviderStore(),
      ENVIRONMENT_ID,
      proxy
    );
    const user = { id: 'user-1', username: 'test', realname: 'Test' };
    await expect(service.sync(user, client, ['sales'])).resolves.toMatchObject({
      reason: 'credentialRecoveryRequired',
    });
    await service.sync(user, client, ['sales']);
    expect(client.claimPersonalModelCredential).toHaveBeenCalledTimes(1);
    expect(proxy.register).not.toHaveBeenCalled();
  });

  it('keeps the current proxy alive when credential discovery fails before reconciliation', async () => {
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/p' }),
    };
    const service = new PersonalModelGatewayService(vault, providerStore, ENVIRONMENT_ID, proxy);
    const user = { id: 'user-1', username: 'zhangsan', realname: '张三' };
    await service.sync(user, createAuthClient(), ['sales-forecast']);
    vi.mocked(proxy.deactivate).mockClear();
    const unavailableAuth = createAuthClient();
    unavailableAuth.listPersonalModelCredentials.mockRejectedValueOnce(new Error('environment unavailable'));

    await expect(service.sync(user, unavailableAuth, ['sales-forecast'])).resolves.toMatchObject({
      reason: 'credentialListFailed',
      status: 'partial',
    });

    expect(proxy.deactivate).not.toHaveBeenCalled();
    expect(providerStore.providers[0]).toMatchObject({ enabled: true });
  });

  it('suspends a managed provider when reconciliation fails after closing its proxy', async () => {
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/p' }),
    };
    const service = new PersonalModelGatewayService(vault, providerStore, ENVIRONMENT_ID, proxy);
    const user = { id: 'user-1', username: 'zhangsan', realname: '张三' };
    await service.sync(user, createAuthClient(), ['sales-forecast']);
    const unavailableAuth = createAuthClient('ACTIVE');
    unavailableAuth.listPersonalModels.mockRejectedValueOnce(new Error('model discovery unavailable'));

    await expect(service.sync(user, unavailableAuth, ['sales-forecast'])).resolves.toMatchObject({
      reason: 'modelDiscoveryFailed',
      status: 'partial',
    });

    expect(providerStore.providers[0]).toMatchObject({
      enabled: false,
      model_health: {
        'deepseek-v4-flash': {
          error: 'GEA_PERSONAL_LOGIN_REQUIRED',
          status: 'unhealthy',
        },
      },
    });
  });

  it('isolates vault records and managed providers for the same user across GEA environments', async () => {
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    const createProxy = (): PersonalModelProxy => ({
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/p' }),
    });
    const user = { id: 'user-1', username: 'zhangsan', realname: '张三' };
    const environmentA = new PersonalModelGatewayService(vault, providerStore, 'gea-env-a', createProxy());
    const environmentB = new PersonalModelGatewayService(vault, providerStore, 'gea-env-b', createProxy());

    await environmentA.sync(user, createAuthClient(), ['sales-forecast']);
    await environmentB.deactivate();

    const providerA = createPersonalModelProviderId('gea-env-a', user.id, 'credential-1', 'sales-forecast', '0');
    expect(providerStore.providers.find((provider) => provider.id === providerA)?.enabled).toBe(false);

    const unavailableAuth = createAuthClient();
    unavailableAuth.listPersonalModelCredentials.mockRejectedValueOnce(new Error('environment unavailable'));
    await expect(environmentB.sync(user, unavailableAuth, ['sales-forecast'])).resolves.toMatchObject({
      reason: 'credentialListFailed',
      status: 'partial',
    });
    expect(providerStore.providers.find((provider) => provider.id === providerA)?.enabled).toBe(false);

    await environmentB.sync(user, createAuthClient(), ['sales-forecast']);

    const providerB = createPersonalModelProviderId('gea-env-b', user.id, 'credential-1', 'sales-forecast', '0');
    expect(providerA).not.toBe(providerB);
    expect(await vault.get('gea-env-a', user.id, 'credential-1', '0')).toMatchObject({ environmentId: 'gea-env-a' });
    expect(await vault.get('gea-env-b', user.id, 'credential-1', '0')).toMatchObject({ environmentId: 'gea-env-b' });
    expect(providerStore.providers.find((provider) => provider.id === providerA)?.enabled).toBe(false);
    expect(providerStore.providers.find((provider) => provider.id === providerB)?.enabled).toBe(true);

    await environmentB.deactivate();

    expect(providerStore.providers.find((provider) => provider.id === providerA)?.enabled).toBe(false);
    expect(providerStore.providers.find((provider) => provider.id === providerB)?.enabled).toBe(false);

    await environmentA.sync(user, createAuthClient('ACTIVE'), ['sales-forecast']);
    expect(providerStore.providers.find((provider) => provider.id === providerA)?.enabled).toBe(true);
    expect(providerStore.providers.find((provider) => provider.id === providerB)?.enabled).toBe(false);
  });

  it('suspends enabled managed providers without changing user-disabled providers and restores them after login', async () => {
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    providerStore.providers.push({
      id: 'custom-provider',
      platform: 'openai',
      name: 'Custom',
      base_url: 'https://example.test/v1',
      api_key: 'custom-key',
      models: ['custom-model'],
      enabled: true,
    });
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/p' }),
    };
    const service = new PersonalModelGatewayService(vault, providerStore, ENVIRONMENT_ID, proxy);
    const user = { id: 'user-1', username: 'zhangsan', realname: '张三' };
    await service.sync(user, createAuthClient(), ['sales-forecast']);
    const managed = providerStore.providers.find((provider) => provider.id.startsWith('gea-personal-'))!;
    providerStore.providers.push({
      ...managed,
      id: 'gea-personal-user-disabled',
      enabled: false,
    });

    await service.deactivate();

    expect(providerStore.providers.find((provider) => provider.id === managed.id)).toMatchObject({
      enabled: false,
      model_health: {
        'deepseek-v4-flash': {
          status: 'unhealthy',
          error: 'GEA_PERSONAL_LOGIN_REQUIRED',
        },
      },
    });
    expect(providerStore.providers.find((provider) => provider.id === 'gea-personal-user-disabled')?.enabled).toBe(
      false
    );
    expect(providerStore.providers.find((provider) => provider.id === 'custom-provider')?.enabled).toBe(true);

    await service.sync(user, createAuthClient('ACTIVE'), ['sales-forecast']);

    expect(providerStore.providers.find((provider) => provider.id === managed.id)).toMatchObject({
      enabled: true,
      model_health: undefined,
    });
    expect(providerStore.providers.find((provider) => provider.id === 'gea-personal-user-disabled')?.enabled).toBe(
      false
    );
  });

  it('requires reissuance instead of replaying claim when an ACTIVE secret is absent locally', async () => {
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn(),
    };
    const authClient = createAuthClient('ACTIVE');
    const service = new PersonalModelGatewayService(vault, providerStore, ENVIRONMENT_ID, proxy);
    await expect(
      service.sync({ id: 'user-1', username: 'zhangsan', realname: 'test' }, authClient, ['sales-forecast'])
    ).resolves.toMatchObject({
      configured: 0,
      failed: 1,
      reason: 'credentialRecoveryRequired',
      status: 'partial',
    });
    expect(authClient.claimPersonalModelCredential).not.toHaveBeenCalled();
    expect(authClient.listPersonalModels).not.toHaveBeenCalled();
    expect(proxy.register).not.toHaveBeenCalled();
  });

  it('disables and clears a managed provider when GEA no longer returns models', async () => {
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/p' }),
    };
    const service = new PersonalModelGatewayService(vault, providerStore, ENVIRONMENT_ID, proxy);
    const user = { id: 'user-1', username: 'zhangsan', realname: '张三' };
    await service.sync(user, createAuthClient(), ['sales-forecast']);

    const emptyAuth = createAuthClient('ACTIVE');
    vi.mocked(emptyAuth.listPersonalModels).mockResolvedValue([]);
    await service.sync(user, emptyAuth, ['sales-forecast']);

    expect(providerStore.providers[0]).toMatchObject({
      enabled: false,
      models: [],
      model_enabled: {},
    });
  });

  it('replaces a stale GEA model name when model discovery changes', async () => {
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/p' }),
    };
    const service = new PersonalModelGatewayService(vault, providerStore, ENVIRONMENT_ID, proxy);
    const user = { id: 'user-1', username: 'zhangsan', realname: '张三' };
    const initialAuth = createAuthClient();
    vi.mocked(initialAuth.listPersonalModels).mockResolvedValue(['liteLLM']);
    await service.sync(user, initialAuth, ['sales-forecast']);

    const refreshedAuth = createAuthClient('ACTIVE');
    vi.mocked(refreshedAuth.listPersonalModels).mockResolvedValue(['deepseek-chat']);
    await service.sync(user, refreshedAuth, ['sales-forecast']);

    expect(providerStore.providers[0]).toMatchObject({
      models: ['deepseek-chat'],
      model_enabled: { 'deepseek-chat': true },
    });
    expect(providerStore.providers[0].model_enabled).not.toHaveProperty('liteLLM');
  });

  it('does not claim a one-time secret when secure storage is unavailable', async () => {
    const vault = new MemoryVault();
    vault.available = false;
    const authClient = createAuthClient();
    const service = new PersonalModelGatewayService(vault, new MemoryProviderStore(), ENVIRONMENT_ID);

    await expect(
      service.sync({ id: 'user-1', username: 'zhangsan', realname: '张三' }, authClient, ['sales-forecast'])
    ).resolves.toEqual({
      configured: 0,
      failed: 0,
      reason: 'secureStorageUnavailable',
      skipped: 0,
      status: 'unavailable',
    });
    expect(authClient.listPersonalModelCredentials).not.toHaveBeenCalled();
    expect(authClient.claimPersonalModelCredential).not.toHaveBeenCalled();
  });

  it('removes a revoked secret and keeps the managed provider disabled', async () => {
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    const service = new PersonalModelGatewayService(vault, providerStore, ENVIRONMENT_ID, {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/p' }),
    });
    const user = { id: 'user-1', username: 'zhangsan', realname: '张三' };
    await service.sync(user, createAuthClient(), ['sales-forecast']);
    const provider = providerStore.providers[0];
    expect(await vault.get(ENVIRONMENT_ID, user.id, 'credential-1', '0')).not.toBeNull();

    await service.sync(user, createAuthClient('REVOKED'), ['sales-forecast']);

    expect(await vault.get(ENVIRONMENT_ID, user.id, 'credential-1', '0')).toBeNull();
    expect(providerStore.providers.find((item) => item.id === provider.id)?.enabled).toBe(false);
  });
});

describe('personal credential v2 isolation', () => {
  it('shares one key across Agents but rediscovers and isolates their model configuration IDs', async () => {
    const vault = new MemoryVault();
    const store = new MemoryProviderStore();
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn(),
      register: vi.fn().mockResolvedValue({ apiKey: 'local', baseUrl: 'http://127.0.0.1:1' }),
    };
    const client = createAuthClient();
    client.listPersonalModels.mockImplementation(async (_base: string, _secret: string, agent: string) => [
      agent === 'sales-forecast' ? 'CONFIG_SALES' : 'CONFIG_FINANCE',
    ]);
    const service = new PersonalModelGatewayService(vault, store, ENVIRONMENT_ID, proxy);
    const user = { id: 'user-1', username: 'user', realname: 'user' };
    await service.sync(user, client, ['sales-forecast', 'finance']);
    expect(client.claimPersonalModelCredential).toHaveBeenCalledExactlyOnceWith('credential-1');
    expect(vault.records.size).toBe(1);
    expect(store.providers.map((provider) => provider.models)).toEqual([['CONFIG_SALES'], ['CONFIG_FINANCE']]);
    expect(new Set(store.providers.map((provider) => provider.id)).size).toBe(2);
    expect(client.listPersonalModels.mock.calls.map((call) => call[2])).toEqual(['sales-forecast', 'finance']);
    const refreshed = createAuthClient('ACTIVE');
    await service.sync(user, refreshed, ['finance']);
    expect(refreshed.listPersonalModels).toHaveBeenCalledExactlyOnceWith(
      'https://gea.example/gea-boot/ai/v1',
      'sk-user-sensitive',
      'finance'
    );
    expect(refreshed.claimPersonalModelCredential).not.toHaveBeenCalled();
    expect(store.providers.find((provider) => provider.name === 'GEA · sales-forecast')?.enabled).toBe(false);
  });

  it('does not reuse a user key or provider across trusted tenant contexts', async () => {
    const vault = new MemoryVault();
    const store = new MemoryProviderStore();
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn(),
      register: vi.fn().mockResolvedValue({ apiKey: 'local', baseUrl: 'http://127.0.0.1:1' }),
    };
    const service = new PersonalModelGatewayService(vault, store, ENVIRONMENT_ID, proxy);
    const user = { id: 'user-1', username: 'user', realname: 'user', tenantId: '0' };
    await service.sync(user, createAuthClient(), ['sales-forecast']);
    const otherTenant = createAuthClient('ACTIVE');
    await expect(service.sync({ ...user, tenantId: '1' }, otherTenant, ['sales-forecast'])).resolves.toMatchObject({
      configured: 0,
      reason: 'credentialRecoveryRequired',
    });
    expect(otherTenant.listPersonalModels).not.toHaveBeenCalled();
    expect(store.providers.every((provider) => provider.enabled === false)).toBe(true);
    expect(createPersonalModelProviderId(ENVIRONMENT_ID, user.id, 'credential-1', 'sales-forecast', '0')).not.toBe(
      createPersonalModelProviderId(ENVIRONMENT_ID, user.id, 'credential-1', 'sales-forecast', '1')
    );
  });

  it('replaces a reissued secret before registering models and never keeps the old local key', async () => {
    const vault = new MemoryVault();
    const store = new MemoryProviderStore();
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn(),
      register: vi.fn().mockResolvedValue({ apiKey: 'local', baseUrl: 'http://127.0.0.1:1' }),
    };
    const service = new PersonalModelGatewayService(vault, store, ENVIRONMENT_ID, proxy);
    const user = { id: 'user-1', username: 'user', realname: 'user' };
    await service.sync(user, createAuthClient(), ['sales-forecast']);
    const previous = await vault.get(ENVIRONMENT_ID, user.id, 'credential-1', '0');
    const reissued = createAuthClient();
    reissued.claimPersonalModelCredential.mockResolvedValue({
      credentialId: 'credential-1',
      accessKeyId: 'uk-gea-1',
      status: 'ACTIVE',
      baseUrl: 'https://gea.example/gea-boot/ai/v1',
      secret: 'sk-user-rotated-test',
    });
    await service.sync(user, reissued, ['sales-forecast']);
    const current = await vault.get(ENVIRONMENT_ID, user.id, 'credential-1', '0');
    expect(current?.secret).toBe('sk-user-rotated-test');
    expect(current?.proxyKey).not.toBe(previous?.proxyKey);
    expect(reissued.listPersonalModels).toHaveBeenCalledWith(current?.baseUrl, current?.secret, 'sales-forecast');
  });

  it('does not publish an in-flight sync after logout', async () => {
    const vault = new MemoryVault();
    const store = new MemoryProviderStore();
    const proxy: PersonalModelProxy = { deactivate: vi.fn(), register: vi.fn() };
    let release!: (models: string[]) => void;
    const client = createAuthClient();
    client.listPersonalModels.mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          release = resolve;
        })
    );
    const service = new PersonalModelGatewayService(vault, store, ENVIRONMENT_ID, proxy);
    const pending = service.sync({ id: 'user-1', username: 'user', realname: 'user' }, client, ['sales-forecast']);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const deactivation = service.deactivate();
    release(['CONFIG_SALES']);
    await Promise.all([pending, deactivation]);
    expect(proxy.register).not.toHaveBeenCalled();
    expect(store.providers).toEqual([]);
  });
});

describe('LocalPersonalModelProxy', () => {
  let upstream: Server | undefined;
  let proxy: LocalPersonalModelProxy | undefined;

  afterEach(async () => {
    await proxy?.deactivate();
    await new Promise<void>((resolve) => upstream?.close(() => resolve()) ?? resolve());
    proxy = undefined;
    upstream = undefined;
  });

  it('replaces the local bearer token with the personal secret while proxying the response', async () => {
    let upstreamAuthorization = '';
    let upstreamHeaders: http.IncomingHttpHeaders = {};
    upstream = http.createServer((req, res) => {
      upstreamAuthorization = req.headers.authorization ?? '';
      upstreamHeaders = req.headers;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    await new Promise<void>((resolve) => upstream!.listen(0, '127.0.0.1', resolve));
    const upstreamPort = (upstream.address() as AddressInfo).port;
    proxy = new LocalPersonalModelProxy();
    const config = await proxy.register(
      {
        environmentId: ENVIRONMENT_ID,
        userId: 'user-1',
        credentialId: 'credential-1',
        accessKeyId: 'uk-gea-1',
        tenantId: '0',
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        proxyKey: 'local-proxy-key',
        secret: 'sk-user-sensitive',
      },
      'sales-forecast',
      vi.fn().mockResolvedValue(undefined)
    );

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-GEA-Agent-Code': 'spoofed',
        'X-Tenant-Id': '9',
        'X-Access-Token': 'must-not-forward',
      },
      body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [] }),
    });

    expect(response.status).toBe(200);
    expect(upstreamAuthorization).toBe('Bearer sk-user-sensitive');
    expect(upstreamHeaders['x-gea-agent-code']).toBe('sales-forecast');
    expect(upstreamHeaders['x-tenant-id']).toBeUndefined();
    expect(upstreamHeaders['x-access-token']).toBeUndefined();
  });

  it('passes tool_choice through without inferring it from message roles', async () => {
    const upstreamBodies: Array<Record<string, unknown>> = [];
    upstream = http.createServer((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        upstreamBodies.push(JSON.parse(body) as Record<string, unknown>);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
      });
    });
    await new Promise<void>((resolve) => upstream!.listen(0, '127.0.0.1', resolve));
    const upstreamPort = (upstream.address() as AddressInfo).port;
    proxy = new LocalPersonalModelProxy();
    const config = await proxy.register(
      {
        environmentId: ENVIRONMENT_ID,
        userId: 'user-1',
        credentialId: 'credential-1',
        accessKeyId: 'uk-gea-1',
        tenantId: '0',
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        proxyKey: 'local-proxy-key',
        secret: 'sk-user-sensitive',
      },
      'sales-forecast',
      vi.fn().mockResolvedValue(undefined)
    );
    const tools = [
      {
        type: 'function',
        function: { name: 'query_data', description: 'Query data', parameters: { type: 'object' } },
      },
    ];
    const request = (messages: Array<Record<string, unknown>>, toolChoice?: string) =>
      fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          tools,
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
        }),
      });

    await request([{ role: 'user', content: 'query this month' }]);
    await request([
      { role: 'user', content: 'query this month' },
      { role: 'assistant', tool_calls: [{ id: 'call-1', type: 'function' }] },
      { role: 'tool', tool_call_id: 'call-1', content: '{}' },
    ]);
    await request([{ role: 'user', content: 'answer directly' }], 'auto');

    expect(upstreamBodies[0]).not.toHaveProperty('tool_choice');
    expect(upstreamBodies[1]).not.toHaveProperty('tool_choice');
    expect(upstreamBodies[2].tool_choice).toBe('auto');
  });

  it('normalizes GEA tool execution SSE events for the OpenAI-compatible client', async () => {
    upstream = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(
        'data:{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"query_data","arguments":"{}"}}]},"finish_reason":"tool_execution"}]}\n\n'
      );
      res.end('data:[DONE]\n\n');
    });
    await new Promise<void>((resolve) => upstream!.listen(0, '127.0.0.1', resolve));
    const upstreamPort = (upstream.address() as AddressInfo).port;
    proxy = new LocalPersonalModelProxy();
    const config = await proxy.register(
      {
        environmentId: ENVIRONMENT_ID,
        userId: 'user-1',
        credentialId: 'credential-1',
        accessKeyId: 'uk-gea-1',
        tenantId: '0',
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        proxyKey: 'local-proxy-key',
        secret: 'sk-user-sensitive',
      },
      'sales-forecast',
      vi.fn().mockResolvedValue(undefined)
    );

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-chat', stream: true, messages: [] }),
    });
    const lines = (await response.text()).split('\n').filter(Boolean);

    expect(lines[0]).toMatch(/^data: /);
    expect(JSON.parse(lines[0].slice('data: '.length))).toMatchObject({
      choices: [{ finish_reason: 'tool_calls', delta: { tool_calls: [{ id: 'call-1' }] } }],
    });
    expect(lines[1]).toBe('data: [DONE]');
  });

  it('completes a chat through the provider created from the authenticated user credential', async () => {
    let upstreamPath = '';
    let upstreamModel = '';
    upstream = http.createServer((req, res) => {
      upstreamPath = req.url ?? '';
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        upstreamModel = (JSON.parse(body) as { model: string }).model;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }));
      });
    });
    await new Promise<void>((resolve) => upstream!.listen(0, '127.0.0.1', resolve));
    const upstreamPort = (upstream.address() as AddressInfo).port;
    proxy = new LocalPersonalModelProxy();
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    const authClient = createAuthClient();
    vi.mocked(authClient.claimPersonalModelCredential).mockResolvedValue({
      credentialId: 'credential-1',
      accessKeyId: 'uk-gea-1',
      status: 'ACTIVE',
      baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
      secret: 'sk-user-sensitive',
    });
    vi.mocked(authClient.listPersonalModels).mockResolvedValue(['deepseek-chat']);
    const service = new PersonalModelGatewayService(vault, providerStore, ENVIRONMENT_ID, proxy);

    await service.sync({ id: 'user-1', username: 'zhangsan', realname: '张三' }, authClient, ['sales-forecast']);
    const provider = providerStore.providers[0];
    const response = await fetch(`${provider.base_url}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: provider.models[0], messages: [{ role: 'user', content: 'ping' }] }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ choices: [{ message: { content: 'pong' } }] });
    expect(upstreamPath).toBe('/v1/chat/completions');
    expect(upstreamModel).toBe('deepseek-chat');
  });
  it.each([401, 403])('invalidates all shared-key routes only for 401, with upstream status %s', async (status) => {
    const seen: string[] = [];
    upstream = http.createServer((req, res) => {
      const agent = String(req.headers['x-gea-agent-code']);
      seen.push(agent);
      res.writeHead(agent === 'sales' ? status : 200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(
          agent === 'sales'
            ? { error: { code: status === 401 ? 'invalid_api_key' : 'permission_denied' } }
            : { data: [{ id: 'CONFIG_FINANCE' }] }
        )
      );
    });
    await new Promise<void>((resolve) => upstream!.listen(0, '127.0.0.1', resolve));
    const record: PersonalModelSecretRecord = {
      environmentId: ENVIRONMENT_ID,
      tenantId: '0',
      userId: 'user-1',
      credentialId: 'credential-1',
      accessKeyId: 'ak-user-1',
      secret: 'sk-user-test',
      proxyKey: 'local-root',
      baseUrl: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/ai/v1`,
    };
    proxy = new LocalPersonalModelProxy();
    const rejected = vi.fn().mockResolvedValue(undefined);
    const [sales, finance] = await Promise.all([
      proxy.register(record, 'sales', rejected),
      proxy.register(record, 'finance', rejected),
    ]);
    expect(sales.apiKey).not.toBe(finance.apiKey);
    const spoof = await fetch(`${finance.baseUrl}/models`, { headers: { Authorization: `Bearer ${sales.apiKey}` } });
    expect(spoof.status).toBe(401);
    expect(seen).toEqual([]);
    const denied = await fetch(`${sales.baseUrl}/models`, { headers: { Authorization: `Bearer ${sales.apiKey}` } });
    expect(denied.status).toBe(status);
    await denied.text();
    const other = await fetch(`${finance.baseUrl}/models`, { headers: { Authorization: `Bearer ${finance.apiKey}` } });
    expect(other.status).toBe(status === 401 ? 401 : 200);
    await other.text();
    expect(seen).toEqual(status === 401 ? ['sales'] : ['sales', 'finance']);
    expect(rejected).toHaveBeenCalledExactlyOnceWith(status);
  });

  it.each([
    [404, 'model_not_found'],
    [429, 'rate_limit_exceeded'],
    [429, 'insufficient_quota'],
    [503, 'authorization_unavailable'],
    [503, 'model_gateway_unavailable'],
  ])('preserves %s/%s and never replays chat completion', async (status, code) => {
    let requests = 0;
    upstream = http.createServer((_req, res) => {
      requests++;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code } }));
    });
    await new Promise<void>((resolve) => upstream!.listen(0, '127.0.0.1', resolve));
    proxy = new LocalPersonalModelProxy();
    const config = await proxy.register(
      {
        environmentId: ENVIRONMENT_ID,
        tenantId: '0',
        userId: 'user-1',
        credentialId: 'credential-1',
        accessKeyId: 'ak-user-1',
        secret: 'sk-user-test',
        proxyKey: 'local-root',
        baseUrl: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/ai/v1`,
      },
      'sales',
      vi.fn().mockResolvedValue(undefined)
    );
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'CONFIG_SALES', messages: [{ role: 'user', content: 'test' }] }),
    });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: { code } });
    expect(requests).toBe(1);
  });

  it('preserves configuration IDs and error events in SSE and limits the proxy to model endpoints', async () => {
    let requests = 0;
    upstream = http.createServer((_req, res) => {
      requests++;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(
        'data: {"model":"CONFIG_SALES","choices":[{"delta":{"content":"ok"}}]}\n\ndata: {"error":{"code":"model_gateway_unavailable"}}\n\ndata: [DONE]\n\n'
      );
    });
    await new Promise<void>((resolve) => upstream!.listen(0, '127.0.0.1', resolve));
    proxy = new LocalPersonalModelProxy();
    const config = await proxy.register(
      {
        environmentId: ENVIRONMENT_ID,
        tenantId: '0',
        userId: 'user-1',
        credentialId: 'credential-1',
        accessKeyId: 'ak-user-1',
        secret: 'sk-user-test',
        proxyKey: 'local-root',
        baseUrl: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/ai/v1`,
      },
      'sales',
      vi.fn().mockResolvedValue(undefined)
    );
    const headers = { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' };
    const invalid = await fetch(`${config.baseUrl}/other`, { headers });
    expect(invalid.status).toBe(400);
    expect(requests).toBe(0);
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'CONFIG_SALES', stream: true, messages: [] }),
    });
    const events = (await response.text()).split('\n').filter(Boolean);
    expect(JSON.parse(events[0].slice(6)).model).toBe('CONFIG_SALES');
    expect(JSON.parse(events[1].slice(6)).error.code).toBe('model_gateway_unavailable');
    expect(events[2]).toBe('data: [DONE]');
    expect(requests).toBe(1);
  });
});

describe('personal gateway HTTP contract', () => {
  it('claims once and discovers and calls two Agent scopes through the real auth client and proxy', async () => {
    const calls: { path: string; method: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
    let baseUrl = '';
    let active = false;
    const upstream = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += String(chunk);
      });
      req.on('end', () => {
        const url = new URL(req.url!, baseUrl);
        calls.push({ path: url.pathname + url.search, method: req.method!, headers: req.headers, body });
        res.setHeader('content-type', 'application/json');
        const send = (result: unknown) => res.end(JSON.stringify({ success: true, result }));
        if (url.pathname.endsWith('/sys/getQrcodeToken'))
          return send({ success: true, token: 'synthetic-platform-token' });
        if (url.pathname.endsWith('/sys/user/getUserInfo'))
          return send({ userInfo: { id: 'user-http', username: 'test', realname: 'Test', loginTenantId: 7 } });
        if (url.pathname.endsWith('/my/list'))
          return send({
            records: [{ id: 'credential-http', accessKeyId: 'uk-http', status: active ? 'ACTIVE' : 'PENDING_CLAIM' }],
            total: 1,
          });
        if (url.pathname.endsWith('/my/claim')) {
          active = true;
          return send({
            credentialId: 'credential-http',
            accessKeyId: 'uk-http',
            secret: 'synthetic-personal-secret',
            status: 'ACTIVE',
            baseUrl: baseUrl + '/ai/v1',
          });
        }
        const agent = req.headers['x-gea-agent-code'];
        if (url.pathname.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'CONFIG_' + agent }] }));
        if (url.pathname.endsWith('/chat/completions')) {
          const payload = JSON.parse(body) as { model: string; stream?: boolean };
          if (payload.stream) {
            res.setHeader('content-type', 'text/event-stream');
            return res.end(
              'data: ' +
                JSON.stringify({ model: payload.model, choices: [{ delta: { content: 'ok' } }] }) +
                '\n\ndata: [DONE]\n\n'
            );
          }
          return res.end(JSON.stringify({ model: payload.model, choices: [{ message: { content: 'ok' } }] }));
        }
        res.statusCode = 404;
        res.end();
      });
    });
    const proxy = new LocalPersonalModelProxy();
    try {
      await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
      baseUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/gea-boot`;
      const auth = new GeaLarkAuthService({ baseUrl, allowLoopbackHttp: true });
      await auth.pollQrSession('synthetic-qr');
      const user = auth.getStatus().user!;
      expect(user.tenantId).toBe('7');
      const store = new MemoryProviderStore();
      const vault = new MemoryVault();
      const service = new PersonalModelGatewayService(vault, store, ENVIRONMENT_ID, proxy);
      await expect(service.sync(user, auth, ['sales', 'finance'])).resolves.toMatchObject({
        configured: 2,
        status: 'completed',
      });
      expect(vault.records.size).toBe(1);
      expect(store.providers.map((provider) => provider.models)).toEqual([['CONFIG_sales'], ['CONFIG_finance']]);
      const responses = await Promise.all(
        store.providers.map(async (provider, index) => {
          const response = await fetch(provider.base_url + '/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + provider.api_key,
              'content-type': 'application/json',
              'X-GEA-Agent-Code': 'spoof',
              'X-Tenant-Id': '99',
            },
            body: JSON.stringify({
              model: provider.models[0],
              messages: [{ role: 'user', content: 'test' }],
              stream: index === 1,
            }),
          });
          expect(response.status).toBe(200);
          return response.text();
        })
      );
      expect(responses[0]).toContain('CONFIG_sales');
      expect(responses[1]).toContain('CONFIG_finance');
      expect(responses[1]).toContain('[DONE]');
      await service.sync(user, auth, ['finance']);
      expect(calls.filter((call) => call.path.includes('/my/claim'))).toEqual([
        expect.objectContaining({
          method: 'POST',
          body: '',
          path: '/gea-boot/aidata/user-agent-credential/my/claim?id=credential-http',
        }),
      ]);
      const credentialCalls = calls.filter((call) => call.path.includes('/my/'));
      for (const call of credentialCalls) {
        expect(call.headers['x-access-token']).toBe('synthetic-platform-token');
        expect(call.headers['x-tenant-id']).toBeUndefined();
        expect(call.headers['x-gea-agent-code']).toBeUndefined();
      }
      const modelCalls = calls.filter((call) => call.path.includes('/ai/v1/'));
      expect(
        modelCalls.filter((call) => call.path.endsWith('/models')).map((call) => call.headers['x-gea-agent-code'])
      ).toEqual(['sales', 'finance', 'finance']);
      for (const call of modelCalls) {
        expect(call.headers.authorization).toBe('Bearer synthetic-personal-secret');
        expect(['sales', 'finance']).toContain(call.headers['x-gea-agent-code']);
        expect(call.headers['x-access-token']).toBeUndefined();
        expect(call.headers['x-tenant-id']).toBeUndefined();
      }
    } finally {
      await proxy.deactivate();
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
});
