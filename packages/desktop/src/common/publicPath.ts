/**
 * Public URL base path helpers for WebUI subpath deployments (reverse proxies).
 */

declare global {
  interface Window {
    __backendPort?: number;
    /** When set (including empty string), disables pathname auto-detection. */
    __basePath?: string;
  }
}

/**
 * Normalize a configured base path: leading slash, no trailing slash, empty for root.
 */
export function normalizeBasePath(raw: string): string {
  let value = raw.trim();
  if (!value || value === '/') return '';
  if (!value.startsWith('/')) value = `/${value}`;
  return value.replace(/\/+$/, '') || '';
}

/**
 * Join a root-absolute path (`/api/...`) with the public base path.
 */
export function joinPublicPath(path: string, basePath?: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = basePath ?? getPublicBasePath();
  if (!base) return normalizedPath;
  return `${base}${normalizedPath}`;
}

/**
 * Best-effort base path from the browser location when not explicitly configured.
 * Skips pathnames whose last segment looks like a static file.
 */
export function autoDetectBasePathFromLocation(): string {
  if (typeof window === 'undefined') return '';
  const pathname = window.location.pathname || '/';
  if (pathname === '/' || pathname === '') return '';
  const trimmed = pathname.replace(/\/+$/, '');
  if (!trimmed) return '';
  const lastSegment = trimmed.split('/').pop() || '';
  if (/\.[a-z0-9]+$/i.test(lastSegment)) return '';
  return normalizeBasePath(trimmed);
}

/**
 * Resolve the public base path prefix for WebUI browser mode.
 */
export function getPublicBasePath(): string {
  if (typeof window === 'undefined') return '';
  const explicit = (window as Window).__basePath;
  if (typeof explicit === 'string') return normalizeBasePath(explicit);
  return autoDetectBasePathFromLocation();
}

export function isWebUiBrowserMode(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined' && !(window as Window).__backendPort;
}
