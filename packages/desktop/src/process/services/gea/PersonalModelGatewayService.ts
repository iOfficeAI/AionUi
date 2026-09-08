/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import http, {
  type ClientRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { GEA_PERSONAL_PROVIDER_PREFIX } from '@/common/config/geaPersonalModel';
import type { IProvider } from '@/common/config/storage';
import type { LarkAuthUser, PersonalModelSyncResult } from '@/common/types/platform/larkAuth';
import type { GeaClaimedPersonalModelCredential, GeaPersonalModelCredential } from '@aionui/web-host';

const GEA_PERSONAL_LOGIN_REQUIRED = 'GEA_PERSONAL_LOGIN_REQUIRED';

export type PersonalModelSecretRecord = {
  accessKeyId: string;
  tenantId: string;
  baseUrl: string;
  credentialId: string;
  environmentId: string;
  proxyKey: string;
  secret: string;
  userId: string;
};

export interface PersonalModelSecretVault {
  delete(environmentId: string, userId: string, credentialId: string, tenantId: string): Promise<void>;
  get(
    environmentId: string,
    userId: string,
    credentialId: string,
    tenantId: string
  ): Promise<PersonalModelSecretRecord | null>;
  isAvailable(): boolean;
  put(record: PersonalModelSecretRecord): Promise<void>;
}

export interface PersonalModelProviderStore {
  list(): Promise<IProvider[]>;
  save(provider: IProvider, exists: boolean): Promise<void>;
}

export interface PersonalModelAuthClient {
  claimPersonalModelCredential(credentialId: string): Promise<GeaClaimedPersonalModelCredential>;
  listPersonalModelCredentials(): Promise<GeaPersonalModelCredential[]>;
  listPersonalModels(baseUrl: string, secret: string, agentCode: string): Promise<string[]>;
}

export interface PersonalModelProxy {
  deactivate(): Promise<void>;
  register(
    record: PersonalModelSecretRecord,
    agentCode: string,
    onRejected: (status: 401 | 403 | 404) => Promise<void>
  ): Promise<{ apiKey: string; baseUrl: string }>;
}

export class PersonalModelGatewayService {
  private syncPromise: Promise<PersonalModelSyncResult> | null = null;
  private syncScope = '';
  private generation = 0;
  private readonly failedRecoveryClaims = new Set<string>();

  constructor(
    private readonly vault: PersonalModelSecretVault,
    private readonly providerStore: PersonalModelProviderStore,
    private readonly environmentId: string,
    private readonly proxy: PersonalModelProxy = new LocalPersonalModelProxy()
  ) {}

  sync(
    user: LarkAuthUser,
    authClient: PersonalModelAuthClient,
    agentCodes: readonly string[]
  ): Promise<PersonalModelSyncResult> {
    if (!Array.isArray(agentCodes) || agentCodes.some((code) => typeof code !== 'string')) {
      return Promise.resolve({
        configured: 0,
        failed: 1,
        skipped: 0,
        status: 'partial',
        reason: 'agentSelectionRequired',
      });
    }
    const codes = [...new Set(agentCodes.map((code) => code.trim()))];
    const scope = JSON.stringify([user.id, user.tenantId ?? '0', codes]);
    if (this.syncPromise && this.syncScope !== scope) {
      const generation = this.generation;
      return this.syncPromise
        .catch(() => {})
        .then(() =>
          generation === this.generation
            ? this.sync(user, authClient, codes)
            : {
                configured: 0,
                failed: 0,
                skipped: 0,
                status: 'notAuthenticated' as const,
                reason: 'notAuthenticated' as const,
              }
        );
    }
    this.syncScope = scope;
    this.syncPromise ??= this.runSync(user, authClient, codes, ++this.generation).finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  async deactivate(): Promise<void> {
    this.generation += 1;
    await this.proxy.deactivate();
    await this.syncPromise?.catch(() => {});
    let providers: IProvider[];
    try {
      providers = await this.providerStore.list();
    } catch {
      return;
    }
    await this.suspendManagedProviders(providers);
  }

  private async runSync(
    user: LarkAuthUser,
    authClient: PersonalModelAuthClient,
    agentCodes: string[],
    generation: number
  ): Promise<PersonalModelSyncResult> {
    const assertCurrent = () => {
      if (generation !== this.generation) throw new Error('GEA_PERSONAL_SYNC_CANCELLED');
    };
    if (agentCodes.length === 0 || agentCodes.some((code) => !code || code.length > 100 || /[\r\n]/.test(code))) {
      return { configured: 0, failed: 1, skipped: 0, status: 'partial', reason: 'agentSelectionRequired' };
    }
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
    assertCurrent();
    await this.proxy.deactivate();
    providers = await this.suspendManagedProviders(providers);
    assertCurrent();

    const providersById = new Map(providers.map((provider) => [provider.id, provider]));
    let configured = 0;
    let failed = 0;
    let reason: PersonalModelSyncResult['reason'];
    let skipped = 0;

    // The v2 gateway owns one credential per tenant/user. Never claim legacy multi-Agent keys.
    if (credentials.length > 1) {
      return { configured: 0, failed: 1, skipped: 0, status: 'partial', reason: 'credentialListFailed' };
    }
    const tenantId = user.tenantId ?? '0';
    const credential = credentials[0];
    if (!credential) return { configured: 0, failed: 0, skipped: 0, status: 'completed' };
    if (credential.status === 'DISABLED' || credential.status === 'REVOKED') {
      await this.vault.delete(this.environmentId, user.id, credential.credentialId, tenantId);
      return { configured: 0, failed: 0, skipped: 1, status: 'completed' };
    }
    let record: PersonalModelSecretRecord;
    try {
      record = await this.resolveSecretRecord(user.id, tenantId, credential, authClient);
      assertCurrent();
    } catch {
      return {
        configured: 0,
        failed: 1,
        skipped: 0,
        status: 'partial',
        reason:
          credential.status === 'ACTIVE' || credential.status === 'ENABLED'
            ? 'credentialRecoveryRequired'
            : 'credentialClaimFailed',
      };
    }
    // Discovery is sequential: a rejected shared key must stop requests to every remaining Agent.
    /* oxlint-disable no-await-in-loop */
    for (const agentCode of agentCodes) {
      const providerId = createPersonalModelProviderId(
        this.environmentId,
        user.id,
        credential.credentialId,
        agentCode,
        tenantId
      );
      const existing = providersById.get(providerId);
      let failureReason: PersonalModelSyncResult['reason'] = 'modelDiscoveryFailed';
      try {
        assertCurrent();
        const models = await authClient.listPersonalModels(record.baseUrl, record.secret, agentCode);
        assertCurrent();
        if (models.length === 0) {
          if (existing) {
            const unavailable: IProvider = {
              ...existing,
              enabled: false,
              models: [],
              model_enabled: {},
              model_health: undefined,
              model_settings: undefined,
            };
            await this.providerStore.save(unavailable, true);
            providersById.set(providerId, unavailable);
          }
          skipped += 1;
          continue;
        }
        failureReason = 'localProxyFailed';
        const proxyConfig = await this.proxy.register(record, agentCode, (status) =>
          status === 404
            ? this.refreshAgentModels(record, providerId, agentCode, authClient, generation)
            : this.handleRejected(record, providerId, status, generation)
        );
        assertCurrent();
        const provider = buildManagedProvider(providerId, agentCode, models, proxyConfig, existing);
        failureReason = 'providerSaveFailed';
        await this.providerStore.save(provider, Boolean(existing));
        if (generation !== this.generation) {
          await this.providerStore.save(suspendManagedProviderForLogin(provider), true);
          throw new Error('GEA_PERSONAL_SYNC_CANCELLED');
        }
        providersById.set(providerId, provider);
        configured += 1;
      } catch (error) {
        failed += 1;
        reason ??= failureReason;
        if (typeof error === 'object' && error !== null && 'httpStatus' in error && error.httpStatus === 401) {
          await this.vault.delete(this.environmentId, user.id, credential.credentialId, tenantId);
          await this.proxy.deactivate();
          await this.suspendManagedProviders(await this.providerStore.list());
          configured = 0;
          reason = 'credentialRecoveryRequired';
          break;
        }
      }
    }
    /* oxlint-enable no-await-in-loop */

    return {
      configured,
      failed,
      reason,
      skipped,
      status: failed > 0 ? 'partial' : 'completed',
    };
  }

  private async suspendManagedProviders(providers: IProvider[]): Promise<IProvider[]> {
    // A process restart may select a different GEA before that environment
    // can authenticate or finish a credential sync. Suspend every enabled
    // GEA-managed provider at that boundary so a provider from the previous
    // environment can never remain usable as a fallback.
    const updates = providers
      .filter((provider) => provider.enabled !== false && provider.id.startsWith(GEA_PERSONAL_PROVIDER_PREFIX))
      .map(suspendManagedProviderForLogin);
    await Promise.all(updates.map((provider) => this.providerStore.save(provider, true).catch(() => {})));
    const updatesById = new Map(updates.map((provider) => [provider.id, provider]));
    return providers.map((provider) => updatesById.get(provider.id) ?? provider);
  }

  private async resolveSecretRecord(
    userId: string,
    tenantId: string,
    credential: GeaPersonalModelCredential,
    authClient: PersonalModelAuthClient
  ): Promise<PersonalModelSecretRecord> {
    if (credential.status === 'ACTIVE' || credential.status === 'ENABLED') {
      const record = await this.vault.get(this.environmentId, userId, credential.credentialId, tenantId);
      if (record && record.accessKeyId === credential.accessKeyId) return record;
      if (credential.status === 'ACTIVE') throw new Error('GEA_PERSONAL_CREDENTIAL_RECOVERY_REQUIRED');
    }
    await this.vault.delete(this.environmentId, userId, credential.credentialId, tenantId);

    const recoveryKey = `${tenantId}\0${userId}\0${credential.credentialId}\0${credential.accessKeyId}`;
    if (credential.status === 'ENABLED' && this.failedRecoveryClaims.has(recoveryKey)) {
      throw new Error('GEA_PERSONAL_CREDENTIAL_RECOVERY_REQUIRED');
    }
    // The deployed shared-key API uses ENABLED and permits recovery through claim.
    // Keep ACTIVE's one-time semantics; never blindly repeat a failed recovery.
    if (credential.status === 'ENABLED') this.failedRecoveryClaims.add(recoveryKey);
    const claimed = await authClient.claimPersonalModelCredential(credential.credentialId);
    if (
      claimed.credentialId !== credential.credentialId ||
      claimed.accessKeyId !== credential.accessKeyId ||
      (claimed.status !== 'ACTIVE' && claimed.status !== 'ENABLED')
    ) {
      throw new Error('GEA_PERSONAL_CREDENTIAL_MISMATCH');
    }

    const record: PersonalModelSecretRecord = {
      environmentId: this.environmentId,
      userId,
      credentialId: claimed.credentialId,
      accessKeyId: claimed.accessKeyId,
      tenantId,
      baseUrl: claimed.baseUrl,
      secret: claimed.secret,
      proxyKey: randomBytes(32).toString('base64url'),
    };
    await this.vault.put(record);
    this.failedRecoveryClaims.delete(recoveryKey);
    return record;
  }

  private async refreshAgentModels(
    record: PersonalModelSecretRecord,
    providerId: string,
    agentCode: string,
    authClient: PersonalModelAuthClient,
    generation: number
  ): Promise<void> {
    if (generation !== this.generation) return;
    try {
      const models = await authClient.listPersonalModels(record.baseUrl, record.secret, agentCode);
      const providers = await this.providerStore.list();
      if (generation !== this.generation) return;
      const existing = providers.find((provider) => provider.id === providerId);
      if (!existing) return;
      const updated = buildManagedProvider(
        providerId,
        agentCode,
        models,
        {
          apiKey: existing.api_key,
          baseUrl: existing.base_url,
        },
        existing
      );
      await this.providerStore.save({ ...updated, enabled: models.length > 0 && updated.enabled }, true);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'httpStatus' in error &&
        (error.httpStatus === 401 || error.httpStatus === 403)
      ) {
        if (error.httpStatus === 401 && generation === this.generation) await this.proxy.deactivate();
        await this.handleRejected(record, providerId, error.httpStatus, generation);
      }
      // Preserve the original chat error. Model discovery never replays the chat.
    }
  }

  private async handleRejected(
    record: PersonalModelSecretRecord,
    providerId: string,
    status: 401 | 403,
    generation: number
  ): Promise<void> {
    if (generation !== this.generation) return;
    if (status === 401) {
      await this.vault.delete(this.environmentId, record.userId, record.credentialId, record.tenantId).catch(() => {});
    }
    try {
      const providers = await this.providerStore.list();
      if (generation !== this.generation) return;
      const prefix = createPersonalModelCredentialScope(
        record.environmentId,
        record.userId,
        record.credentialId,
        record.tenantId
      );
      await Promise.all(
        providers
          .filter((item) => (status === 401 ? item.id.startsWith(prefix) : item.id === providerId))
          .map((provider) => this.providerStore.save({ ...provider, enabled: false }, true))
      );
    } catch {
      // The rejected route has already been removed from memory.
    }
  }
}

function createPersonalModelProviderScope(environmentId: string): string {
  const environmentDigest = createHash('sha256').update(environmentId).digest('hex').slice(0, 12);
  return `${GEA_PERSONAL_PROVIDER_PREFIX}${environmentDigest}-`;
}

function createPersonalModelCredentialScope(
  environmentId: string,
  userId: string,
  credentialId: string,
  tenantId: string
): string {
  const digest = createHash('sha256').update(`${tenantId}\0${userId}\0${credentialId}`).digest('hex').slice(0, 24);
  return `${createPersonalModelProviderScope(environmentId)}${digest}-`;
}

export function createPersonalModelProviderId(
  environmentId: string,
  userId: string,
  credentialId: string,
  agentCode: string,
  tenantId: string
): string {
  const agentDigest = createHash('sha256').update(agentCode).digest('hex').slice(0, 16);
  return `${createPersonalModelCredentialScope(environmentId, userId, credentialId, tenantId)}${agentDigest}`;
}

function buildManagedProvider(
  providerId: string,
  agentCode: string,
  models: string[],
  proxyConfig: { apiKey: string; baseUrl: string },
  existing?: IProvider
): IProvider {
  const modelSet = new Set(models);
  const modelEnabled = Object.fromEntries(models.map((model) => [model, existing?.model_enabled?.[model] !== false]));
  const wasSuspendedForLogin = Object.values(existing?.model_health ?? {}).some(
    (health) => health.error === GEA_PERSONAL_LOGIN_REQUIRED
  );
  const modelHealth = existing?.model_health
    ? Object.fromEntries(
        Object.entries(existing.model_health).filter(
          ([model, health]) => modelSet.has(model) && health.error !== GEA_PERSONAL_LOGIN_REQUIRED
        )
      )
    : undefined;
  return {
    id: providerId,
    platform: 'openai',
    name: `GEA · ${agentCode}`,
    base_url: proxyConfig.baseUrl,
    api_key: proxyConfig.apiKey,
    models,
    enabled: wasSuspendedForLogin ? true : (existing?.enabled ?? true),
    model_enabled: modelEnabled,
    capabilities: [{ type: 'text' }, { type: 'function_calling' }],
    model_health: modelHealth && Object.keys(modelHealth).length > 0 ? modelHealth : undefined,
    model_settings: Object.fromEntries(
      models.map((model) => [
        model,
        {
          ...existing?.model_settings?.[model],
          initial_tool_choice: 'required' as const,
        },
      ])
    ),
  };
}

function suspendManagedProviderForLogin(provider: IProvider): IProvider {
  return {
    ...provider,
    enabled: false,
    model_health: Object.fromEntries(
      provider.models.map((model) => [
        model,
        {
          status: 'unhealthy' as const,
          error: GEA_PERSONAL_LOGIN_REQUIRED,
        },
      ])
    ),
  };
}

type ProxyRoute = {
  agentCode: string;
  proxyKey: string;
  onRejected: (status: 401 | 403 | 404) => Promise<void>;
  record: PersonalModelSecretRecord;
};

export class LocalPersonalModelProxy implements PersonalModelProxy {
  private readonly routes = new Map<string, ProxyRoute>();
  private server: Server | null = null;
  private starting: Promise<Server> | null = null;
  private generation = 0;
  private readonly requests = new Set<ClientRequest>();

  async register(
    record: PersonalModelSecretRecord,
    agentCode: string,
    onRejected: (status: 401 | 403 | 404) => Promise<void>
  ): Promise<{ apiKey: string; baseUrl: string }> {
    const generation = this.generation;
    if (!agentCode || agentCode.length > 100 || /[\r\n]/.test(agentCode)) throw new Error('GEA_PERSONAL_AGENT_INVALID');
    const server = await this.ensureStarted();
    if (generation !== this.generation) throw new Error('GEA_PERSONAL_PROXY_CANCELLED');
    const providerId = createPersonalModelProviderId(
      record.environmentId,
      record.userId,
      record.credentialId,
      agentCode,
      record.tenantId
    );
    const proxyKey = createHmac('sha256', record.proxyKey).update(agentCode).digest('base64url');
    this.routes.set(providerId, { record, agentCode, proxyKey, onRejected });
    const port = (server.address() as AddressInfo).port;
    return {
      apiKey: proxyKey,
      baseUrl: `http://127.0.0.1:${port}/personal/${providerId}`,
    };
  }

  async deactivate(): Promise<void> {
    this.generation += 1;
    this.routes.clear();
    for (const request of this.requests) request.destroy();
    this.requests.clear();
    await this.starting?.catch(() => {});
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }

  private async ensureStarted(): Promise<Server> {
    if (this.starting) return this.starting;
    if (this.server) return this.server;
    const server = http.createServer((req, res) => this.forward(req, res));
    this.starting = new Promise<Server>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        server.unref();
        this.server = server;
        resolve(server);
      });
    }).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private forward(req: IncomingMessage, res: ServerResponse): void {
    const incomingUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const match = incomingUrl.pathname.match(
      /^\/personal\/(gea-personal-[a-f0-9]{12}-[a-f0-9]{24}-[a-f0-9]{16})(\/.*)?$/
    );
    const providerId = match?.[1] ?? '';
    const route = this.routes.get(providerId);
    if (!route || !hasExpectedBearer(req.headers.authorization, route.proxyKey)) {
      writeProxyError(res, 401, 'invalid_api_key');
      return;
    }

    const suffix = match?.[2] || '/';
    if (
      !((suffix === '/models' && req.method === 'GET') || (suffix === '/chat/completions' && req.method === 'POST')) ||
      incomingUrl.search
    ) {
      writeProxyError(res, 400, 'invalid_request');
      return;
    }
    const target = new URL(`${route.record.baseUrl.replace(/\/$/, '')}${suffix}${incomingUrl.search}`);
    const headers = forwardHeaders(req.headers, route.record.secret, route.agentCode);
    const requestImpl = target.protocol === 'https:' ? https.request : http.request;
    const upstream = requestImpl(
      target,
      {
        method: req.method,
        headers,
      },
      (upstreamResponse) => {
        const responseHeaders = { ...upstreamResponse.headers };
        const normalizeSse = shouldNormalizeGeaSse(
          responseHeaders['content-type'],
          responseHeaders['content-encoding']
        );
        if (normalizeSse) delete responseHeaders['content-length'];
        res.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
        if (normalizeSse) upstreamResponse.pipe(createGeaSseNormalizer()).pipe(res);
        else upstreamResponse.pipe(res);
        if (
          upstreamResponse.statusCode === 401 ||
          upstreamResponse.statusCode === 403 ||
          upstreamResponse.statusCode === 404
        ) {
          if (upstreamResponse.statusCode === 401) {
            const scope = createPersonalModelCredentialScope(
              route.record.environmentId,
              route.record.userId,
              route.record.credentialId,
              route.record.tenantId
            );
            for (const id of this.routes.keys()) if (id.startsWith(scope)) this.routes.delete(id);
          } else if (upstreamResponse.statusCode === 403) this.routes.delete(providerId);
          void route.onRejected(upstreamResponse.statusCode).catch(() => {});
        }
      }
    );
    this.requests.add(upstream);
    const connectTimeout = setTimeout(() => upstream.destroy(), 5_000);
    upstream.once('socket', (socket) => {
      if (!socket.connecting) clearTimeout(connectTimeout);
      else socket.once(target.protocol === 'https:' ? 'secureConnect' : 'connect', () => clearTimeout(connectTimeout));
    });
    upstream.once('close', () => {
      clearTimeout(connectTimeout);
      this.requests.delete(upstream);
    });
    upstream.setTimeout(120_000, () => upstream.destroy());
    res.once('close', () => {
      if (!res.writableFinished) upstream.destroy();
    });
    upstream.on('error', () => {
      if (!res.headersSent) writeProxyError(res, 502, 'gateway_unavailable');
      else res.destroy();
    });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shouldNormalizeGeaSse(
  contentType: string | string[] | undefined,
  contentEncoding: string | undefined
): boolean {
  const resolvedContentType = Array.isArray(contentType) ? contentType[0] : contentType;
  return (
    resolvedContentType?.toLowerCase().startsWith('text/event-stream') === true &&
    (!contentEncoding || contentEncoding.toLowerCase() === 'identity')
  );
}

function createGeaSseNormalizer(): Transform {
  const decoder = new StringDecoder('utf8');
  let pending = '';

  return new Transform({
    transform(chunk, _encoding, callback) {
      pending += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      if (lines.length > 0) this.push(`${lines.map(normalizeGeaSseLine).join('\n')}\n`);
      callback();
    },
    flush(callback) {
      pending += decoder.end();
      if (pending) this.push(normalizeGeaSseLine(pending));
      callback();
    },
  });
}

function normalizeGeaSseLine(line: string): string {
  const carriageReturn = line.endsWith('\r') ? '\r' : '';
  const content = carriageReturn ? line.slice(0, -1) : line;
  if (!content.startsWith('data:')) return line;

  const rawData = content.slice('data:'.length);
  const data = rawData.startsWith(' ') ? rawData.slice(1) : rawData;
  if (data === '[DONE]') return `data: [DONE]${carriageReturn}`;

  try {
    const event = JSON.parse(data) as Record<string, unknown>;
    if (Array.isArray(event.choices)) {
      event.choices = event.choices.map((choice) =>
        isRecord(choice) && choice.finish_reason === 'tool_execution'
          ? { ...choice, finish_reason: 'tool_calls' }
          : choice
      );
    }
    return `data: ${JSON.stringify(event)}${carriageReturn}`;
  } catch {
    return `data: ${data}${carriageReturn}`;
  }
}

function hasExpectedBearer(value: string | undefined, expected: string): boolean {
  const actual = value?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function forwardHeaders(headers: IncomingHttpHeaders, secret: string, agentCode: string): IncomingHttpHeaders {
  // Forward protocol headers only; caller-provided Agent and identity headers are never authority.
  const safeHeaders: IncomingHttpHeaders = { authorization: `Bearer ${secret}`, 'x-gea-agent-code': agentCode };
  for (const name of ['accept', 'content-type', 'content-length', 'accept-encoding']) {
    if (headers[name] !== undefined) safeHeaders[name] = headers[name];
  }
  return safeHeaders;
}

function writeProxyError(res: ServerResponse, status: number, code: string): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ error: { code } }));
}
