// src/process/acp/errors/errorNormalize.ts

import { RequestError } from '@agentclientprotocol/sdk';
import { AcpError, type AcpErrorCode } from '@process/acp/errors/AcpError';
import { extractAcpError, formatUnknownError } from '@process/acp/errors/errorExtract';

/** SDK JSON-RPC error code → AcpErrorCode + retryable mapping */
const ACP_CODE_MAP: Record<number, { code: AcpErrorCode; retryable: boolean }> = {
  [-32700]: { code: 'PROTOCOL_ERROR', retryable: true }, // Parse error
  [-32600]: { code: 'PROTOCOL_ERROR', retryable: false }, // Invalid request
  [-32601]: { code: 'AGENT_ERROR', retryable: false }, // Method not found
  [-32602]: { code: 'AGENT_ERROR', retryable: false }, // Invalid params
  [-32603]: { code: 'AGENT_ERROR', retryable: true }, // Internal error
  [-32800]: { code: 'AUTH_REQUIRED', retryable: true }, // Auth required
  [-32000]: { code: 'SESSION_EXPIRED', retryable: false }, // Resource not found (SDK)
  [-32001]: { code: 'SESSION_EXPIRED', retryable: false }, // Session not found (legacy)
  [-32002]: { code: 'SESSION_EXPIRED', retryable: false }, // Resource not found (SDK)
  [-32042]: { code: 'PERMISSION_CANCELLED', retryable: false }, // Cancelled
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

  // Prefer SDK's RequestError — it carries a typed .code
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

  // Fallback: legacy recursive extraction for non-SDK errors
  const acpPayload = extractAcpError(error);
  if (acpPayload) {
    if (
      acpPayload.message.toLowerCase().includes('auth_required') ||
      acpPayload.message.toLowerCase().includes('authentication required')
    ) {
      return new AcpError('AUTH_REQUIRED', acpPayload.message, {
        cause: error,
        retryable: true,
      });
    }
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
