import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants, createPublicKey, publicEncrypt } from 'node:crypto';
import path from 'node:path';
import { app } from 'electron';
import { BUILTIN_BROWSER_MCP_NAME } from '@/common/config/constants';
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
  type CodexMcpServerConfig,
  type ScopedApiTokenRequest,
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
      code: 'invalidCredentials' | 'tooManyAttempts' | 'sessionLimit' | 'serverError' | 'networkError' | 'unknown';
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
  code?: string;
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
  session?: NewApiLoginSession;
  require_2fa?: boolean;
  flow_token?: string;
  expires_at?: number;
  user?: NewApiUserDto;
};

type NewApiLoginSession = {
  sid?: string;
  expires_at?: number;
};

type NewApiEncryptionKey = {
  enabled?: boolean;
  kid?: string;
  public_key?: string;
};

type NewApiToken = {
  id: number;
  name: string;
  status?: number;
  expired_time?: number;
};
type NewApiTokenKeyData = { key?: string };

const authChannelName = 'aibang-auth';
const API_TOKEN_NAME = 'AIbang Desktop';
const LEGACY_API_TOKEN_NAME_PREFIX = `${API_TOKEN_NAME} `;
const DEFAULT_API_TOKEN_TTL_MINUTES = 720;
const REQUEST_TIMEOUT_MS = 10_000;
const NEW_API_REFRESH_COOKIE_NAME = 'new_api_refresh';
const DASHBOARD_ACCESS_REFRESH_MARGIN_MS = 60_000;

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
    let bundledPath = packagedPath ?? null;
    if (!bundledPath && !app.isPackaged) {
      for (const root of [appPath, process.cwd(), __dirname]) {
        let current = path.resolve(root);
        for (let depth = 0; depth < 5 && !bundledPath; depth += 1) {
          const candidate = buildBundledCodexPath(current);
          if (candidate && existsSync(candidate)) {
            bundledPath = candidate;
            break;
          }
          const parent = path.dirname(current);
          if (parent === current) break;
          current = parent;
        }
        if (bundledPath) break;
      }
    }
    if (!bundledPath) return currentOverride ?? undefined;
    console.info(`[AibangAuth] Built-in Codex command override resolved: ${bundledPath}`);
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

  async getStatus(): Promise<{ authenticated: boolean; user?: AibangAuthSession['user'] }> {
    return this.runAuthOperation(() => this.getStatusInternal());
  }

  async refreshSession(): Promise<{ authenticated: boolean; user?: AibangAuthSession['user'] }> {
    return this.runAuthOperation(() => this.refreshSessionInternal());
  }

  async syncCodexConfig(): Promise<void> {
    return this.runAuthOperation(() => this.syncCodexConfigInternal());
  }

  private async syncCodexConfigInternal(): Promise<void> {
    const session = await this.readSession();
    if (!session || session.expiresAt <= Date.now()) return;
    try {
      await this.updateCodexOverrides((current) => ({
        command_override: this.resolveManagedCodexCommandOverride(current.command_override),
        env_override: removeCodexEnvOverrides(current.env_override ?? []),
      }));
    } catch (error) {
      console.warn('[AibangAuth] Failed to refresh managed Codex overrides:', error);
    }
    await mkdir(this.codexHome, { recursive: true, mode: 0o700 });
    await this.writeCodexConfig();
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
    // The Codex process keeps the API key it received at startup. Refresh the
    // short lived scoped token before reporting an authenticated state so a
    // stale key cannot be used for the next conversation.
    if (!(await this.isSessionApiTokenValid(session))) {
      return this.refreshSessionInternal();
    }
    try {
      await mkdir(this.codexHome, { recursive: true, mode: 0o700 });
      await this.writeCodexConfig();
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

    let currentSession = session;
    if (this.shouldRefreshDashboardAccessToken(session)) {
      try {
        currentSession = await this.refreshDashboardSession(session);
      } catch (error) {
        if (error instanceof AibangHttpError && [401, 403, 409].includes(error.status)) {
          await this.removeLocalSessionFiles();
          this.clearManagedCodexCredentials();
          return { authenticated: false };
        }
        throw error;
      }
    }

    try {
      const data = await this.newApiRequest<NewApiEnvelope<NewApiUserDto>>(
        'GET',
        '/api/user/self',
        currentSession.dashboardAccessToken
      );
      const user = toAuthUser(data.data);
      if (!data.success || !user) return { authenticated: true, user: session.user };
      if (!(await this.isSessionApiTokenValid(currentSession))) {
        const apiTokenExpiresAt = this.nextApiTokenExpiresAt(currentSession);
        const apiToken = await this.ensureApiToken(currentSession.dashboardAccessToken, apiTokenExpiresAt);
        currentSession = {
          ...currentSession,
          apiTokenId: apiToken.id,
          apiToken: apiToken.key,
          apiTokenExpiresAt,
        };
        // Keep both the parent process environment and Codex's auth file in
        // sync with the newly issued token. Without this, refresh succeeds but
        // subsequent /v1/responses requests continue sending the expired key.
        this.setManagedCodexCredentials(apiToken.key);
        await this.writePrivateFile(this.authPath, `${JSON.stringify({ OPENAI_API_KEY: apiToken.key })}\n`);
        await this.writePrivateFile(this.sessionPath, `${JSON.stringify(currentSession)}\n`);
      }
      try {
        await this.syncCodexConfigInternal();
      } catch (error) {
        console.warn('[AibangAuth] Failed to refresh isolated Codex config:', error);
      }
      await this.updateLocalSessionUser(user);
      return { authenticated: true, user };
    } catch (error) {
      if (error instanceof AibangHttpError && error.status === 401) {
        await this.removeLocalSessionFiles();
        this.clearManagedCodexCredentials();
        return { authenticated: false };
      }
      console.warn('[AibangAuth] Failed to refresh AIbang session:', error);
      return { authenticated: true, user: currentSession.user };
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
      await this.writeCodexConfig();
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

      const { payload: response, response: loginResponse } = await this.newApiRequestWithResponse<
        NewApiEnvelope<NewApiLoginData>
      >('POST', input.totpCode ? '/api/user/login/2fa' : '/api/user/login', undefined, body);
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

      const apiTokenExpiresAt = resolveScopedApiTokenExpiresAt(
        Date.now(),
        epochMilliseconds(data.session?.expires_at),
        this.apiTokenTtlMilliseconds / 60_000
      );
      const dashboardSessionExpiresAt = epochMilliseconds(data.session?.expires_at);
      const dashboardRefreshToken = this.readRefreshCookie(loginResponse);
      const dashboardSessionId = data.session?.sid;
      if (!dashboardSessionId || !dashboardRefreshToken || dashboardSessionExpiresAt <= Date.now()) {
        return {
          success: false,
          code: 'serverError',
          message: 'new-api login session response is incomplete',
        };
      }
      const previousSession = await this.readSession();
      await this.deletePreviousUserApiToken(previousSession, user.id);
      const apiToken = await this.ensureApiToken(dashboardAccessToken, apiTokenExpiresAt);
      let configuredSession = false;
      this.pendingTwoFactor = undefined;
      try {
        await this.configureSession({
          dashboardAccessToken,
          dashboardSessionId,
          dashboardRefreshToken,
          dashboardAccessTokenExpiresAt: dashboardExpiresAt,
          dashboardSessionExpiresAt,
          apiTokenId: apiToken.id,
          apiToken: apiToken.key,
          apiTokenExpiresAt,
          expiresAt: dashboardSessionExpiresAt,
          user,
        });
        configuredSession = true;
      } finally {
        if (!configuredSession) {
          await this.deleteApiToken(dashboardAccessToken, apiToken.id);
        }
      }
      return { success: true, twoFactorRequired: false, expiresAt: apiTokenExpiresAt, user };
    } catch (error) {
      if (error instanceof AibangHttpError) {
        const code =
          error.status === 400 || error.status === 401
            ? 'invalidCredentials'
            : error.status === 429
              ? 'tooManyAttempts'
              : error.code === 'AUTH_SESSION_LIMIT'
                ? 'sessionLimit'
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
          {
            Origin: new URL(this.config.newApiUrl).origin,
            ...(session.dashboardRefreshToken && session.dashboardSessionId
              ? {
                  Cookie: `${NEW_API_REFRESH_COOKIE_NAME}=${session.dashboardRefreshToken}`,
                  'X-Auth-Session': session.dashboardSessionId,
                }
              : {}),
          }
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

  private shouldRefreshDashboardAccessToken(session: AibangAuthSession): boolean {
    if (!session.dashboardRefreshToken || !session.dashboardSessionId) return false;
    if (!session.dashboardAccessTokenExpiresAt) return false;
    return session.dashboardAccessTokenExpiresAt <= Date.now() + DASHBOARD_ACCESS_REFRESH_MARGIN_MS;
  }

  private nextApiTokenExpiresAt(session: AibangAuthSession): number {
    return resolveScopedApiTokenExpiresAt(
      Date.now(),
      session.dashboardSessionExpiresAt ?? session.expiresAt,
      this.apiTokenTtlMilliseconds / 60_000
    );
  }

  private async refreshDashboardSession(session: AibangAuthSession): Promise<AibangAuthSession> {
    if (!session.dashboardRefreshToken || !session.dashboardSessionId) {
      throw new AibangHttpError('AIbang refresh session is incomplete', 502);
    }

    const { payload, response } = await this.newApiRequestWithResponse<NewApiEnvelope<NewApiLoginData>>(
      'POST',
      '/api/user/auth/refresh',
      undefined,
      undefined,
      {
        Origin: new URL(this.config.newApiUrl).origin,
        Cookie: `${NEW_API_REFRESH_COOKIE_NAME}=${session.dashboardRefreshToken}`,
        'X-Auth-Session': session.dashboardSessionId,
      }
    );
    const data = payload.data ?? {};
    const dashboardAccessToken = data.access_token;
    const dashboardAccessTokenExpiresAt = epochMilliseconds(data.access_expires_at);
    const dashboardSessionExpiresAt = epochMilliseconds(data.session?.expires_at);
    const dashboardRefreshToken = this.readRefreshCookie(response);
    const dashboardSessionId = data.session?.sid;
    const user = toAuthUser(data.user);

    if (
      !dashboardAccessToken ||
      !dashboardRefreshToken ||
      !dashboardSessionId ||
      !user ||
      dashboardSessionId !== session.dashboardSessionId ||
      dashboardAccessTokenExpiresAt <= Date.now() ||
      dashboardSessionExpiresAt <= Date.now()
    ) {
      throw new AibangHttpError('new-api refresh session response is incomplete', 502);
    }

    const nextSession = {
      ...session,
      user,
      dashboardAccessToken,
      dashboardRefreshToken,
      dashboardAccessTokenExpiresAt,
      dashboardSessionExpiresAt,
    };
    await this.writePrivateFile(this.sessionPath, `${JSON.stringify(nextSession)}\n`);
    return nextSession;
  }

  private readRefreshCookie(response: Response): string | undefined {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const setCookieValues = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
    const fallback = response.headers.get('set-cookie');
    if (setCookieValues.length === 0 && fallback !== null) setCookieValues.push(fallback);

    for (const setCookieValue of setCookieValues) {
      const [cookiePair] = setCookieValue.split(';');
      const separatorIndex = cookiePair.indexOf('=');
      if (separatorIndex <= 0) continue;
      const name = cookiePair.slice(0, separatorIndex).trim();
      const value = cookiePair.slice(separatorIndex + 1).trim();
      if (name === NEW_API_REFRESH_COOKIE_NAME && value !== '') return value;
    }
    return undefined;
  }

  private async deletePreviousUserApiToken(session: AibangAuthSession | null, nextUserId: number): Promise<void> {
    if (!session?.apiTokenId || session.user.id === nextUserId) return;
    await this.deleteApiToken(session.dashboardAccessToken, session.apiTokenId);
  }

  private async isSessionApiTokenValid(session: AibangAuthSession): Promise<boolean> {
    if (!session.apiTokenId) return true;
    try {
      const response = await this.newApiRequest<NewApiEnvelope<NewApiToken>>(
        'GET',
        `/api/token/${session.apiTokenId}`,
        session.dashboardAccessToken
      );
      const token = response.data;
      if (!response.success || !token || token.id !== session.apiTokenId) return false;
      const status = token.status ?? 1;
      const expiredTime = token.expired_time ?? -1;
      return status === 1 && (expiredTime === -1 || expiredTime * 1000 > Date.now());
    } catch (error) {
      if (error instanceof AibangHttpError && [400, 401, 404].includes(error.status)) return false;
      console.warn('[AibangAuth] Failed to validate the short-lived API token:', error);
      return true;
    }
  }

  private async ensureApiToken(
    dashboardAccessToken: string,
    expiresAt: number
  ): Promise<NewApiToken & NewApiTokenKeyData> {
    const request = buildScopedApiTokenRequest({
      name: API_TOKEN_NAME,
      model: this.config.publicModel,
      expiresAt,
    });
    const tokens = await this.searchApiTokens(dashboardAccessToken);
    const reusableToken = tokens
      .filter((token) => token.name === API_TOKEN_NAME && this.isReusableApiToken(token))
      .toSorted((left, right) => right.id - left.id)[0];
    await Promise.all(
      tokens
        .filter(
          (token) =>
            token.id !== reusableToken?.id &&
            (token.name === API_TOKEN_NAME || token.name.startsWith(LEGACY_API_TOKEN_NAME_PREFIX))
        )
        .map((token) => this.deleteApiToken(dashboardAccessToken, token.id))
    );
    if (reusableToken) {
      await this.updateApiToken(dashboardAccessToken, reusableToken.id, request);
      return {
        ...reusableToken,
        ...(await this.fetchApiTokenKey(dashboardAccessToken, reusableToken.id)),
      };
    }
    return this.createApiToken(dashboardAccessToken, request);
  }

  private isReusableApiToken(token: NewApiToken): boolean {
    const status = token.status ?? 1;
    const expiredTime = token.expired_time ?? -1;
    return status === 1 && (expiredTime === -1 || expiredTime * 1000 > Date.now());
  }

  private async searchApiTokens(dashboardAccessToken: string): Promise<NewApiToken[]> {
    const search = await this.newApiRequest<NewApiEnvelope<NewApiToken[] | { items?: NewApiToken[] }>>(
      'GET',
      `/api/token/search?keyword=${encodeURIComponent(API_TOKEN_NAME)}&p=1&page_size=100`,
      dashboardAccessToken
    );
    return Array.isArray(search.data) ? search.data : (search.data?.items ?? []);
  }

  private async updateApiToken(
    dashboardAccessToken: string,
    tokenId: number,
    request: ScopedApiTokenRequest
  ): Promise<void> {
    await this.newApiRequest<NewApiEnvelope<unknown>>('PUT', '/api/token/', dashboardAccessToken, {
      ...request,
      id: tokenId,
    });
  }

  private async fetchApiTokenKey(dashboardAccessToken: string, tokenId: number): Promise<NewApiTokenKeyData> {
    const keyResponse = await this.newApiRequest<NewApiEnvelope<NewApiTokenKeyData>>(
      'POST',
      `/api/token/${tokenId}/key`,
      dashboardAccessToken,
      {}
    );
    const key = keyResponse.data?.key;
    if (!key) throw new AibangHttpError('new-api API token key response is empty', 502);
    return { key };
  }

  private async createApiToken(
    dashboardAccessToken: string,
    request: ScopedApiTokenRequest
  ): Promise<NewApiToken & NewApiTokenKeyData> {
    let tokenCreated = false;
    try {
      await this.newApiRequest<NewApiEnvelope<unknown>>('POST', '/api/token/', dashboardAccessToken, request);
      tokenCreated = true;
      const token = (await this.searchApiTokens(dashboardAccessToken))
        .filter((candidate) => candidate.name === API_TOKEN_NAME)
        .toSorted((left, right) => right.id - left.id)[0];
      if (!token) {
        throw new AibangHttpError('new-api API token creation result was not found', 502);
      }
      return { ...token, ...(await this.fetchApiTokenKey(dashboardAccessToken, token.id)) };
    } catch (error) {
      if (tokenCreated) {
        await this.deleteApiTokenByName(dashboardAccessToken, API_TOKEN_NAME).catch((cleanupError: unknown) => {
          console.warn('[AibangAuth] Failed to clean up the short-lived API token:', cleanupError);
        });
      }
      throw error;
    }
  }

  private async deleteApiTokenByName(dashboardAccessToken: string, name: string): Promise<void> {
    const token = (await this.searchApiTokens(dashboardAccessToken))
      .filter((candidate) => candidate.name === name)
      .toSorted((left, right) => right.id - left.id)[0];
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

  private async getCodexMcpServers(): Promise<CodexMcpServerConfig[]> {
    type BackendMcpServer = {
      name: string;
      enabled?: boolean;
      transport?: { type?: string; command?: string; args?: string[]; env?: Record<string, string> };
      transport_type?: string;
      transport_config?: unknown;
    };
    type BackendMcpTransport = { command?: string; args?: string[]; env?: Record<string, string> };

    try {
      const response = await this.request<AioncoreResponse<BackendMcpServer[]> | BackendMcpServer[]>(
        'GET',
        '/api/mcp/servers'
      );
      const servers = Array.isArray(response) ? response : (response.data ?? []);
      return servers
        .filter((server) => (server.transport?.type ?? server.transport_type) === 'stdio' && server.enabled !== false)
        .map((server) => {
          const transport =
            server.transport ??
            (typeof server.transport_config === 'string'
              ? (JSON.parse(server.transport_config) as BackendMcpTransport)
              : (server.transport_config as BackendMcpTransport));
          return {
            name: server.name.replace(/[^A-Za-z0-9_-]/g, '_'),
            command: transport.command ?? '',
            args: transport.args ?? [],
            env:
              server.name === BUILTIN_BROWSER_MCP_NAME
                ? {
                    ...transport.env,
                    ...(process.env.AIONUI_CDP_ACTIVE_PORT
                      ? { AIONUI_CDP_ACTIVE_PORT: process.env.AIONUI_CDP_ACTIVE_PORT }
                      : {}),
                    ...(process.env.AIONUI_CDP_BRIDGE_TOKEN
                      ? { AIONUI_CDP_BRIDGE_TOKEN: process.env.AIONUI_CDP_BRIDGE_TOKEN }
                      : {}),
                  }
                : transport.env,
          };
        })
        .filter((server) => server.command.length > 0);
    } catch (error) {
      console.warn('[AibangAuth] Failed to load MCP servers for Codex config:', error);
      return [];
    }
  }

  private async writeCodexConfig(): Promise<void> {
    await this.writePrivateFile(this.configPath, serializeCodexConfig(this.config, await this.getCodexMcpServers()));
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
      env_override: this.withLocalhostProxyBypass(next.env_override ?? []),
    });
  }

  private withLocalhostProxyBypass(overrides: AgentEnvOverride[]): AgentEnvOverride[] {
    const existing = overrides.find((entry) => entry.name === 'NO_PROXY');
    const entries = (existing?.value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!entries.includes('*')) {
      entries.push('127.0.0.1', 'localhost');
    }
    const value = [...new Set(entries)].join(',');
    return overrides.some((entry) => entry.name === 'NO_PROXY')
      ? overrides.map((entry) => (entry.name === 'NO_PROXY' ? { ...entry, value } : entry))
      : [...overrides, { name: 'NO_PROXY', value }];
  }

  private async newApiRequest<T extends NewApiEnvelope<unknown>>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    pathname: string,
    accessToken?: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    const { payload } = await this.newApiRequestWithResponse<T>(method, pathname, accessToken, body, headers);
    return payload;
  }

  private async newApiRequestWithResponse<T extends NewApiEnvelope<unknown>>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    pathname: string,
    accessToken?: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<{ payload: T; response: Response }> {
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
      throw new AibangHttpError(payload.message || `AIbang request failed (${status})`, status, payload.code);
    }
    return { payload, response };
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
    readonly status: number,
    readonly code?: string
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
