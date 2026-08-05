import { randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { WebHostLarkAuth, WebHostLarkAuthUser } from './types.js';

const WEB_SESSION_COOKIE = 'aionui-web-session';
const WEB_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_JSON_BODY_BYTES = 16 * 1024;

type WebSession = {
  expiresAt: number;
  user: WebHostLarkAuthUser;
};

type BackendSystemUserResponse = {
  data?: { username?: string };
};

type BackendPasswordResponse = {
  data?: { new_password?: string };
  new_password?: string;
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

async function backendJson<T>(
  backendPort: number,
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<{ data: T; setCookie?: string }> {
  const response = await fetch(`http://127.0.0.1:${backendPort}${path}`, {
    method: options.method ?? 'GET',
    headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    throw new Error(`Backend ${path} returned ${response.status}`);
  }
  return {
    data: (await response.json()) as T,
    setCookie: response.headers.get('set-cookie') ?? undefined,
  };
}

async function createBackendSessionCookie(backendPort: number): Promise<string> {
  const userResponse = await backendJson<BackendSystemUserResponse>(backendPort, '/api/auth/internal/users/system');
  const username = userResponse.data.data?.username?.trim();
  if (!username) {
    throw new Error('Backend system user has no username');
  }

  // The backend account is now an implementation detail. Rotate its password
  // when WebUI starts and keep both the password and resulting session server-side.
  const passwordResponse = await backendJson<BackendPasswordResponse>(backendPort, '/api/webui/reset-password', {
    method: 'POST',
  });
  const password = passwordResponse.data.data?.new_password ?? passwordResponse.data.new_password;
  if (!password) {
    throw new Error('Backend password reset returned no password');
  }

  const loginResponse = await backendJson<unknown>(backendPort, '/login', {
    method: 'POST',
    body: { username, password, remember: true },
  });
  const cookiePair = loginResponse.setCookie?.split(';', 1)[0]?.trim();
  if (!cookiePair) {
    throw new Error('Backend login returned no session cookie');
  }
  return cookiePair;
}

export class LarkAuthGateway {
  private readonly sessions = new Map<string, WebSession>();

  private constructor(
    private readonly larkAuth: WebHostLarkAuth,
    private readonly backendSessionCookie: string
  ) {}

  static async create(backendPort: number, larkAuth: WebHostLarkAuth): Promise<LarkAuthGateway> {
    return new LarkAuthGateway(larkAuth, await createBackendSessionCookie(backendPort));
  }

  getBackendHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
    const { cookie: _cookie, host: _host, ...forwardedHeaders } = headers;
    return { ...forwardedHeaders, cookie: this.backendSessionCookie };
  }

  isAuthenticated(cookieHeader: string | undefined): boolean {
    return this.getSession(cookieHeader) !== null;
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = req.url?.split('?', 1)[0];

    if (url === '/api/lark-auth/qr-session' && req.method === 'POST') {
      writeJson(res, 200, await this.larkAuth.createQrSession());
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
        const result = await this.larkAuth.pollQrSession(qrcodeId);
        if (result.success && result.data.status === 'authenticated' && result.data.user) {
          const token = randomBytes(32).toString('base64url');
          this.sessions.set(token, {
            expiresAt: Date.now() + WEB_SESSION_MAX_AGE_SECONDS * 1000,
            user: result.data.user,
          });
          writeJson(res, 200, result, {
            'set-cookie': `${WEB_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${WEB_SESSION_MAX_AGE_SECONDS}`,
          });
          return true;
        }
        writeJson(res, 200, result);
      } catch {
        writeJson(res, 400, { success: false, code: 'invalidResponse' });
      }
      return true;
    }

    if (url === '/api/lark-auth/status' && req.method === 'GET') {
      const session = this.getSession(req.headers.cookie);
      writeJson(
        res,
        200,
        session
          ? { success: true, data: { authenticated: true, user: session.user } }
          : { success: true, data: { authenticated: false } }
      );
      return true;
    }

    if (url === '/api/auth/user' && req.method === 'GET') {
      const session = this.getSession(req.headers.cookie);
      if (!session) {
        writeJson(res, 401, { success: false });
      } else {
        writeJson(res, 200, { success: true, user: session.user });
      }
      return true;
    }

    if ((url === '/api/lark-auth/logout' || url === '/logout') && req.method === 'POST') {
      const token = cookieValue(req.headers.cookie, WEB_SESSION_COOKIE);
      if (token) this.sessions.delete(token);
      await this.larkAuth.logout?.();
      writeJson(
        res,
        200,
        { success: true, data: { authenticated: false } },
        {
          'set-cookie': `${WEB_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
        }
      );
      return true;
    }

    if (url === '/login') {
      writeJson(res, 404, { success: false, error: 'PASSWORD_LOGIN_DISABLED' });
      return true;
    }

    return false;
  }

  authorizeUpgrade(requestBytes: Buffer): Buffer | null {
    const headerEnd = requestBytes.indexOf('\r\n\r\n');
    if (headerEnd < 0) return null;
    const headerText = requestBytes.subarray(0, headerEnd).toString('latin1');
    const lines = headerText.split('\r\n');
    const cookieHeader = lines
      .find((line) => /^cookie:/i.test(line))
      ?.slice('cookie:'.length)
      .trim();
    if (!this.isAuthenticated(cookieHeader)) return null;

    const nextLines = lines.filter((line) => !/^cookie:/i.test(line));
    nextLines.push(`Cookie: ${this.backendSessionCookie}`);
    const nextHeader = Buffer.from(`${nextLines.join('\r\n')}\r\n\r\n`, 'latin1');
    return Buffer.concat([nextHeader, requestBytes.subarray(headerEnd + 4)]);
  }

  private getSession(cookieHeader: string | undefined): WebSession | null {
    const token = cookieValue(cookieHeader, WEB_SESSION_COOKIE);
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }
}
