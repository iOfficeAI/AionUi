import { getBaseUrl } from '@/common/adapter/httpBridge';

/**
 * Build the HTTP URL for a static file served by the backend.
 * Endpoint: GET /api/conversations/{conv_id}/files/{*path}
 */
export function buildFileUrl(conversationId: string, relativePath: string): string {
  const segments = relativePath.split('/').map((seg) => encodeURIComponent(seg));
  const encodedPath = segments.join('/');
  return `${getBaseUrl()}/api/conversations/${conversationId}/files/${encodedPath}`;
}

const blobUrlCache = new Map<string, { url: string; refCount: number }>();

/**
 * Fetch a file via the static file endpoint and return a blob URL.
 * Used for <img src>, <iframe src>, PDF.js etc. that cannot carry Authorization headers.
 *
 * Caches blob URLs by (conversationId + relativePath) to avoid duplicate fetches.
 * Callers must call `revokeFileBlob()` when done to release memory.
 */
export async function fetchFileAsBlob(
  conversationId: string,
  relativePath: string,
  signal?: AbortSignal
): Promise<string> {
  const cacheKey = `${conversationId}:${relativePath}`;
  const cached = blobUrlCache.get(cacheKey);
  if (cached) {
    cached.refCount++;
    return cached.url;
  }

  const url = buildFileUrl(conversationId, relativePath);
  const response = await fetch(url, { signal, cache: 'no-cache' });

  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  blobUrlCache.set(cacheKey, { url: blobUrl, refCount: 1 });
  return blobUrl;
}

/**
 * Release a blob URL obtained from `fetchFileAsBlob`.
 * Only revokes when refCount drops to zero.
 */
export function revokeFileBlob(conversationId: string, relativePath: string): void {
  const cacheKey = `${conversationId}:${relativePath}`;
  const cached = blobUrlCache.get(cacheKey);
  if (!cached) return;

  cached.refCount--;
  if (cached.refCount <= 0) {
    URL.revokeObjectURL(cached.url);
    blobUrlCache.delete(cacheKey);
  }
}

/**
 * Fetch file content as text via the static file endpoint.
 * Used for text/code/markdown file previews.
 */
export async function fetchFileAsText(
  conversationId: string,
  relativePath: string,
  signal?: AbortSignal
): Promise<string> {
  const url = buildFileUrl(conversationId, relativePath);
  const response = await fetch(url, { signal, cache: 'no-cache' });

  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
  }

  return response.text();
}
