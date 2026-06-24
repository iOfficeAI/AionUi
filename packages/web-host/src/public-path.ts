/**
 * Server-side public base path helpers (kept local to @aionui/web-host).
 */

export function normalizeBasePath(raw: string): string {
  let value = raw.trim();
  if (!value || value === '/') return '';
  if (!value.startsWith('/')) value = `/${value}`;
  return value.replace(/\/+$/, '') || '';
}

/** Strip a configured public prefix from an incoming request path (before query). */
export function stripPublicBasePath(urlPath: string, basePath: string): string | null {
  if (!basePath) return urlPath || '/';
  const pathOnly = urlPath.split('?')[0] || '/';
  if (pathOnly === basePath || pathOnly === `${basePath}/`) return '/';
  if (pathOnly.startsWith(`${basePath}/`)) {
    const rest = pathOnly.slice(basePath.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return null;
}

export function injectBasePathScript(html: string, basePath: string): string {
  const escaped = basePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `<script>window.__basePath="${escaped}";</script>`;
  if (html.includes('<head>')) return html.replace('<head>', `<head>${script}`);
  return `${script}${html}`;
}

/** Rewrite the HTTP request-line path by stripping a public prefix (for TCP splice). */
export function stripBasePathFromRequestLine(buf: Buffer, basePath: string): Buffer {
  if (!basePath) return buf;
  const newlineIdx = buf.indexOf(0x0a);
  if (newlineIdx < 0) return buf;
  const firstLine = buf.slice(0, newlineIdx).toString('ascii');
  const match = /^(\S+)\s+(\S+)\s+(HTTP\/1\.[01])\r?$/i.exec(firstLine);
  if (!match) return buf;
  const [, method, target, httpVersion] = match;
  const qIndex = target.indexOf('?');
  const pathOnly = qIndex >= 0 ? target.slice(0, qIndex) : target;
  const query = qIndex >= 0 ? target.slice(qIndex) : '';
  const stripped = stripPublicBasePath(pathOnly, basePath);
  if (stripped === null) return buf;
  const rewritten = `${method} ${stripped === '/' && !query ? '/' : `${stripped}${query}`} ${httpVersion}`;
  return Buffer.concat([Buffer.from(`${rewritten}\n`, 'ascii'), buf.slice(newlineIdx + 1)]);
}
