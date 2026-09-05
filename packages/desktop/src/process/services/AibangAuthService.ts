import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import {
  findBuiltinCodexAgent,
  getCodexHome,
  mergeCodexEnvOverrides,
  normalizeMiddlewareUrl,
  removeCodexEnvOverrides,
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
  | { success: true; twoFactorRequired: false; expiresAt: number; user: AibangAuthSession['user'] }
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

type MiddlewareLoginResponse = {
  twoFactorRequired?: boolean;
  flowToken?: string;
  expiresAt?: number;
  accessToken?: string;
  user?: AibangAuthSession['user'];
  message?: string;
};

type MiddlewareUserResponse = {
  user?: AibangAuthSession['user'];
  message?: string;
};

const authChannelName = 'aibang-auth';

class AibangAuthService {
  private pendingTwoFactor: { flowToken: string; expiresAt: number } | undefined;

  get config(): AibangAuthConfig {
    return {
      middlewareUrl: normalizeMiddlewareUrl(process.env.AIBANG_MIDDLEWARE_URL),
      publicModel: process.env.AIBANG_PUBLIC_MODEL ?? AIBANG_FORCED_CODEX_MODEL,
      codexHome: this.codexHome,
    };
  }

  async getStatus(): Promise<{ authenticated: boolean; user?: AibangAuthSession['user'] }> {
    const session = await this.readSession();
    if (!session || session.expiresAt <= Date.now()) return { authenticated: false };
    try {
      await mkdir(this.codexHome, { recursive: true, mode: 0o700 });
      await this.writePrivateFile(this.configPath, serializeCodexConfig(this.config));
    } catch (error) {
      console.warn('[AibangAuth] Failed to refresh isolated Codex config:', error);
    }
    return { authenticated: true, user: session.user };
  }

  async refreshSession(): Promise<{ authenticated: boolean; user?: AibangAuthSession['user'] }> {
    const session = await this.readSession();
    if (!session || session.expiresAt <= Date.now()) return { authenticated: false };
    try {
      const response = await fetch(`${this.config.middlewareUrl}/api/v1/auth/session`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      const data = (await response.json().catch(() => ({}))) as MiddlewareUserResponse;
      if (!response.ok || !data.user) return { authenticated: response.status !== 401 };

      await this.updateLocalSessionUser(data.user);
      return { authenticated: true, user: data.user };
    } catch (error) {
      console.warn('[AibangAuth] Failed to refresh AIbang session:', error);
      return { authenticated: true, user: session.user };
    }
  }

  async configureSession(session: AibangAuthSession): Promise<void> {
    await mkdir(this.authDirectory, { recursive: true, mode: 0o700 });
    await mkdir(this.codexHome, { recursive: true, mode: 0o700 });
    try {
      await this.writePrivateFile(this.sessionPath, `${JSON.stringify(session)}\n`);
      await this.writePrivateFile(this.configPath, serializeCodexConfig(this.config));
      await this.writePrivateFile(this.authPath, `${JSON.stringify({ OPENAI_API_KEY: session.accessToken })}\n`);
      await this.updateCodexOverrides((current) => ({
        command_override: current.command_override ?? undefined,
        env_override: mergeCodexEnvOverrides(current.env_override ?? [], session.accessToken),
      }));
    } catch (error) {
      await Promise.all([
        rm(this.sessionPath, { force: true }).catch((_error: unknown): undefined => undefined),
        rm(this.configPath, { force: true }).catch((_error: unknown): undefined => undefined),
        rm(this.authPath, { force: true }).catch((_error: unknown): undefined => undefined),
      ]);
      throw error;
    }
  }

  async login(input: AibangLoginInput): Promise<AibangLoginResult> {
    let body: Record<string, string>;
    if (input.totpCode) {
      const pending = this.pendingTwoFactor;
      if (!pending || pending.expiresAt <= Date.now()) {
        return { success: false, code: 'invalidCredentials' };
      }
      body = { flowToken: pending.flowToken, totpCode: input.totpCode };
    } else {
      if (!input.username || !input.password) {
        return { success: false, code: 'invalidCredentials', message: 'Username and password are required' };
      }
      this.pendingTwoFactor = undefined;
      body = { username: input.username, password: input.password };
    }

    try {
      const response = await fetch(`${this.config.middlewareUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await response.json().catch(() => ({}))) as MiddlewareLoginResponse;

      if (!response.ok) {
        const code =
          response.status === 400 || response.status === 401
            ? 'invalidCredentials'
            : response.status === 429
              ? 'tooManyAttempts'
              : response.status >= 500
                ? 'serverError'
                : 'unknown';
        return { success: false, code, message: data.message };
      }

      if (data.twoFactorRequired) {
        if (!data.flowToken || !data.expiresAt) {
          return { success: false, code: 'serverError', message: 'Middleware 2FA response is incomplete' };
        }
        this.pendingTwoFactor = { flowToken: data.flowToken, expiresAt: data.expiresAt };
        return { success: true, twoFactorRequired: true };
      }

      if (!data.accessToken || !data.user || !data.expiresAt) {
        return { success: false, code: 'serverError', message: 'Middleware login response is incomplete' };
      }

      this.pendingTwoFactor = undefined;
      await this.configureSession({
        accessToken: data.accessToken,
        expiresAt: data.expiresAt,
        user: data.user,
      });
      return { success: true, twoFactorRequired: false, expiresAt: data.expiresAt, user: data.user };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, code: 'networkError' };
      }
      console.error('[AibangAuth] Login failed:', error);
      return { success: false, code: 'networkError' };
    }
  }

  async register(input: AibangRegisterInput): Promise<AibangOperationResult> {
    try {
      const response = await fetch(`${this.config.middlewareUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: input.username,
          password: input.password,
          ...(input.email ? { email: input.email } : {}),
          ...(input.verificationCode ? { verificationCode: input.verificationCode } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        return { success: false, message: data.message };
      }
      return { success: true };
    } catch (error) {
      console.error('[AibangAuth] Register failed:', error);
      return { success: false, message: 'Network error' };
    }
  }

  async sendEmailVerification(email: string): Promise<AibangOperationResult> {
    try {
      const response = await fetch(`${this.config.middlewareUrl}/api/v1/auth/verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        return { success: false, message: data.message };
      }
      return { success: true };
    } catch (error) {
      console.error('[AibangAuth] Verification request failed:', error);
      return { success: false, message: 'Network error' };
    }
  }

  async redeem(code: string): Promise<AibangOperationResult> {
    const session = await this.readSession();
    if (!session || session.expiresAt <= Date.now()) return { success: false, message: 'Session expired' };
    try {
      const response = await fetch(`${this.config.middlewareUrl}/api/v1/billing/redeem`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: code }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await response.json().catch(() => ({}))) as MiddlewareUserResponse;
      if (!response.ok || !data.user) return { success: false, message: data.message };
      await this.updateLocalSessionUser(data.user);
      return { success: true, user: data.user };
    } catch (error) {
      console.error('[AibangAuth] Redeem failed:', error);
      return { success: false, message: 'Network error' };
    }
  }

  async clearSession(): Promise<void> {
    this.pendingTwoFactor = undefined;
    const session = await this.readSession();
    if (session) {
      await fetch(`${this.config.middlewareUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
        signal: AbortSignal.timeout(3_000),
      }).catch((error: unknown) => {
        console.warn('[AibangAuth] Middleware logout failed:', error);
      });
    }
    await rm(this.configPath, { force: true });
    await rm(this.authPath, { force: true });
    await rm(this.sessionPath, { force: true });
    await this.updateCodexOverrides((current) => ({
      command_override: current.command_override ?? undefined,
      env_override: removeCodexEnvOverrides(current.env_override ?? []),
    }));
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

export const aibangAuthService = new AibangAuthService();
export const AibangAuthChannel = {
  getStatus: `${authChannelName}:get-status`,
  login: `${authChannelName}:login`,
  clearSession: `${authChannelName}:clear-session`,
  refreshSession: `${authChannelName}:refresh-session`,
  register: `${authChannelName}:register`,
  sendEmailVerification: `${authChannelName}:send-email-verification`,
  redeem: `${authChannelName}:redeem`,
} as const;
