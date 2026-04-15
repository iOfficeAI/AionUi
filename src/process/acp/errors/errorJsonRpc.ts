// src/process/acp/errors/errorJsonRpc.ts

const ERROR_CODES: Record<string, number> = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SESSION_NOT_FOUND: -32001,
  RESOURCE_NOT_FOUND: -32002,
  TIMEOUT: -32070,
  PERMISSION_DENIED: -32071,
};

export type JsonRpcErrorResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
};

/** Build a spec-compliant JSON-RPC error response */
export function buildJsonRpcError(
  id: string | number | null,
  code: keyof typeof ERROR_CODES | number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  const numericCode = typeof code === 'number' ? code : (ERROR_CODES[code] ?? -32603);
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: numericCode,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  };
}
