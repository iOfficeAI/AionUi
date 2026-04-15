// src/process/acp/errors/errorExtract.ts

const MAX_DEPTH = 5;

export type AcpErrorPayload = {
  code: number;
  message: string;
  data?: unknown;
};

/**
 * Recursively extract ACP error payload from unknown error.
 * Searches error/cause/acp fields up to MAX_DEPTH levels.
 */
export function extractAcpError(error: unknown, depth = 0): AcpErrorPayload | null {
  if (depth > MAX_DEPTH || error == null || typeof error !== 'object') return null;

  const obj = error as Record<string, unknown>;

  if (typeof obj.code === 'number' && typeof obj.message === 'string') {
    return {
      code: obj.code,
      message: obj.message,
      ...(obj.data !== undefined ? { data: obj.data } : {}),
    };
  }

  for (const key of ['error', 'cause', 'acp'] as const) {
    if (obj[key] != null) {
      const found = extractAcpError(obj[key], depth + 1);
      if (found) return found;
    }
  }

  return null;
}

/** Format unknown error to string with 4-level fallback. */
export function formatUnknownError(error: unknown): string {
  if (error == null) return 'Unknown error';
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  ) {
    return (error as Record<string, unknown>).message as string;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
