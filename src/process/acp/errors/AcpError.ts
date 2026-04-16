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

// ─── Proactive Error Subclasses (from AcpClient) ────────────────

/** spawn() itself failed (command not found, permission denied, etc.). */
export class AgentSpawnError extends AcpError {
  constructor(
    public readonly agentCommand: string,
    cause?: unknown
  ) {
    const msg = `Failed to spawn agent "${agentCommand}": ${cause instanceof Error ? cause.message : String(cause)}`;
    super('CONNECTION_FAILED', msg, { cause, retryable: true });
    this.name = 'AgentSpawnError';
  }
}

/** Process exited before initialize completed. Includes stderr + exit code. */
export class AgentStartupError extends AcpError {
  constructor(
    public readonly agentCommand: string,
    public readonly exitCode: number | null,
    public readonly signal: string | null,
    public readonly stderrSummary: string,
    cause?: unknown
  ) {
    const exitSummary = signal ? `signal: ${signal}` : `code: ${exitCode}`;
    const stderrSuffix = stderrSummary ? `\n${stderrSummary}` : '';
    super('PROCESS_CRASHED', `Agent exited before initialize completed (${exitSummary})${stderrSuffix}`, {
      cause,
      retryable: true,
    });
    this.name = 'AgentStartupError';
  }
}

/** Process died during an active request. Includes exit info. */
export class AgentDisconnectedError extends AcpError {
  constructor(
    public readonly reason: string,
    public readonly exitCode: number | null,
    public readonly signal: string | null,
    options?: { cause?: unknown; outputAlreadyEmitted?: boolean }
  ) {
    const exitSummary = signal ? `signal: ${signal}` : `code: ${exitCode}`;
    super('PROCESS_CRASHED', `Agent disconnected (${reason}, ${exitSummary})`, {
      cause: options?.cause,
      retryable: true,
    });
    this.name = 'AgentDisconnectedError';
    this.outputAlreadyEmitted = options?.outputAlreadyEmitted ?? false;
  }

  readonly outputAlreadyEmitted: boolean;
}
