import { randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import {
  CoreSessionClient,
  CoreSessionClientError,
  getCoreSessionBootstrapSecret,
  type CoreExternalIdentityMapping,
  type CoreMatchingSessionRevocation,
  type CoreSession,
  type CoreSessionRefresh,
} from './core-session-client.js';
import type {
  WebHostLarkAuth,
  WebHostLarkAuthResult,
  WebHostLarkAuthUser,
  WebHostLarkExternalIdentity,
  WebHostLarkQrLoginPollResult,
  WebHostLarkQrLoginSession,
} from './types.js';

const WEB_SESSION_COOKIE = 'aionui-web-session';
const WEB_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_JSON_BODY_BYTES = 16 * 1024;
const REFRESH_EARLY_MS = 60_000;
const REFRESH_IDEMPOTENCY_WINDOW_MS = 60_000;
const MAX_REFRESH_RETRY_MS = 30_000;
const TERMINAL_BACKEND_AUTH_ERROR_CODES = new Set([
  'EXTERNAL_SESSION_REVOKED',
  'EXTERNAL_SESSION_GENERATION_MISMATCH',
  'EXTERNAL_SESSION_EXPIRED',
  'EXTERNAL_SESSION_REQUIRED',
  'EXTERNAL_SESSION_REFRESH_INVALID',
  'CORE_USER_DISABLED',
]);

export const CLEAR_WEB_SESSION_COOKIE = `${WEB_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

export type CoreSessionPort = {
  ensureMapping: (identity: WebHostLarkExternalIdentity) => Promise<CoreExternalIdentityMapping>;
  exchange: (identity: WebHostLarkExternalIdentity) => Promise<CoreSession>;
  refresh: (refreshCookie: string, idempotencyKey: string) => Promise<CoreSessionRefresh>;
  revokeMatching: (refreshCookie: string) => Promise<CoreMatchingSessionRevocation>;
};

export type LarkAuthGatewayClock = {
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
};

const systemClock: LarkAuthGatewayClock = {
  clearTimeout: (timer) => clearTimeout(timer),
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
};

type CoreCredentials = Pick<CoreSessionRefresh, 'accessCookie' | 'csrfCookie' | 'refreshCookie' | 'session'>;

type RefreshState = {
  attemptCount: number;
  idempotencyKey: string;
  nextRetryAt: number;
  refreshCookie: string;
  startedAt: number;
};

type WebSession = {
  core: CoreCredentials;
  epoch: number;
  expiresAt: number;
  refreshInFlight?: Promise<CoreSessionRefresh>;
  refreshState?: RefreshState;
  refreshTimer?: ReturnType<typeof setTimeout>;
  user: WebHostLarkAuthUser;
};

function writeJson(res: ServerResponse, statusCode: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(statusCode, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function cookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) {
      return item.slice(separator + 1).trim() || null;
    }
  }
  return null;
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new Error('REQUEST_BODY_TOO_LARGE');
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

export class LarkAuthGateway {
  private readonly sessions = new Map<string, WebSession>();

  constructor(
    private readonly larkAuth: WebHostLarkAuth,
    private readonly coreSessions: CoreSessionPort,
    private readonly clock: LarkAuthGatewayClock = systemClock
  ) {}

  static create(backendPort: number, larkAuth: WebHostLarkAuth, bootstrapSecret?: string): LarkAuthGateway {
    const heldBootstrapSecret = getCoreSessionBootstrapSecret();
    return new LarkAuthGateway(larkAuth, new CoreSessionClient(backendPort, bootstrapSecret ?? heldBootstrapSecret));
  }

  async getBackendHeaders(headers: IncomingHttpHeaders): Promise<IncomingHttpHeaders | null> {
    const resolved = await this.resolveSession(headers.cookie);
    if (!resolved) return null;
    const {
      cookie: _cookie,
      host: _host,
      authorization: _authorization,
      'x-access-token': _accessToken,
      'x-aioncore-bootstrap-secret': _bootstrapSecret,
      'x-csrf-token': _browserCsrfToken,
      ...forwardedHeaders
    } = headers;
    const csrfToken = cookieValue(resolved.session.core.csrfCookie, 'aionui-csrf-token');
    if (!csrfToken) return null;
    return {
      ...forwardedHeaders,
      cookie: `${resolved.session.core.accessCookie}; ${resolved.session.core.csrfCookie}`,
      'x-csrf-token': csrfToken,
    };
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = req.url?.split('?', 1)[0];

    if (url === '/api/lark-auth/environment' && req.method === 'GET' && this.larkAuth.getEnvironment) {
      writeJson(res, 200, { success: true, data: this.larkAuth.getEnvironment() });
      return true;
    }

    if (url === '/api/lark-auth/qr-session' && req.method === 'POST') {
      writeJson(res, 200, sanitizeQrSessionResult(await this.larkAuth.createQrSession()));
      return true;
    }

    if (url === '/api/lark-auth/poll' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const qrcodeId = typeof body.qrcodeId === 'string' ? body.qrcodeId.trim() : '';
        if (!qrcodeId) {
          writeJson(res, 400, { success: false, code: 'invalidResponse' });
          return true;
        }
        const poll = await this.larkAuth.pollQrSession(qrcodeId);
        const result = sanitizePollResult(poll.publicResult);
        if (result.success && result.data.status === 'authenticated' && result.data.user) {
          const identity = sanitizeExternalIdentity(poll.identity);
          if (!identity) {
            writeJson(res, 502, { success: false, code: 'serverError' });
            return true;
          }
          await this.coreSessions.ensureMapping(identity);
          const coreSession = await this.coreSessions.exchange(identity);
          const now = this.clock.now();
          if (
            coreSession.session.accessExpiresAt <= now ||
            coreSession.session.refreshExpiresAt <= coreSession.session.accessExpiresAt
          ) {
            throw new CoreSessionClientError('CORE_SESSION_RESPONSE_INVALID', 502);
          }
          const webSessionMaxAgeSeconds = Math.min(
            WEB_SESSION_MAX_AGE_SECONDS,
            Math.floor((coreSession.session.refreshExpiresAt - now) / 1000)
          );
          if (webSessionMaxAgeSeconds <= 0) {
            throw new CoreSessionClientError('CORE_SESSION_RESPONSE_INVALID', 502);
          }
          const token = randomBytes(32).toString('base64url');
          const session: WebSession = {
            core: {
              accessCookie: coreSession.accessCookie,
              csrfCookie: coreSession.csrfCookie,
              refreshCookie: coreSession.refreshCookie,
              session: coreSession.session,
            },
            epoch: 0,
            expiresAt: now + webSessionMaxAgeSeconds * 1000,
            user: result.data.user,
          };
          this.sessions.set(token, session);
          this.scheduleRefresh(token, session);
          writeJson(res, 200, result, {
            'set-cookie': `${WEB_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${webSessionMaxAgeSeconds}`,
          });
          return true;
        }
        writeJson(res, 200, result);
      } catch {
        writeJson(res, 502, { success: false, code: 'serverError' });
      }
      return true;
    }

    if (url === '/api/lark-auth/status' && req.method === 'GET') {
      const resolved = await this.resolveSession(req.headers.cookie);
      const session = resolved?.session;
      writeJson(
        res,
        200,
        session
          ? { success: true, data: { authenticated: true, user: session.user } }
          : { success: true, data: { authenticated: false } },
        !session && cookieValue(req.headers.cookie, WEB_SESSION_COOKIE)
          ? { 'set-cookie': CLEAR_WEB_SESSION_COOKIE }
          : {}
      );
      return true;
    }

    if (url === '/api/auth/user' && req.method === 'GET') {
      const resolved = await this.resolveSession(req.headers.cookie);
      const session = resolved?.session;
      if (!session) {
        writeJson(res, 401, { success: false }, { 'set-cookie': CLEAR_WEB_SESSION_COOKIE });
      } else {
        writeJson(res, 200, { success: true, user: session.user });
      }
      return true;
    }

    if ((url === '/api/lark-auth/logout' || url === '/logout') && req.method === 'POST') {
      const token = cookieValue(req.headers.cookie, WEB_SESSION_COOKIE);
      const session = token ? this.sessions.get(token) : undefined;
      let refreshCookie = session?.core.refreshCookie;
      const expectedSid = session?.core.session.sid;
      if (token && session) {
        this.invalidateSession(token, session);
        const inFlight = session.refreshInFlight;
        if (inFlight) {
          try {
            const refreshed = await inFlight;
            if (refreshed.session.sid === session.core.session.sid) {
              refreshCookie = refreshed.refreshCookie;
            }
          } catch {
            // The matching revoke still receives the last held refresh cookie.
          }
        }
      }
      let statusCode = 200;
      let responseBody: unknown = { success: true, data: { authenticated: false } };
      if (refreshCookie) {
        try {
          const revoked = await this.coreSessions.revokeMatching(refreshCookie);
          if (expectedSid && revoked.sid !== expectedSid) {
            throw new CoreSessionClientError('CORE_SESSION_RESPONSE_INVALID', 502);
          }
        } catch {
          statusCode = 502;
          responseBody = { success: false, code: 'serverError' };
        }
      }
      writeJson(res, statusCode, responseBody, {
        'set-cookie': CLEAR_WEB_SESSION_COOKIE,
      });
      return true;
    }

    if (url === '/login') {
      writeJson(res, 404, { success: false, error: 'PASSWORD_LOGIN_DISABLED' });
      return true;
    }

    return false;
  }

  async authorizeUpgrade(requestBytes: Buffer): Promise<Buffer | null> {
    const headerEnd = requestBytes.indexOf('\r\n\r\n');
    if (headerEnd < 0) return null;
    const headerText = requestBytes.subarray(0, headerEnd).toString('latin1');
    const lines = headerText.split('\r\n');
    const cookieHeader = lines
      .find((line) => /^cookie:/i.test(line))
      ?.slice('cookie:'.length)
      .trim();
    const resolved = await this.resolveSession(cookieHeader);
    if (!resolved) return null;

    const nextLines = lines.filter(
      (line) => !/^(?:cookie|authorization|x-access-token|x-aioncore-bootstrap-secret):/i.test(line)
    );
    nextLines.push(`Cookie: ${resolved.session.core.accessCookie}`);
    const nextHeader = Buffer.from(`${nextLines.join('\r\n')}\r\n\r\n`, 'latin1');
    return Buffer.concat([nextHeader, requestBytes.subarray(headerEnd + 4)]);
  }

  invalidateForBackendAuthError(cookieHeader: string | undefined, errorCode: string | null): boolean {
    if (!errorCode || !TERMINAL_BACKEND_AUTH_ERROR_CODES.has(errorCode)) return false;
    const resolved = this.getSession(cookieHeader);
    if (!resolved) return false;
    this.invalidateSession(resolved.token, resolved.session);
    return true;
  }

  dispose(): void {
    for (const [token, session] of this.sessions) {
      this.invalidateSession(token, session);
    }
  }

  private getSession(cookieHeader: string | undefined): { session: WebSession; token: string } | null {
    const token = cookieValue(cookieHeader, WEB_SESSION_COOKIE);
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= this.clock.now() || session.core.session.refreshExpiresAt <= this.clock.now()) {
      this.invalidateSession(token, session);
      return null;
    }
    return { session, token };
  }

  private async resolveSession(
    cookieHeader: string | undefined
  ): Promise<{ session: WebSession; token: string } | null> {
    const resolved = this.getSession(cookieHeader);
    if (!resolved) return null;
    const session = await this.ensureFresh(resolved.token, resolved.session);
    return session ? { session, token: resolved.token } : null;
  }

  private async ensureFresh(token: string, session: WebSession): Promise<WebSession | null> {
    if (this.sessions.get(token) !== session) return null;
    const now = this.clock.now();
    const retryDeadline = Math.min(
      session.core.session.accessExpiresAt,
      (session.refreshState?.startedAt ?? now) + REFRESH_IDEMPOTENCY_WINDOW_MS
    );
    if (session.core.session.refreshExpiresAt <= now || session.expiresAt <= now) {
      this.invalidateSession(token, session);
      return null;
    }
    if (session.refreshState && retryDeadline <= now) {
      this.invalidateSession(token, session);
      return null;
    }
    if (!session.refreshState && session.core.session.accessExpiresAt - now > REFRESH_EARLY_MS) {
      return session;
    }
    if (session.refreshState?.nextRetryAt && session.refreshState.nextRetryAt > now) {
      return session.core.session.accessExpiresAt > now ? session : null;
    }

    const refreshState =
      session.refreshState ??
      (session.refreshState = {
        attemptCount: 0,
        idempotencyKey: randomBytes(32).toString('base64url'),
        nextRetryAt: now,
        refreshCookie: session.core.refreshCookie,
        startedAt: now,
      });
    if (!session.refreshInFlight) {
      session.refreshInFlight = this.coreSessions.refresh(refreshState.refreshCookie, refreshState.idempotencyKey);
    }
    const inFlight = session.refreshInFlight;
    const epoch = session.epoch;
    try {
      const refreshed = await inFlight;
      if (session.refreshInFlight !== inFlight) {
        return this.sessions.get(token) === session ? session : null;
      }
      session.refreshInFlight = undefined;
      if (this.sessions.get(token) !== session || session.epoch !== epoch) return null;
      if (
        refreshed.session.sid !== session.core.session.sid ||
        refreshed.session.rotation !== session.core.session.rotation + 1 ||
        refreshed.session.accessExpiresAt <= this.clock.now() ||
        refreshed.session.refreshExpiresAt <= refreshed.session.accessExpiresAt
      ) {
        this.invalidateSession(token, session);
        return null;
      }
      session.core = refreshed;
      session.refreshState = undefined;
      this.scheduleRefresh(token, session);
      return session;
    } catch (error) {
      if (session.refreshInFlight !== inFlight) {
        return this.sessions.get(token) === session ? session : null;
      }
      session.refreshInFlight = undefined;
      if (this.sessions.get(token) !== session || session.epoch !== epoch) return null;
      const failedAt = this.clock.now();
      if (!isRetryableRefreshError(error) || failedAt >= retryDeadline) {
        this.invalidateSession(token, session);
        return null;
      }
      refreshState.attemptCount += 1;
      const retryDelay = Math.min(1000 * 2 ** (refreshState.attemptCount - 1), MAX_REFRESH_RETRY_MS);
      refreshState.nextRetryAt = Math.min(failedAt + retryDelay, retryDeadline);
      this.scheduleRefresh(token, session);
      return session.core.session.accessExpiresAt > failedAt ? session : null;
    }
  }

  private scheduleRefresh(token: string, session: WebSession): void {
    if (session.refreshTimer) this.clock.clearTimeout(session.refreshTimer);
    const refreshAt = session.refreshState
      ? session.refreshState.nextRetryAt
      : session.core.session.accessExpiresAt - REFRESH_EARLY_MS;
    session.refreshTimer = this.clock.setTimeout(
      () => {
        session.refreshTimer = undefined;
        void this.ensureFresh(token, session);
      },
      Math.max(0, refreshAt - this.clock.now())
    );
    session.refreshTimer.unref?.();
  }

  private invalidateSession(token: string, session: WebSession): void {
    session.epoch += 1;
    session.refreshState = undefined;
    if (session.refreshTimer) {
      this.clock.clearTimeout(session.refreshTimer);
      session.refreshTimer = undefined;
    }
    if (this.sessions.get(token) === session) this.sessions.delete(token);
  }
}

const RETRYABLE_REFRESH_CLIENT_ERROR_CODES = new Set([
  'EXTERNAL_SESSION_REFRESH_IDEMPOTENCY_REQUIRED',
  'EXTERNAL_SESSION_REFRESH_IDEMPOTENCY_INVALID',
]);

function isRetryableRefreshError(error: unknown): boolean {
  if (!(error instanceof CoreSessionClientError)) return false;
  if (error.status >= 500) return true;
  return error.status === 400 && RETRYABLE_REFRESH_CLIENT_ERROR_CODES.has(error.code);
}

function sanitizeUser(user: WebHostLarkAuthUser): WebHostLarkAuthUser {
  return {
    id: user.id,
    username: user.username,
    realname: user.realname,
    ...(user.avatar ? { avatar: user.avatar } : {}),
    ...(user.email ? { email: user.email } : {}),
    ...(user.phone ? { phone: user.phone } : {}),
    ...(Array.isArray(user.permissionCodes)
      ? {
          permissionCodes: user.permissionCodes.filter(
            (code) => typeof code === 'string' && code.startsWith('sales-plan:plan:')
          ),
        }
      : {}),
    ...(typeof user.tenantId === 'string' ? { tenantId: user.tenantId } : {}),
    ...(typeof user.environmentId === 'string' ? { environmentId: user.environmentId } : {}),
  };
}

function sanitizeQrSessionResult(
  result: WebHostLarkAuthResult<WebHostLarkQrLoginSession>
): WebHostLarkAuthResult<WebHostLarkQrLoginSession> {
  if (result.success === false) return { success: false, code: result.code };
  return {
    success: true,
    data: {
      expiresIn: result.data.expiresIn,
      loginUrl: result.data.loginUrl,
      qrcodeId: result.data.qrcodeId,
    },
  };
}

function sanitizePollResult(
  result: WebHostLarkAuthResult<WebHostLarkQrLoginPollResult>
): WebHostLarkAuthResult<WebHostLarkQrLoginPollResult> {
  if (result.success === false) return { success: false, code: result.code };
  const data = result.data;
  return {
    success: true,
    data: {
      status: data.status,
      ...(data.user ? { user: sanitizeUser(data.user) } : {}),
      ...(data.personalModelSync
        ? {
            personalModelSync: {
              configured: data.personalModelSync.configured,
              failed: data.personalModelSync.failed,
              skipped: data.personalModelSync.skipped,
              status: data.personalModelSync.status,
            },
          }
        : {}),
    },
  };
}

function sanitizeExternalIdentity(
  identity: WebHostLarkExternalIdentity | undefined
): WebHostLarkExternalIdentity | null {
  if (
    !identity ||
    identity.provider !== 'lark' ||
    identity.issuer.trim() !== identity.issuer ||
    identity.issuer === '' ||
    identity.tenant_id.trim() !== identity.tenant_id ||
    identity.tenant_id === '' ||
    identity.subject.trim() !== identity.subject ||
    identity.subject === ''
  ) {
    return null;
  }
  return {
    provider: 'lark',
    issuer: identity.issuer,
    tenant_id: identity.tenant_id,
    subject: identity.subject,
  };
}
