import type {
  WebHostLarkAuth,
  WebHostLarkAuthResult,
  WebHostLarkAuthUser,
  WebHostLarkQrLoginPollResult,
  WebHostLarkQrLoginSession,
} from './types.js';

const DEFAULT_GEA_BASE_URL = 'https://gea.synear.cn/gea-boot';
const QR_CODE_EXPIRES_IN_SECONDS = 300;

type FetchLike = typeof fetch;
type LarkAuthErrorCode = 'invalidResponse' | 'networkError' | 'serverError';

type GeaResponse<T> = {
  success?: boolean;
  result?: T;
};

type QrCodeResponse = {
  qrcodeId?: string;
};

type QrTokenResponse = {
  success?: boolean;
  token?: string;
};

type UserInfoResponse = {
  userInfo?: {
    avatar?: unknown;
    email?: unknown;
    id?: unknown;
    phone?: unknown;
    realname?: unknown;
    username?: unknown;
  };
};

export class GeaLarkAuthServiceError extends Error {
  readonly code: LarkAuthErrorCode;

  constructor(code: LarkAuthErrorCode) {
    super(code);
    this.name = 'LarkAuthServiceError';
    this.code = code;
  }
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  return url.toString().replace(/\/$/, '');
}

function resolveAvatarUrl(baseUrl: string, value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${baseUrl}/${trimmed.replace(/^\/+/, '')}`;
}

async function readJson<T>(response: Response): Promise<GeaResponse<T>> {
  if (!response.ok) {
    throw new GeaLarkAuthServiceError('serverError');
  }
  try {
    return (await response.json()) as GeaResponse<T>;
  } catch {
    throw new GeaLarkAuthServiceError('invalidResponse');
  }
}

export class GeaLarkAuthService {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private accessToken: string | null = null;
  private currentUser: WebHostLarkAuthUser | null = null;

  constructor(options: { baseUrl?: string; fetchImpl?: FetchLike } = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.AUTH_BROKER_PUBLIC_URL ?? DEFAULT_GEA_BASE_URL);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createQrSession(): Promise<WebHostLarkQrLoginSession> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/sys/getLoginQrcode`, {
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new GeaLarkAuthServiceError('networkError');
    }

    const payload = await readJson<QrCodeResponse>(response);
    const qrcodeId = payload.success === true ? payload.result?.qrcodeId?.trim() : '';
    if (!qrcodeId) {
      throw new GeaLarkAuthServiceError('invalidResponse');
    }

    const state = `gea-client://scan-login?feishuScanQrcodeId=${encodeURIComponent(qrcodeId)}`;
    const loginUrl = new URL(`${this.baseUrl}/sys/thirdLogin/sso/lark/login`);
    loginUrl.searchParams.set('state', state);
    loginUrl.searchParams.set('tenantId', '0');
    return { expiresIn: QR_CODE_EXPIRES_IN_SECONDS, loginUrl: loginUrl.toString(), qrcodeId };
  }

  async pollQrSession(qrcodeId: string): Promise<WebHostLarkQrLoginPollResult> {
    if (!qrcodeId.trim()) {
      throw new GeaLarkAuthServiceError('invalidResponse');
    }

    const url = new URL(`${this.baseUrl}/sys/getQrcodeToken`);
    url.searchParams.set('qrcodeId', qrcodeId);
    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers: { Accept: 'application/json' } });
    } catch {
      throw new GeaLarkAuthServiceError('networkError');
    }

    const payload = await readJson<QrTokenResponse>(response);
    const result = payload.result;
    const token = result?.token;
    if (payload.success !== true || typeof token !== 'string') {
      throw new GeaLarkAuthServiceError('invalidResponse');
    }
    if (token === '-1') return { status: 'pending' };
    if (token === '-2') return { status: 'expired' };
    if (result?.success !== true || token.trim() === '') {
      throw new GeaLarkAuthServiceError('invalidResponse');
    }

    const user = await this.fetchCurrentUser(token);
    this.accessToken = token;
    this.currentUser = user;
    return { status: 'authenticated', user };
  }

  getStatus(): { authenticated: boolean; user?: WebHostLarkAuthUser } {
    return this.accessToken && this.currentUser
      ? { authenticated: true, user: this.currentUser }
      : { authenticated: false };
  }

  logout(): void {
    this.accessToken = null;
    this.currentUser = null;
  }

  private async fetchCurrentUser(token: string): Promise<WebHostLarkAuthUser> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/sys/user/getUserInfo`, {
        headers: { Accept: 'application/json', 'X-Access-Token': token },
      });
    } catch {
      throw new GeaLarkAuthServiceError('networkError');
    }

    const payload = await readJson<UserInfoResponse>(response);
    const raw = payload.success === true ? payload.result?.userInfo : undefined;
    const id = typeof raw?.id === 'string' || typeof raw?.id === 'number' ? String(raw.id).trim() : '';
    const username = typeof raw?.username === 'string' ? raw.username.trim() : '';
    const realname = typeof raw?.realname === 'string' ? raw.realname.trim() : '';
    if (!id || (!username && !realname)) {
      throw new GeaLarkAuthServiceError('invalidResponse');
    }

    const avatar = typeof raw?.avatar === 'string' ? resolveAvatarUrl(this.baseUrl, raw.avatar) : undefined;
    return {
      id,
      username,
      realname,
      ...(avatar ? { avatar } : {}),
      ...(typeof raw?.email === 'string' && raw.email.trim() ? { email: raw.email.trim() } : {}),
      ...(typeof raw?.phone === 'string' && raw.phone.trim() ? { phone: raw.phone.trim() } : {}),
    };
  }
}

async function asResult<T>(operation: () => Promise<T>): Promise<WebHostLarkAuthResult<T>> {
  try {
    return { success: true, data: await operation() };
  } catch (error) {
    return {
      success: false,
      code: error instanceof GeaLarkAuthServiceError ? error.code : 'serverError',
    };
  }
}

export function createGeaLarkAuth(): WebHostLarkAuth {
  const service = new GeaLarkAuthService();
  return {
    createQrSession: () => asResult(() => service.createQrSession()),
    pollQrSession: (qrcodeId) => asResult(() => service.pollQrSession(qrcodeId)),
  };
}
