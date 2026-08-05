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
  code?: string | number;
  message?: string;
  success?: boolean;
  result?: T;
};

type GeaGatewaySessionResponse = {
  accessDecision?: {
    allowed?: boolean;
    code?: string;
  };
  delegationToken?: string;
  gatewayContext?: {
    agentId?: string;
    conversationId?: string;
    sessionId?: string;
  };
};

type GeaGatewayToolResponse = {
  description?: unknown;
  inputSchema?: unknown;
  name?: unknown;
  sourceCode?: unknown;
};

type GeaGatewayToolListResponse = {
  code?: string;
  success?: boolean;
  tools?: GeaGatewayToolResponse[];
};

type GeaGatewayToolCallResponse = {
  auditId?: unknown;
  code?: string;
  result?: unknown;
  sourceCode?: unknown;
  success?: boolean;
  toolName?: unknown;
};

export type GeaMcpGatewayTool = {
  description?: string;
  inputSchema: Record<string, unknown>;
  name: string;
  sourceCode: string;
};

export type GeaMcpGatewayCallResult = {
  auditId?: string;
  result: unknown;
};

export type GeaMcpGatewaySession = {
  callTool: (tool: GeaMcpGatewayTool, argumentsValue?: Record<string, unknown>) => Promise<GeaMcpGatewayCallResult>;
  listTools: () => Promise<GeaMcpGatewayTool[]>;
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

export class GeaMcpGatewayError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'GeaMcpGatewayError';
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
  private authGeneration = 0;
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
    this.authGeneration += 1;
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
    this.authGeneration += 1;
    this.currentUser = null;
  }

  async createMcpGatewaySession(agentCode: string): Promise<GeaMcpGatewaySession> {
    const normalizedAgentCode = agentCode.trim();
    if (!normalizedAgentCode) {
      throw new GeaMcpGatewayError('GEA_AGENT_CODE_MISSING');
    }

    const generation = this.authGeneration;
    const accessToken = this.requireAccessToken(generation);
    const payload = await this.requestGatewayJson<GeaResponse<GeaGatewaySessionResponse>>(
      '/ai/gateway/agent/session',
      accessToken,
      {
        agentCode: normalizedAgentCode,
        channel: 'CS_CLIENT',
      }
    );
    const gatewayContext = payload.result?.gatewayContext;
    const sessionId = gatewayContext?.sessionId?.trim() ?? '';
    const conversationId = gatewayContext?.conversationId?.trim() ?? '';
    const returnedAgentCode = gatewayContext?.agentId?.trim() ?? '';
    const delegationToken = payload.result?.delegationToken?.trim() ?? '';
    if (
      payload.success !== true ||
      payload.result?.accessDecision?.allowed !== true ||
      returnedAgentCode !== normalizedAgentCode ||
      !sessionId ||
      !conversationId ||
      !delegationToken
    ) {
      throw new GeaMcpGatewayError(toGatewayErrorCode(payload.code, 'GEA_GATEWAY_SESSION_REJECTED'));
    }

    const sessionPayload = {
      agentCode: normalizedAgentCode,
      sessionId,
      conversationId,
      delegationToken,
    };

    return {
      listTools: async () => {
        const currentToken = this.requireAccessToken(generation);
        const listPayload = await this.requestGatewayJson<GeaGatewayToolListResponse>(
          '/ai/gateway/mcp/proxy/list',
          currentToken,
          sessionPayload
        );
        if (listPayload.success !== true || !Array.isArray(listPayload.tools)) {
          throw new GeaMcpGatewayError(toGatewayErrorCode(listPayload.code, 'GEA_MCP_LIST_FAILED'));
        }
        return listPayload.tools.map(parseGatewayTool);
      },
      callTool: async (tool, argumentsValue = {}) => {
        const currentToken = this.requireAccessToken(generation);
        const callPayload = await this.requestGatewayJson<GeaGatewayToolCallResponse>(
          '/ai/gateway/mcp/proxy/call',
          currentToken,
          {
            ...sessionPayload,
            mcpCode: tool.sourceCode,
            toolName: tool.name,
            arguments: argumentsValue,
          }
        );
        if (callPayload.success !== true) {
          throw new GeaMcpGatewayError(toGatewayErrorCode(callPayload.code, 'GEA_MCP_CALL_FAILED'));
        }
        if (callPayload.sourceCode !== tool.sourceCode || callPayload.toolName !== tool.name) {
          throw new GeaMcpGatewayError('GEA_MCP_RESPONSE_MISMATCH');
        }
        return {
          result: callPayload.result,
          ...(typeof callPayload.auditId === 'string' && callPayload.auditId.trim()
            ? { auditId: callPayload.auditId.trim() }
            : {}),
        };
      },
    };
  }

  private requireAccessToken(expectedGeneration: number): string {
    if (!this.accessToken || this.authGeneration !== expectedGeneration) {
      throw new GeaMcpGatewayError('GEA_LOGIN_REQUIRED');
    }
    return this.accessToken;
  }

  private async requestGatewayJson<T>(path: string, accessToken: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Access-Token': accessToken,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new GeaMcpGatewayError('GEA_NETWORK_ERROR');
    }
    if (!response.ok) {
      throw new GeaMcpGatewayError(response.status === 401 ? 'GEA_LOGIN_REQUIRED' : `GEA_HTTP_${response.status}`);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new GeaMcpGatewayError('GEA_INVALID_RESPONSE');
    }
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

function toGatewayErrorCode(code: unknown, fallback: string): string {
  return typeof code === 'string' && code.trim() ? code.trim() : fallback;
}

function parseGatewayTool(raw: GeaGatewayToolResponse): GeaMcpGatewayTool {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const sourceCode = typeof raw.sourceCode === 'string' ? raw.sourceCode.trim() : '';
  const inputSchema =
    raw.inputSchema && typeof raw.inputSchema === 'object' && !Array.isArray(raw.inputSchema)
      ? (raw.inputSchema as Record<string, unknown>)
      : null;
  if (!name || !sourceCode || !inputSchema) {
    throw new GeaMcpGatewayError('GEA_INVALID_TOOL_RESPONSE');
  }
  return {
    name,
    sourceCode,
    inputSchema,
    ...(typeof raw.description === 'string' && raw.description.trim() ? { description: raw.description.trim() } : {}),
  };
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
