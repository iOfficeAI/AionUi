// src/process/acp/errors/errorNormalize.ts

import { RequestError } from '@agentclientprotocol/sdk';
import { AcpError, type AcpErrorCode } from '@process/acp/errors/AcpError';
import { extractAcpError, formatUnknownError } from '@process/acp/errors/errorExtract';

/**
 * SDK JSON-RPC error code → AcpErrorCode + retryable mapping.
 *
 * Standard JSON-RPC 2.0 codes (§5.1):
 *   -32700          Parse error
 *   -32600          Invalid Request
 *   -32601          Method not found
 *   -32602          Invalid params
 *   -32603          Internal error
 *
 * ACP-defined codes (see @agentclientprotocol/sdk schema.json ErrorCode):
 *   -32000          Auth required
 *   -32001          (legacy) Session not found — not in ACP schema, but
 *                   acpx recognises it (RESOURCE_NOT_FOUND_ACP_CODES)
 *   -32002          Resource not found
 *   -32042          URL elicitation required (unstable)
 *   -32800          Request cancelled (unstable)
 *
 * Current strategy: code-based mapping only.
 * acpx additionally performs message/data heuristics as a fallback for
 * non-compliant agents (see acpx/src/acp/error-shapes.ts for
 * `isAcpResourceNotFoundError` and error-normalization.ts for
 * `isAcpAuthRequiredPayload`). If we encounter agents that return
 * non-standard codes, we can adopt the same approach.
 */
const ACP_CODE_MAP: Record<number, { code: AcpErrorCode; retryable: boolean }> = {
  [-32700]: { code: 'PROTOCOL_ERROR', retryable: true }, // Parse error
  [-32600]: { code: 'PROTOCOL_ERROR', retryable: false }, // Invalid request
  [-32601]: { code: 'AGENT_ERROR', retryable: false }, // Method not found
  [-32602]: { code: 'AGENT_ERROR', retryable: false }, // Invalid params
  [-32603]: { code: 'AGENT_ERROR', retryable: true }, // Internal error
  [-32000]: { code: 'AUTH_REQUIRED', retryable: true }, // Auth required (ACP)
  [-32001]: { code: 'SESSION_EXPIRED', retryable: false }, // Session not found (legacy, also in acpx)
  [-32002]: { code: 'SESSION_EXPIRED', retryable: false }, // Resource not found (ACP)
  [-32042]: { code: 'AGENT_ERROR', retryable: false }, // URL elicitation required (ACP, unstable)
  [-32800]: { code: 'PERMISSION_CANCELLED', retryable: false }, // Request cancelled (ACP, unstable)
};

const RETRYABLE_ERRNO = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT']);

/**
 * Normalize any error into AcpError.
 * If already AcpError, return as-is.
 */
export function normalizeError(error: unknown): AcpError {
  if (error instanceof AcpError) return error;

  // Check for Node.js errno (connection errors)
  if (error instanceof Error) {
    const errno = (error as NodeJS.ErrnoException).code;
    if (errno && RETRYABLE_ERRNO.has(errno)) {
      return new AcpError('CONNECTION_FAILED', error.message, {
        cause: error,
        retryable: true,
      });
    }
  }

  // Prefer SDK's RequestError — it carries a typed .code from the ACP schema.
  if (error instanceof RequestError) {
    const mapped = ACP_CODE_MAP[error.code];
    if (mapped) {
      return new AcpError(mapped.code, error.message, {
        cause: error,
        retryable: mapped.retryable,
      });
    }
    return new AcpError('AGENT_ERROR', error.message, { cause: error });
  }

  // Detect SDK "ACP connection closed" — child process exited before responding.
  // This is typically a transient process crash and should be retryable.
  if (error instanceof Error && /ACP connection closed/i.test(error.message)) {
    return new AcpError('PROCESS_CRASHED', error.message, {
      cause: error,
      retryable: true,
    });
  }

  // Fallback: legacy recursive extraction for non-SDK errors
  const acpPayload = extractAcpError(error);
  if (acpPayload) {
    // Try code-based mapping first (same ACP codes)
    const mapped = ACP_CODE_MAP[acpPayload.code];
    if (mapped) {
      return new AcpError(mapped.code, acpPayload.message, {
        cause: error,
        retryable: mapped.retryable,
      });
    }
    return new AcpError('AGENT_ERROR', acpPayload.message, { cause: error });
  }

  // Fallback
  return new AcpError('INTERNAL_ERROR', formatUnknownError(error), { cause: error });
}

/** Check if error is retryable for prompt operations */
export function isRetryablePromptError(error: unknown): boolean {
  if (error instanceof AcpError) return error.retryable;
  const normalized = normalizeError(error);
  return normalized.retryable;
}
