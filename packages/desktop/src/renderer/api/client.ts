/**
 * HTTP client factory for communicating with the aionui-backend server.
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

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    throw new ApiError(response.status, response.statusText, errorBody);
  }

  const contentType = response.headers.get('Content-Type');
  if (contentType?.includes('application/json')) return (await response.json()) as T;
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
