/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import http, { type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { GEA_PERSONAL_PROVIDER_PREFIX } from '@/common/config/geaPersonalModel';
import type { IProvider } from '@/common/config/storage';
import type { LarkAuthUser, PersonalModelSyncResult } from '@/common/types/platform/larkAuth';
import type { GeaClaimedPersonalModelCredential, GeaPersonalModelCredential } from '@aionui/web-host';

export type PersonalModelSecretRecord = {
  accessKeyId: string;
  agentCode: string;
  baseUrl: string;
  credentialId: string;
  proxyKey: string;
  secret: string;
  userId: string;
};

export interface PersonalModelSecretVault {
  delete(userId: string, credentialId: string): Promise<void>;
  get(userId: string, credentialId: string): Promise<PersonalModelSecretRecord | null>;
  isAvailable(): boolean;
  put(record: PersonalModelSecretRecord): Promise<void>;
}

export interface PersonalModelProviderStore {
  list(): Promise<IProvider[]>;
  save(provider: IProvider, exists: boolean): Promise<void>;
}

export interface PersonalModelAuthClient {
  claimPersonalModelCredential(credentialId: string, tenantId: string): Promise<GeaClaimedPersonalModelCredential>;
  listPersonalModelCredentials(): Promise<GeaPersonalModelCredential[]>;
  listPersonalModels(baseUrl: string, secret: string): Promise<string[]>;
}

export interface PersonalModelProxy {
  deactivate(): Promise<void>;
  register(
    record: PersonalModelSecretRecord,
    onRejected: (status: 401 | 403) => Promise<void>
  ): Promise<{ apiKey: string; baseUrl: string }>;
}

export class PersonalModelGatewayService {
  private syncPromise: Promise<PersonalModelSyncResult> | null = null;

  constructor(
    private readonly vault: PersonalModelSecretVault,
    private readonly providerStore: PersonalModelProviderStore,
    private readonly proxy: PersonalModelProxy = new LocalPersonalModelProxy()
  ) {}

  sync(user: LarkAuthUser, authClient: PersonalModelAuthClient): Promise<PersonalModelSyncResult> {
    this.syncPromise ??= this.runSync(user, authClient).finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  async deactivate(): Promise<void> {
    await this.proxy.deactivate();
  }

  private async runSync(user: LarkAuthUser, authClient: PersonalModelAuthClient): Promise<PersonalModelSyncResult> {
    await this.proxy.deactivate();
    if (!this.vault.isAvailable()) {
      return {
        configured: 0,
        failed: 0,
        reason: 'secureStorageUnavailable',
        skipped: 0,
        status: 'unavailable',
      };
    }

    let credentials: GeaPersonalModelCredential[];
    try {
      credentials = await authClient.listPersonalModelCredentials();
    } catch {
      return {
        configured: 0,
        failed: 1,
        reason: 'credentialListFailed',
        skipped: 0,
        status: 'partial',
      };
    }

    let providers: IProvider[];
    try {
      providers = await this.providerStore.list();
    } catch {
      return {
        configured: 0,
        failed: 1,
        reason: 'providerListFailed',
        skipped: 0,
        status: 'partial',
      };
    }

    const providersById = new Map(providers.map((provider) => [provider.id, provider]));
    let configured = 0;
    let failed = 0;
    let reason: PersonalModelSyncResult['reason'];
    let skipped = 0;

    for (const credential of credentials) {
      const providerId = createPersonalModelProviderId(user.id, credential.credentialId);
      const existing = providersById.get(providerId);
      let failureReason: PersonalModelSyncResult['reason'] =
        credential.status === 'ENABLED' ? 'credentialSyncFailed' : 'credentialClaimFailed';
      try {
        if (credential.status === 'DISABLED' || credential.status === 'REVOKED') {
          if (credential.status === 'REVOKED') {
            await this.vault.delete(user.id, credential.credentialId);
          }
          if (existing) {
            const disabled = { ...existing, enabled: false };
            await this.providerStore.save(disabled, true);
            providersById.set(providerId, disabled);
            configured += 1;
          } else {
            skipped += 1;
          }
          continue;
        }

        const record = await this.resolveSecretRecord(user.id, credential, authClient);
        if (!record) {
          skipped += 1;
          continue;
        }

        failureReason = 'modelDiscoveryFailed';
        const models = await authClient.listPersonalModels(record.baseUrl, record.secret);
        if (models.length === 0) {
          skipped += 1;
          continue;
        }

        failureReason = 'localProxyFailed';
        const proxyConfig = await this.proxy.register(record, (status) =>
          this.handleRejected(record.userId, record.credentialId, providerId, status)
        );
        const provider = buildManagedProvider(providerId, record, models, proxyConfig, existing);
        failureReason = 'providerSaveFailed';
        await this.providerStore.save(provider, Boolean(existing));
        providersById.set(providerId, provider);
        configured += 1;
      } catch {
        failed += 1;
        reason ??= failureReason;
      }
    }

    return {
      configured,
      failed,
      reason,
      skipped,
      status: failed > 0 ? 'partial' : 'completed',
    };
  }

  private async resolveSecretRecord(
    userId: string,
    credential: GeaPersonalModelCredential,
    authClient: PersonalModelAuthClient
  ): Promise<PersonalModelSecretRecord | null> {
    if (credential.status === 'ENABLED') {
      return this.vault.get(userId, credential.credentialId);
    }

    const claimed = await authClient.claimPersonalModelCredential(credential.credentialId, credential.tenantId);
    if (
      claimed.credentialId !== credential.credentialId ||
      claimed.accessKeyId !== credential.accessKeyId ||
      claimed.agentCode !== credential.agentCode
    ) {
      throw new Error('GEA_PERSONAL_CREDENTIAL_MISMATCH');
    }

    const record: PersonalModelSecretRecord = {
      userId,
      credentialId: claimed.credentialId,
      accessKeyId: claimed.accessKeyId,
      agentCode: claimed.agentCode,
      baseUrl: claimed.baseUrl,
      secret: claimed.secret,
      proxyKey: randomBytes(32).toString('base64url'),
    };
    await this.vault.put(record);
    return record;
  }

  private async handleRejected(
    userId: string,
    credentialId: string,
    providerId: string,
    status: 401 | 403
  ): Promise<void> {
    if (status === 401) {
      await this.vault.delete(userId, credentialId).catch(() => {});
    }
    try {
      const providers = await this.providerStore.list();
      const provider = providers.find((item) => item.id === providerId);
      if (provider) {
        await this.providerStore.save({ ...provider, enabled: false }, true);
      }
    } catch {
      // The remote secret is already gone from memory and secure storage.
    }
  }
}

function createPersonalModelProviderId(userId: string, credentialId: string): string {
  const digest = createHash('sha256').update(`${userId}\0${credentialId}`).digest('hex').slice(0, 24);
  return `${GEA_PERSONAL_PROVIDER_PREFIX}${digest}`;
}

function buildManagedProvider(
  providerId: string,
  record: PersonalModelSecretRecord,
  models: string[],
  proxyConfig: { apiKey: string; baseUrl: string },
  existing?: IProvider
): IProvider {
  const modelSet = new Set(models);
  const modelEnabled = Object.fromEntries(models.map((model) => [model, existing?.model_enabled?.[model] !== false]));
  return {
    id: providerId,
    platform: 'openai',
    name: `GEA · ${record.agentCode}`,
    base_url: proxyConfig.baseUrl,
    api_key: proxyConfig.apiKey,
    models,
    enabled: existing?.enabled ?? true,
    model_enabled: modelEnabled,
    capabilities: [{ type: 'text' }, { type: 'function_calling' }],
    model_health: existing?.model_health
      ? Object.fromEntries(Object.entries(existing.model_health).filter(([model]) => modelSet.has(model)))
      : undefined,
    model_settings: existing?.model_settings
      ? Object.fromEntries(Object.entries(existing.model_settings).filter(([model]) => modelSet.has(model)))
      : undefined,
  };
}

type ProxyRoute = {
  onRejected: (status: 401 | 403) => Promise<void>;
  record: PersonalModelSecretRecord;
};

export class LocalPersonalModelProxy implements PersonalModelProxy {
  private readonly routes = new Map<string, ProxyRoute>();
  private server: Server | null = null;

  async register(
    record: PersonalModelSecretRecord,
    onRejected: (status: 401 | 403) => Promise<void>
  ): Promise<{ apiKey: string; baseUrl: string }> {
    const server = await this.ensureStarted();
    const providerId = createPersonalModelProviderId(record.userId, record.credentialId);
    this.routes.set(providerId, { record, onRejected });
    const port = (server.address() as AddressInfo).port;
    return {
      apiKey: record.proxyKey,
      baseUrl: `http://127.0.0.1:${port}/personal/${providerId}`,
    };
  }

  async deactivate(): Promise<void> {
    this.routes.clear();
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async ensureStarted(): Promise<Server> {
    if (this.server) return this.server;
    const server = http.createServer((req, res) => this.forward(req, res));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    server.unref();
    this.server = server;
    return server;
  }

  private forward(req: IncomingMessage, res: ServerResponse): void {
    const incomingUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const match = incomingUrl.pathname.match(/^\/personal\/(gea-personal-[a-f0-9]{24})(\/.*)?$/);
    const providerId = match?.[1] ?? '';
    const route = this.routes.get(providerId);
    if (!route || !hasExpectedBearer(req.headers.authorization, route.record.proxyKey)) {
      writeProxyError(res, 401, 'invalid_api_key');
      return;
    }

    const suffix = match?.[2] || '/';
    const target = new URL(`${route.record.baseUrl.replace(/\/$/, '')}${suffix}${incomingUrl.search}`);
    const headers = forwardHeaders(req.headers, route.record.secret);
    const requestImpl = target.protocol === 'https:' ? https.request : http.request;
    const upstream = requestImpl(
      target,
      {
        method: req.method,
        headers,
      },
      (upstreamResponse) => {
        res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(res);
        if (upstreamResponse.statusCode === 401 || upstreamResponse.statusCode === 403) {
          this.routes.delete(providerId);
          void route.onRejected(upstreamResponse.statusCode);
        }
      }
    );
    upstream.on('error', () => {
      if (!res.headersSent) writeProxyError(res, 502, 'gateway_unavailable');
      else res.destroy();
    });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  }
}

function hasExpectedBearer(value: string | undefined, expected: string): boolean {
  const actual = value?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function forwardHeaders(headers: IncomingHttpHeaders, secret: string): IncomingHttpHeaders {
  const {
    authorization: _authorization,
    connection: _connection,
    cookie: _cookie,
    host: _host,
    'proxy-authorization': _proxyAuthorization,
    'proxy-connection': _proxyConnection,
    ...safeHeaders
  } = headers;
  return { ...safeHeaders, authorization: `Bearer ${secret}` };
}

function writeProxyError(res: ServerResponse, status: number, code: string): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ error: { code } }));
}
