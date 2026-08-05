/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IProvider } from '@/common/config/storage';
import {
  LocalPersonalModelProxy,
  PersonalModelGatewayService,
  type PersonalModelAuthClient,
  type PersonalModelProviderStore,
  type PersonalModelProxy,
  type PersonalModelSecretRecord,
  type PersonalModelSecretVault,
} from '@/process/services/PersonalModelGatewayService';

class MemoryVault implements PersonalModelSecretVault {
  available = true;
  records = new Map<string, PersonalModelSecretRecord>();

  isAvailable(): boolean {
    return this.available;
  }

  async get(userId: string, credentialId: string): Promise<PersonalModelSecretRecord | null> {
    return this.records.get(`${userId}:${credentialId}`) ?? null;
  }

  async put(record: PersonalModelSecretRecord): Promise<void> {
    this.records.set(`${record.userId}:${record.credentialId}`, record);
  }

  async delete(userId: string, credentialId: string): Promise<void> {
    this.records.delete(`${userId}:${credentialId}`);
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

const createAuthClient = (status: 'PENDING_CLAIM' | 'ENABLED' | 'REVOKED' = 'PENDING_CLAIM') =>
  ({
    listPersonalModelCredentials: vi.fn().mockResolvedValue([
      {
        credentialId: 'credential-1',
        accessKeyId: 'uk-gea-1',
        agentCode: 'sales-forecast',
        status,
        tenantId: '1',
      },
    ]),
    claimPersonalModelCredential: vi.fn().mockResolvedValue({
      credentialId: 'credential-1',
      accessKeyId: 'uk-gea-1',
      agentCode: 'sales-forecast',
      status: 'ENABLED',
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
    const service = new PersonalModelGatewayService(vault, providerStore, proxy);

    await expect(service.sync({ id: 'user-1', username: 'zhangsan', realname: '张三' }, authClient)).resolves.toEqual({
      configured: 1,
      failed: 0,
      skipped: 0,
      status: 'completed',
    });

    const record = await vault.get('user-1', 'credential-1');
    expect(record).toMatchObject({ secret: 'sk-user-sensitive', agentCode: 'sales-forecast' });
    expect(providerStore.providers).toHaveLength(1);
    expect(providerStore.providers[0]).toMatchObject({
      id: expect.stringMatching(/^gea-personal-/),
      name: 'GEA · sales-forecast',
      api_key: 'local-proxy-key',
      models: ['deepseek-v4-flash'],
      enabled: true,
    });
    expect(JSON.stringify(providerStore.providers[0])).not.toContain('sk-user-sensitive');
  });

  it('reuses a securely stored secret and preserves user enable switches', async () => {
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    const firstProxy: PersonalModelProxy = {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/p' }),
    };
    const firstAuth = createAuthClient();
    const service = new PersonalModelGatewayService(vault, providerStore, firstProxy);
    const user = { id: 'user-1', username: 'zhangsan', realname: '张三' };
    await service.sync(user, firstAuth);

    providerStore.providers[0] = {
      ...providerStore.providers[0],
      enabled: false,
      model_enabled: { 'deepseek-v4-flash': false },
    };
    const enabledAuth = createAuthClient('ENABLED');
    await service.sync(user, enabledAuth);

    expect(enabledAuth.claimPersonalModelCredential).not.toHaveBeenCalled();
    expect(providerStore.providers[0]).toMatchObject({
      enabled: false,
      model_enabled: { 'deepseek-v4-flash': false },
    });
  });

  it('disables and clears a managed provider when GEA no longer returns models', async () => {
    const vault = new MemoryVault();
    const providerStore = new MemoryProviderStore();
    const proxy: PersonalModelProxy = {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/p' }),
    };
    const service = new PersonalModelGatewayService(vault, providerStore, proxy);
    const user = { id: 'user-1', username: 'zhangsan', realname: '张三' };
    await service.sync(user, createAuthClient());

    const emptyAuth = createAuthClient('ENABLED');
    vi.mocked(emptyAuth.listPersonalModels).mockResolvedValue([]);
    await service.sync(user, emptyAuth);

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
    const service = new PersonalModelGatewayService(vault, providerStore, proxy);
    const user = { id: 'user-1', username: 'zhangsan', realname: '张三' };
    const initialAuth = createAuthClient();
    vi.mocked(initialAuth.listPersonalModels).mockResolvedValue(['liteLLM']);
    await service.sync(user, initialAuth);

    const refreshedAuth = createAuthClient('ENABLED');
    vi.mocked(refreshedAuth.listPersonalModels).mockResolvedValue(['deepseek-chat']);
    await service.sync(user, refreshedAuth);

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
    const service = new PersonalModelGatewayService(vault, new MemoryProviderStore());

    await expect(service.sync({ id: 'user-1', username: 'zhangsan', realname: '张三' }, authClient)).resolves.toEqual({
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
    const service = new PersonalModelGatewayService(vault, providerStore, {
      deactivate: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/p' }),
    });
    const user = { id: 'user-1', username: 'zhangsan', realname: '张三' };
    await service.sync(user, createAuthClient());
    const provider = providerStore.providers[0];
    expect(await vault.get(user.id, 'credential-1')).not.toBeNull();

    await service.sync(user, createAuthClient('REVOKED'));

    expect(await vault.get(user.id, 'credential-1')).toBeNull();
    expect(providerStore.providers.find((item) => item.id === provider.id)?.enabled).toBe(false);
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
    upstream = http.createServer((req, res) => {
      upstreamAuthorization = req.headers.authorization ?? '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    await new Promise<void>((resolve) => upstream!.listen(0, '127.0.0.1', resolve));
    const upstreamPort = (upstream.address() as AddressInfo).port;
    proxy = new LocalPersonalModelProxy();
    const config = await proxy.register(
      {
        userId: 'user-1',
        credentialId: 'credential-1',
        accessKeyId: 'uk-gea-1',
        agentCode: 'sales-forecast',
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        proxyKey: 'local-proxy-key',
        secret: 'sk-user-sensitive',
      },
      vi.fn()
    );

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [] }),
    });

    expect(response.status).toBe(200);
    expect(upstreamAuthorization).toBe('Bearer sk-user-sensitive');
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
      agentCode: 'sales-forecast',
      status: 'ENABLED',
      baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
      secret: 'sk-user-sensitive',
    });
    vi.mocked(authClient.listPersonalModels).mockResolvedValue(['deepseek-chat']);
    const service = new PersonalModelGatewayService(vault, providerStore, proxy);

    await service.sync({ id: 'user-1', username: 'zhangsan', realname: '张三' }, authClient);
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
});
