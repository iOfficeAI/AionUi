// src/process/acp/errors/AcpError.ts

export type AcpErrorCode =
  | 'CONNECTION_FAILED'
  | 'AUTH_FAILED'
  | 'AUTH_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'PROMPT_TIMEOUT'
  | 'PROCESS_CRASHED'
  | 'PROTOCOL_ERROR'
  | 'AGENT_ERROR'
  | 'QUEUE_FULL'
  | 'INVALID_STATE'
  | 'PERMISSION_CANCELLED'
  | 'INTERNAL_ERROR';

export class AcpError extends Error {
  readonly retryable: boolean;

  constructor(
    public readonly code: AcpErrorCode,
    message: string,
    options?: { cause?: unknown; retryable?: boolean }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AcpError';
    this.retryable = options?.retryable ?? false;
  }
}
