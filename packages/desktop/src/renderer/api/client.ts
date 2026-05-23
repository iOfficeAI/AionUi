/**
 * HTTP client factory for communicating with the aioncore server.
 *
 * Usage:
 *   const api = createApiClient('http://127.0.0.1:9123')
 *   const data = await api.get<Foo>('/api/foo')
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown
  ) {
    super(`API error ${status}: ${statusText}`);
  }
}

type RequestOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

async function request<T>(
  baseURL: string,
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  const url = `${baseURL}${path}`;
  const headers: Record<string, string> = { ...options?.headers };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

  const contentType = response.headers.get('Content-Type');
  const rawBody = await response.text();
  let parsedBody: unknown = rawBody;

  if (contentType?.includes('application/json') && rawBody) {
    try {
      parsedBody = JSON.parse(rawBody) as unknown;
    } catch {
      parsedBody = rawBody;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText, parsedBody);
  }

  if (contentType?.includes('application/json')) return parsedBody as T;
  return undefined as T;
}

export function createApiClient(baseURL: string) {
  return {
    get: <T>(path: string, options?: RequestOptions) => request<T>(baseURL, 'GET', path, undefined, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>(baseURL, 'POST', path, body, options),
    put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>(baseURL, 'PUT', path, body, options),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>(baseURL, 'PATCH', path, body, options),
    delete: <T>(path: string, options?: RequestOptions) => request<T>(baseURL, 'DELETE', path, undefined, options),
  };
}
