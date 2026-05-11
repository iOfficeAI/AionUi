import type { AcpMessage } from '@/common/types/acpTypes';
import { AcpErrorType, JSONRPC_VERSION } from '@/common/types/acpTypes';

export type AcpJsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

type AcpErrorClassification = {
  message: string;
  type: AcpErrorType;
  retryable: boolean;
};

type AcpProtocolErrorOptions = {
  acpType: AcpErrorType;
  code: number;
  data?: unknown;
  message: string;
  method?: string;
  retryable: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidJsonRpcId(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidJsonRpcParams(value: unknown): boolean {
  return value === undefined || Array.isArray(value) || isRecord(value);
}

function isValidJsonRpcError(value: unknown): value is AcpJsonRpcError {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.code === 'number' && typeof value.message === 'string';
}

function isValidJsonRpcEnvelope(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.jsonrpc === JSONRPC_VERSION;
}

function isValidJsonRpcRequestOrNotification(value: Record<string, unknown>): boolean {
  if (typeof value.method !== 'string') {
    return false;
  }

  if (!isValidJsonRpcParams(value.params)) {
    return false;
  }

  return value.id === undefined || isValidJsonRpcId(value.id);
}

function isValidJsonRpcResponse(value: Record<string, unknown>): boolean {
  if (!isValidJsonRpcId(value.id)) {
    return false;
  }

  const hasResult = Object.prototype.hasOwnProperty.call(value, 'result');
  const hasError = Object.prototype.hasOwnProperty.call(value, 'error');

  if (hasResult === hasError) {
    return false;
  }

  return !hasError || isValidJsonRpcError(value.error);
}

export function parseAcpJsonRpcMessage(raw: string): AcpMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isValidJsonRpcEnvelope(parsed)) {
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(parsed, 'method')) {
      return isValidJsonRpcRequestOrNotification(parsed) ? (parsed as unknown as AcpMessage) : null;
    }

    if (Object.prototype.hasOwnProperty.call(parsed, 'id')) {
      return isValidJsonRpcResponse(parsed) ? (parsed as unknown as AcpMessage) : null;
    }

    return null;
  } catch {
    return null;
  }
}

function classifyAcpErrorMessage(
  message: string,
  options?: {
    backend?: string;
    rpcCode?: number;
  }
): AcpErrorClassification {
  const normalizedMessage = message.toLowerCase();
  const rpcCode = options?.rpcCode;

  if (options?.backend === 'qwen' && normalizedMessage.includes('internal error')) {
    return {
      type: AcpErrorType.AUTHENTICATION_FAILED,
      retryable: false,
      message:
        'Qwen ACP Internal Error: This usually means authentication failed or the Qwen CLI has compatibility issues. ' +
        'Please try: 1) Restart the application 2) Use the packaged bun launcher instead of a global qwen install ' +
        '3) Check if you have valid Qwen credentials.',
    };
  }

  if (
    rpcCode === 401 ||
    normalizedMessage.includes('authentication') ||
    normalizedMessage.includes('unauthorized') ||
    normalizedMessage.includes('[acp-auth-') ||
    message.includes('认证失败')
  ) {
    return {
      type: AcpErrorType.AUTHENTICATION_FAILED,
      retryable: false,
      message,
    };
  }

  if (rpcCode === 403 || normalizedMessage.includes('permission') || normalizedMessage.includes('forbidden')) {
    return {
      type: AcpErrorType.PERMISSION_DENIED,
      retryable: false,
      message,
    };
  }

  if (
    normalizedMessage.includes('session expired') ||
    normalizedMessage.includes('session not found') ||
    normalizedMessage.includes('invalid session')
  ) {
    return {
      type: AcpErrorType.SESSION_EXPIRED,
      retryable: true,
      message,
    };
  }

  if (normalizedMessage.includes('not ready') || normalizedMessage.includes('not initialized')) {
    return {
      type: AcpErrorType.CONNECTION_NOT_READY,
      retryable: true,
      message,
    };
  }

  if (
    rpcCode === 408 ||
    rpcCode === 504 ||
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('timed out')
  ) {
    return {
      type: AcpErrorType.TIMEOUT,
      retryable: true,
      message,
    };
  }

  if (
    rpcCode === 502 ||
    rpcCode === 503 ||
    normalizedMessage.includes('connection') ||
    normalizedMessage.includes('network') ||
    normalizedMessage.includes('econn')
  ) {
    return {
      type: AcpErrorType.NETWORK_ERROR,
      retryable: true,
      message,
    };
  }

  return {
    type: AcpErrorType.UNKNOWN,
    retryable: false,
    message,
  };
}

export class AcpProtocolError extends Error {
  readonly acpType: AcpErrorType;
  readonly code: number;
  readonly data?: unknown;
  readonly method?: string;
  readonly retryable: boolean;

  constructor(options: AcpProtocolErrorOptions) {
    super(options.message);
    this.name = 'AcpProtocolError';
    this.acpType = options.acpType;
    this.code = options.code;
    this.data = options.data;
    this.method = options.method;
    this.retryable = options.retryable;
  }
}

export function createAcpProtocolError(
  error: AcpJsonRpcError,
  options?: {
    backend?: string;
    method?: string;
  }
): AcpProtocolError {
  const classified = classifyAcpErrorMessage(error.message, {
    backend: options?.backend,
    rpcCode: error.code,
  });

  return new AcpProtocolError({
    acpType: classified.type,
    code: error.code,
    data: error.data,
    message: classified.message,
    method: options?.method,
    retryable: classified.retryable,
  });
}

export function classifyAcpError(error: unknown, backend?: string): AcpErrorClassification {
  if (error instanceof AcpProtocolError) {
    return {
      message: error.message,
      type: error.acpType,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error && error.cause instanceof AcpProtocolError) {
    return {
      message: error.cause.message,
      type: error.cause.acpType,
      retryable: error.cause.retryable,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return classifyAcpErrorMessage(message, { backend });
}
