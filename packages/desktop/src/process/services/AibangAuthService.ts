import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants, createPublicKey, randomUUID, publicEncrypt } from 'node:crypto';
import path from 'node:path';
import { app } from 'electron';
import {
  BUNDLED_CODEX_VERSION,
  buildBundledCodexPath,
  buildScopedApiTokenRequest,
  findBuiltinCodexAgent,
  getCodexHome,
  normalizeNewApiUrl,
  removeCodexEnvOverrides,
  resolveScopedApiTokenExpiresAt,
  serializeCodexConfig,
  type AibangAuthConfig,
  type AibangAuthSession,
  type AgentEnvOverride,
} from './aibangAuthSerialization';
import { AIBANG_FORCED_CODEX_MODEL } from '@/common/config/constants';

type AgentOverrides = {
  command_override?: string | null;
  env_override?: AgentEnvOverride[];
};

type AioncoreResponse<T> = {
  success?: boolean;
  data?: T;
};

export type AibangLoginInput = {
  username?: string | undefined;
  password?: string | undefined;
  totpCode?: string | undefined;
};

export type AibangLoginResult =
  | { success: true; twoFactorRequired: true }
  | {
      success: true;
      twoFactorRequired: false;
      expiresAt: number;
      user: AibangAuthSession['user'];
    }
  | {
      success: false;
      code: 'invalidCredentials' | 'tooManyAttempts' | 'serverError' | 'networkError' | 'unknown';
      message?: string;
    };

export type AibangRegisterInput = {
  username: string;
  password: string;
  email?: string | undefined;
  verificationCode?: string | undefined;
};

export type AibangOperationResult =
  | { success: true; user?: AibangAuthSession['user'] }
  | { success: false; message?: string };

type NewApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

type NewApiUserDto = {
  id: number;
  username: string;
  quota: number;
};

type NewApiLoginData = {
  access_token?: string;
  access_expires_at?: number;
  require_2fa?: boolean;
  flow_token?: string;
  expires_at?: number;
  user?: NewApiUserDto;
};

type NewApiEncryptionKey = {
  enabled?: boolean;
  kid?: string;
  public_key?: string;
};

type NewApiToken = { id: number; name: string };
type NewApiTokenKeyData = { key?: string };

const authChannelName = 'aibang-auth';
const API_TOKEN_NAME_PREFIX = 'AIbang Desktop';
const DEFAULT_API_TOKEN_TTL_MINUTES = 720;
const DEFAULT_API_TOKEN_QUOTA = 500_000;
const REQUEST_TIMEOUT_MS = 10_000;

function toAuthUser(dto: NewApiUserDto | undefined): AibangAuthSession['user'] | undefined {
  const quota = Number(dto?.quota ?? 0);
  if (
    !dto ||
    !Number.isSafeInteger(dto.id) ||
    dto.id <= 0 ||
    typeof dto.username !== 'string' ||
    dto.username === '' ||
    !Number.isSafeInteger(quota) ||
    quota < 0
  ) {
    return undefined;
  }
  return { id: dto.id, username: dto.username, quota };
}

function epochMilliseconds(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function encryptPassword(password: string, publicKeyPem: string): string {
  const encrypted = publicEncrypt(
    {
      key: createPublicKey(publicKeyPem),
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(password, 'utf8')
  );
  return encrypted.toString('base64');
}

class AibangAuthService {
  private pendingTwoFactor: { flowToken: string; expiresAt: number } | undefined;
  private authOperationChain: Promise<unknown> = Promise.resolve();
  private previousCodexEnvironment:
    | {
        openAiPresent: boolean;
        openAiValue?: string;
        codexPresent: boolean;
        codexValue?: string;
      }
    | undefined;

  private resolveManagedCodexCommandOverride(currentOverride?: string | null): string | undefined {
    const appPath = app.getAppPath() === '.' ? process.cwd() : app.getAppPath();
    const packagedPath = app.isPackaged && process.resourcesPath ? buildBundledCodexPath(process.resourcesPath) : null;
    const developmentPath = app.isPackaged ? null : buildBundledCodexPath(appPath);
    const bundledPath = [packagedPath, developmentPath].find((candidate): candidate is string => {
      return Boolean(candidate && existsSync(candidate));
    });
    if (!bundledPath) return currentOverride ?? undefined;
    if (!currentOverride) return bundledPath;

    const isAppManagedOverride =
      currentOverride.includes(`${path.sep}bundled-aioncore${path.sep}`) &&
      currentOverride.includes(`${path.sep}cli${path.sep}codex${path.sep}${BUNDLED_CODEX_VERSION}${path.sep}`);
    return isAppManagedOverride ? bundledPath : currentOverride;
  }

  get config(): AibangAuthConfig {
    return {
      newApiUrl: normalizeNewApiUrl(process.env.AIBANG_NEW_API_URL),
      publicModel: process.env.AIBANG_PUBLIC_MODEL ?? AIBANG_FORCED_CODEX_MODEL,
      codexHome: this.codexHome,
    };
  }

  private get apiTokenTtlMilliseconds(): number {
    return positiveIntegerEnv('AIBANG_API_TOKEN_TTL_MINUTES', DEFAULT_API_TOKEN_TTL_MINUTES) * 60_000;
  }

  private get apiTokenQuota(): number {
    return positiveIntegerEnv('AIBANG_API_TOKEN_QUOTA', DEFAULT_API_TOKEN_QUOTA);
  }

  async getStatus(): Promise<{ authenticated: boolean; user?: AibangAuthSession['user'] }> {
    return this.runAuthOperation(() => this.getStatusInternal());
  }

  async refreshSession(): Promise<{ authenticated: boolean; user?: AibangAuthSession['user'] }> {
    return this.runAuthOperation(() => this.refreshSessionInternal());
  }

  async login(input: AibangLoginInput): Promise<AibangLoginResult> {
    return this.runAuthOperation(() => this.loginInternal(input));
  }

  async redeem(input: { key: string }): Promise<AibangOperationResult> {
    return this.runAuthOperation(() => this.redeemInternal(input));
  }

  async clearSession(): Promise<void> {
    return this.runAuthOperation(() => this.clearSessionInternal());
  }

  private async getStatusInternal(): Promise<{ authenticated: boolean; user?: AibangAuthSession['user'] }> {
    await this.removeCodexEnvOverridesBestEffort();
    const session = await this.readSession();
    if (!session) return { authenticated: false };
    if (session.expiresAt <= Date.now()) {
      await this.removeLocalSessionFiles();
      this.clearManagedCodexCredentials();
      return { authenticated: false };
    }
    try {
      await mkdir(this.codexHome, { recursive: true, mode: 0o700 });
      await this.writePrivateFile(this.configPath, serializeCodexConfig(this.config));
    } catch (error) {
      console.warn('[AibangAuth] Failed to refresh isolated Codex config:', error);
    }
    return { authenticated: true, user: session.user };
  }

  private async refreshSessionInternal(): Promise<{ authenticated: boolean; user?: AibangAuthSession['user'] }> {
    const session = await this.readSession();
    if (!session) return { authenticated: false };
    if (session.expiresAt <= Date.now()) {
      await this.removeLocalSessionFiles();
      this.clearManagedCodexCredentials();
      return { authenticated: false };
    }
    try {
      const data = await this.newApiRequest<NewApiEnvelope<NewApiUserDto>>(
        'GET',
        '/api/user/self',
        session.dashboardAccessToken
      );
      const user = toAuthUser(data.data);
      if (!data.success || !user) return { authenticated: true, user: session.user };
      await this.updateLocalSessionUser(user);
      return { authenticated: true, user };
    } catch (error) {
      if (error instanceof AibangHttpError && error.status === 401) {
        await this.removeLocalSessionFiles();
        this.clearManagedCodexCredentials();
        return { authenticated: false };
      }
      console.warn('[AibangAuth] Failed to refresh AIbang session:', error);
      return { authenticated: true, user: session.user };
    }
  }

  async configureSession(session: AibangAuthSession): Promise<void> {
    await mkdir(this.authDirectory, { recursive: true, mode: 0o700 });
    await mkdir(this.codexHome, { recursive: true, mode: 0o700 });
    try {
      await this.updateCodexOverrides((current) => ({
        command_override: this.resolveManagedCodexCommandOverride(current.command_override),
        env_override: removeCodexEnvOverrides(current.env_override ?? []),
      }));
      this.setManagedCodexCredentials(session.apiToken);
      await this.writePrivateFile(this.sessionPath, `${JSON.stringify(session)}\n`);
      await this.writePrivateFile(this.configPath, serializeCodexConfig(this.config));
      await this.writePrivateFile(this.authPath, `${JSON.stringify({ OPENAI_API_KEY: session.apiToken })}\n`);
    } catch (error) {
      this.clearManagedCodexCredentials();
      await Promise.all([
        rm(this.sessionPath, { force: true }).catch((_error: unknown): undefined => undefined),
        rm(this.configPath, { force: true }).catch((_error: unknown): undefined => undefined),
        rm(this.authPath, { force: true }).catch((_error: unknown): undefined => undefined),
      ]);
      throw error;
    }
  }

  private async loginInternal(input: AibangLoginInput): Promise<AibangLoginResult> {
    let body: Record<string, string>;
    try {
      if (input.totpCode) {
        const pending = this.pendingTwoFactor;
        if (!pending || pending.expiresAt <= Date.now()) {
          return { success: false, code: 'invalidCredentials' };
        }
        body = { flow_token: pending.flowToken, code: input.totpCode };
      } else {
        if (!input.username || !input.password) {
          return {
            success: false,
            code: 'invalidCredentials',
            message: 'Username and password are required',
          };
        }
        this.pendingTwoFactor = undefined;
        body = await this.buildLoginBody(input.username, input.password);
      }

      const response = await this.newApiRequest<NewApiEnvelope<NewApiLoginData>>(
        'POST',
        input.totpCode ? '/api/user/login/2fa' : '/api/user/login',
        undefined,
        body
      );
      const data = response.data ?? {};

      if (data.require_2fa) {
        const flowToken = data.flow_token;
        const expiresAt = epochMilliseconds(data.expires_at);
        if (!flowToken || expiresAt <= Date.now()) {
          return {
            success: false,
            code: 'serverError',
            message: 'new-api 2FA response is incomplete',
          };
        }
        this.pendingTwoFactor = { flowToken, expiresAt };
        return { success: true, twoFactorRequired: true };
      }

      const user = toAuthUser(data.user);
      const dashboardAccessToken = data.access_token;
      if (!dashboardAccessToken || !user) {
        return {
          success: false,
          code: 'serverError',
          message: 'new-api login response is incomplete',
        };
      }

      const dashboardExpiresAt = epochMilliseconds(data.access_expires_at);
      if (dashboardExpiresAt <= Date.now()) {
        return {
          success: false,
          code: 'serverError',
          message: 'new-api login session is already expired',
        };
      }

      const expiresAt = resolveScopedApiTokenExpiresAt(
        Date.now(),
        dashboardExpiresAt,
        this.apiTokenTtlMilliseconds / 60_000
      );
      const apiToken = await this.createApiToken(dashboardAccessToken, expiresAt);
      let configuredSession = false;
      this.pendingTwoFactor = undefined;
      try {
        await this.configureSession({
          dashboardAccessToken,
          apiTokenId: apiToken.id,
          apiToken: apiToken.key,
          expiresAt,
          user,
        });
        configuredSession = true;
      } finally {
        if (!configuredSession) {
          await this.deleteApiToken(dashboardAccessToken, apiToken.id);
        }
      }
      return { success: true, twoFactorRequired: false, expiresAt, user };
    } catch (error) {
      if (error instanceof AibangHttpError) {
        const code =
          error.status === 400 || error.status === 401
            ? 'invalidCredentials'
            : error.status === 429
              ? 'tooManyAttempts'
              : error.status >= 500
                ? 'serverError'
                : 'unknown';
        return { success: false, code, message: error.message };
      }
      console.error('[AibangAuth] Login failed:', error);
      return { success: false, code: 'networkError' };
    }
  }

  async register(input: AibangRegisterInput): Promise<AibangOperationResult> {
    try {
      await this.newApiRequest<NewApiEnvelope<unknown>>('POST', '/api/user/register', undefined, {
        username: input.username,
        password: input.password,
        ...(input.email ? { email: input.email } : {}),
        ...(input.verificationCode ? { verification_code: input.verificationCode } : {}),
      });
      return { success: true };
    } catch (error) {
      return { success: false, message: this.operationErrorMessage(error, 'Registration failed') };
    }
  }

  async sendEmailVerification(input: { email: string }): Promise<AibangOperationResult> {
    try {
      await this.newApiRequest<NewApiEnvelope<unknown>>(
        'GET',
        `/api/verification?email=${encodeURIComponent(input.email)}`
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: this.operationErrorMessage(error, 'Verification request failed'),
      };
    }
  }

  private async redeemInternal(input: { key: string }): Promise<AibangOperationResult> {
    const session = await this.readSession();
    if (!session || session.expiresAt <= Date.now()) {
      return { success: false, message: 'Session expired' };
    }
    try {
      await this.newApiRequest<NewApiEnvelope<unknown>>('POST', '/api/user/topup', session.dashboardAccessToken, {
        key: input.key,
      });
      const data = await this.newApiRequest<NewApiEnvelope<NewApiUserDto>>(
        'GET',
        '/api/user/self',
        session.dashboardAccessToken
      );
      const user = toAuthUser(data.data);
      if (!data.success || !user) {
        return { success: true };
      }
      await this.updateLocalSessionUser(user);
      return { success: true, user };
    } catch (error) {
      return { success: false, message: this.operationErrorMessage(error, 'Redeem failed') };
    }
  }

  private async clearSessionInternal(): Promise<void> {
    this.pendingTwoFactor = undefined;
    this.clearManagedCodexCredentials();
    const session = await this.readSession();
    await this.removeLocalSessionFiles();
    if (session) {
      if (session.apiTokenId) {
        await this.newApiRequest<NewApiEnvelope<unknown>>(
          'DELETE',
          `/api/token/${session.apiTokenId}`,
          session.dashboardAccessToken
        ).catch((error: unknown) => {
          console.warn('[AibangAuth] Failed to delete the short-lived API token:', error);
        });
      }
      try {
        await this.newApiRequest<NewApiEnvelope<unknown>>(
          'POST',
          '/api/user/auth/logout',
          session.dashboardAccessToken,
          undefined,
          { Origin: new URL(this.config.newApiUrl).origin }
        );
      } catch (error) {
        console.warn('[AibangAuth] new-api logout failed:', error);
      }
    }
    await this.updateCodexOverrides((current) => ({
      command_override: this.resolveManagedCodexCommandOverride(current.command_override),
      env_override: removeCodexEnvOverrides(current.env_override ?? []),
    })).catch((error: unknown) => {
      console.warn('[AibangAuth] Failed to remove managed Codex environment overrides:', error);
    });
  }

  private async buildLoginBody(username: string, password: string): Promise<Record<string, string>> {
    const keyResponse = await this.newApiRequest<NewApiEnvelope<NewApiEncryptionKey>>(
      'GET',
      '/api/user/login/encryption-key'
    );
    const key = keyResponse.data;
    if (key?.enabled === true) {
      if (!key.kid || !key.public_key) {
        throw new AibangHttpError('new-api login encryption key is incomplete', 502);
      }
      return {
        username,
        password_encrypted: encryptPassword(password, key.public_key),
        encryption_key_id: key.kid,
      };
    }
    return { username, password };
  }

  private async createApiToken(
    dashboardAccessToken: string,
    expiresAt: number
  ): Promise<NewApiToken & NewApiTokenKeyData> {
    const name = `${API_TOKEN_NAME_PREFIX} ${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    let tokenCreated = false;
    try {
      await this.newApiRequest<NewApiEnvelope<unknown>>('POST', '/api/token/', dashboardAccessToken, {
        ...buildScopedApiTokenRequest({
          name,
          model: this.config.publicModel,
          expiresAt,
          quota: this.apiTokenQuota,
        }),
      });
      tokenCreated = true;
      const search = await this.newApiRequest<NewApiEnvelope<NewApiToken[] | { items?: NewApiToken[] }>>(
        'GET',
        `/api/token/search?keyword=${encodeURIComponent(name)}&p=1&page_size=10`,
        dashboardAccessToken
      );
      const items = Array.isArray(search.data) ? search.data : (search.data?.items ?? []);
      const token = items
        .filter((candidate) => candidate.name === name)
        .toSorted((left, right) => right.id - left.id)[0];
      if (!token) {
        throw new AibangHttpError('new-api API token creation result was not found', 502);
      }
      const keyResponse = await this.newApiRequest<NewApiEnvelope<NewApiTokenKeyData>>(
        'POST',
        `/api/token/${token.id}/key`,
        dashboardAccessToken,
        {}
      );
      const key = keyResponse.data?.key;
      if (!key) throw new AibangHttpError('new-api API token key response is empty', 502);
      return { ...token, key };
    } catch (error) {
      if (tokenCreated) {
        await this.deleteApiTokenByName(dashboardAccessToken, name).catch((cleanupError: unknown) => {
          console.warn('[AibangAuth] Failed to clean up the short-lived API token:', cleanupError);
        });
      }
      throw error;
    }
  }

  private async deleteApiTokenByName(dashboardAccessToken: string, name: string): Promise<void> {
    const search = await this.newApiRequest<NewApiEnvelope<NewApiToken[] | { items?: NewApiToken[] }>>(
      'GET',
      `/api/token/search?keyword=${encodeURIComponent(name)}&p=1&page_size=10`,
      dashboardAccessToken
    );
    const items = Array.isArray(search.data) ? search.data : (search.data?.items ?? []);
    const token = items.filter((candidate) => candidate.name === name).toSorted((left, right) => right.id - left.id)[0];
    if (token) await this.deleteApiToken(dashboardAccessToken, token.id);
  }

  private async deleteApiToken(dashboardAccessToken: string, tokenId: number): Promise<void> {
    await this.newApiRequest<NewApiEnvelope<unknown>>('DELETE', `/api/token/${tokenId}`, dashboardAccessToken).catch(
      (error: unknown) => {
        console.warn('[AibangAuth] Failed to clean up the short-lived API token:', error);
      }
    );
  }

  private runAuthOperation<T>(operation: () => Promise<T>): Promise<T> {
    const operationResult = this.authOperationChain.then(operation, operation);
    this.authOperationChain = operationResult.catch((_error: unknown): undefined => undefined);
    return operationResult;
  }

  private operationErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof AibangHttpError) return error.message || fallback;
    console.error(`[AibangAuth] ${fallback}:`, error);
    return 'Network error';
  }

  private setManagedCodexCredentials(apiToken: string): void {
    if (!this.previousCodexEnvironment) {
      this.previousCodexEnvironment = {
        openAiPresent: Object.hasOwn(process.env, 'OPENAI_API_KEY'),
        openAiValue: process.env.OPENAI_API_KEY,
        codexPresent: Object.hasOwn(process.env, 'CODEX_API_KEY'),
        codexValue: process.env.CODEX_API_KEY,
      };
    }
    process.env.OPENAI_API_KEY = apiToken;
    process.env.CODEX_API_KEY = apiToken;
  }

  private clearManagedCodexCredentials(): void {
    const previous = this.previousCodexEnvironment;
    if (!previous) return;
    if (previous.openAiPresent) process.env.OPENAI_API_KEY = previous.openAiValue;
    else delete process.env.OPENAI_API_KEY;
    if (previous.codexPresent) process.env.CODEX_API_KEY = previous.codexValue;
    else delete process.env.CODEX_API_KEY;
    this.previousCodexEnvironment = undefined;
  }

  private async removeLocalSessionFiles(): Promise<void> {
    await Promise.all([
      rm(this.configPath, { force: true }).catch((_error: unknown): undefined => undefined),
      rm(this.authPath, { force: true }).catch((_error: unknown): undefined => undefined),
      rm(this.sessionPath, { force: true }).catch((_error: unknown): undefined => undefined),
    ]);
  }

  private async removeCodexEnvOverridesBestEffort(): Promise<void> {
    await this.updateCodexOverrides((current) => ({
      command_override: this.resolveManagedCodexCommandOverride(current.command_override),
      env_override: removeCodexEnvOverrides(current.env_override ?? []),
    })).catch((error: unknown) => {
      console.warn('[AibangAuth] Failed to remove managed Codex environment overrides:', error);
    });
  }

  private get authDirectory(): string {
    return path.join(app.getPath('userData'), 'aibang');
  }

  private get codexHome(): string {
    return getCodexHome(app.getPath('userData'));
  }

  private get sessionPath(): string {
    return path.join(this.authDirectory, 'auth-session.json');
  }

  private get configPath(): string {
    return path.join(this.codexHome, 'config.toml');
  }

  private get authPath(): string {
    return path.join(this.codexHome, 'auth.json');
  }

  private async readSession(): Promise<AibangAuthSession | null> {
    try {
      return JSON.parse(await readFile(this.sessionPath, 'utf8')) as AibangAuthSession;
    } catch {
      return null;
    }
  }

  private async updateLocalSessionUser(user: AibangAuthSession['user']): Promise<void> {
    const session = await this.readSession();
    if (!session) return;
    await this.writePrivateFile(this.sessionPath, `${JSON.stringify({ ...session, user })}\n`);
  }

  private async writePrivateFile(file: string, contents: string): Promise<void> {
    await writeFile(file, contents, { mode: 0o600 });
    await chmod(file, 0o600);
  }

  private async updateCodexOverrides(transform: (current: AgentOverrides) => AgentOverrides): Promise<void> {
    const managementResponse = await this.request<
      AioncoreResponse<{ id: string; backend?: string; agent_type: string; agent_source: string }[]>
    >('GET', '/api/agents/management');
    const agent = findBuiltinCodexAgent(managementResponse.data ?? []);
    if (!agent) throw new Error('AIbang built-in Codex agent was not found');

    const overridesResponse = await this.request<AioncoreResponse<AgentOverrides>>(
      'GET',
      `/api/agents/${encodeURIComponent(agent.id)}/overrides`
    );
    const current = overridesResponse.data ?? {};
    const next = transform(current);
    await this.request('PUT', `/api/agents/${encodeURIComponent(agent.id)}/overrides`, undefined, {
      command_override: next.command_override ?? null,
      env_override: next.env_override,
    });
  }

  private async newApiRequest<T extends NewApiEnvelope<unknown>>(
    method: 'GET' | 'POST' | 'DELETE',
    pathname: string,
    accessToken?: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    const response = await fetch(`${this.config.newApiUrl}${pathname}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken === undefined ? {} : { Authorization: `Bearer ${accessToken}` }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => ({}))) as T & { message?: string };
    if (!response.ok || payload.success !== true) {
      const status = response.ok ? (payload.success === false ? 400 : 502) : response.status;
      throw new AibangHttpError(
        payload.message || `AIbang request failed (${status})`,
        status
      );
    }
    return payload;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    pathname: string,
    accessToken?: string,
    body?: unknown
  ): Promise<T> {
    const port = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
    if (!port) throw new Error('Aioncore backend is not ready');
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken === undefined ? {} : { Authorization: `Bearer ${accessToken}` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new Error(`Aioncore request failed: ${method} ${pathname} (${response.status})`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

class AibangHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'AibangHttpError';
  }
}

export const aibangAuthService = new AibangAuthService();
export { buildBundledCodexPath };
export const AibangAuthChannel = {
  getStatus: `${authChannelName}:get-status`,
  login: `${authChannelName}:login`,
  clearSession: `${authChannelName}:clear-session`,
  refreshSession: `${authChannelName}:refresh-session`,
  register: `${authChannelName}:register`,
  sendEmailVerification: `${authChannelName}:send-email-verification`,
  redeem: `${authChannelName}:redeem`,
} as const;
