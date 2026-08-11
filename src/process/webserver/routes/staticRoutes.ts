/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { getPlatformServices } from '@/common/platform';
import { TokenMiddleware } from '@process/webserver/auth/middleware/TokenMiddleware';
import { AUTH_CONFIG } from '../config/constants';
import { createRateLimiter } from '../middleware/security';

const LOCAL_WEBUI_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export const REMOTE_VITE_CLIENT_STUB = `
const noop = () => {};
const hotContext = {
  data: {},
  accept: noop,
  acceptExports: noop,
  dispose: noop,
  prune: noop,
  decline: noop,
  invalidate: noop,
  on: noop,
  off: noop,
  send: noop,
};

const styleElements = new Map();

function updateStyle(id, content) {
  if (typeof document === 'undefined') return;

  let style = styleElements.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(style);
    styleElements.set(id, style);
  }

  style.textContent = content;
}

function removeStyle(id) {
  const style = styleElements.get(id);
  if (!style) return;
  style.remove();
  styleElements.delete(id);
}

function createHotContext() {
  return hotContext;
}

function injectQuery(url, queryToInject) {
  const [base, hash = ''] = url.split('#');
  const separator = base.includes('?') ? '&' : '?';
  return \`\${base}\${separator}\${queryToInject}\${hash ? \`#\${hash}\` : ''}\`;
}

class ErrorOverlay extends HTMLElement {
  constructor(error) {
    super();
    if (error) console.error(error);
  }

  close() {}
}

if (typeof customElements !== 'undefined' && !customElements.get('vite-error-overlay')) {
  customElements.define('vite-error-overlay', ErrorOverlay);
}

export { ErrorOverlay, createHotContext, injectQuery, removeStyle, updateStyle };
`.trim();

/**
 * Vite dev server port — read from ELECTRON_RENDERER_URL when available
 * (electron-vite sets it to the actual port), fallback to 5173.
 */
export const VITE_DEV_PORT = (() => {
  const url = process.env['ELECTRON_RENDERER_URL'];
  if (url) {
    try {
      return Number(new URL(url).port) || 5173;
    } catch {
      // ignore parse errors
    }
  }
  return 5173;
})();

/**
 * Try to resolve built renderer assets path, return null if not found
 */
export const resolveRendererPath = (): {
  staticRoot: string;
  indexHtml: string;
} | null => {
  const appPath = getPlatformServices().paths.getAppPath();
  if (!appPath) return null;

  const candidates = [
    {
      staticRoot: path.join(appPath, 'out', 'renderer'),
      indexHtml: path.join(appPath, 'out', 'renderer', 'index.html'),
    },
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.indexHtml)) {
      return candidate;
    }
  }

  return null;
};

/**
 * Create a proxy middleware that forwards requests to the Vite dev server
 */
function createViteDevProxy(): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => {
    // Remove ALL restrictive security headers set by Express middleware -
    // Vite dev server content doesn't need them and they block HMR/inline scripts
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('X-Content-Type-Options');
    res.removeHeader('X-XSS-Protection');

    if (shouldServeRemoteViteClientStub(req)) {
      res.setHeader('Content-Type', 'text/javascript');
      res.setHeader('Cache-Control', 'no-cache');
      res.status(200).send(REMOTE_VITE_CLIENT_STUB);
      return;
    }

    const options: http.RequestOptions = {
      hostname: 'localhost',
      port: VITE_DEV_PORT,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `localhost:${VITE_DEV_PORT}`,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const headers = proxyRes.headers;
      const contentType = String(headers['content-type'] ?? '');
      const shouldStripViteClient = contentType.includes('text/html') && shouldDisableViteClient(req);

      if (shouldStripViteClient) {
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf8');
          const rewrittenHtml = stripViteClientScript(html);

          for (const [key, value] of Object.entries(headers)) {
            if (value !== undefined && key.toLowerCase() !== 'content-length') {
              try {
                res.setHeader(key, value);
              } catch {
                // Ignore invalid header errors
              }
            }
          }

          res.status(proxyRes.statusCode || 200);
          res.send(rewrittenHtml);
        });
        return;
      }

      for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined) {
          try {
            res.setHeader(key, value);
          } catch {
            // Ignore invalid header errors
          }
        }
      }
      res.status(proxyRes.statusCode || 200);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`[ViteProxy] Error proxying ${req.method} ${req.url}: ${err.message}`);
      if (!res.headersSent) {
        res.status(502).send(`[WebUI] Vite dev server (localhost:${VITE_DEV_PORT}) unavailable: ${err.message}`);
      }
    });

    req.pipe(proxyReq);
  };
}

export function shouldDisableViteClient(req: Pick<Request, 'hostname'>): boolean {
  return !LOCAL_WEBUI_HOSTNAMES.has(req.hostname);
}

export function shouldServeRemoteViteClientStub(req: Pick<Request, 'hostname' | 'url'>): boolean {
  return shouldDisableViteClient(req) && req.url.startsWith('/@vite/client');
}

export function stripViteClientScript(html: string): string {
  return html.replace(/^\s*<script type="module" src="\/@vite\/client"><\/script>\s*$/m, '');
}

/**
 * Register static asset routes for production mode
 */
function registerProductionStaticRoutes(expressApp: Express, staticRoot: string, indexHtmlPath: string): void {
  const pageRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 300,
    message: 'Too many requests, please try again later',
  });

  const serveApplication = async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const token = TokenMiddleware.extractToken(req);
      if (token && !(await TokenMiddleware.isTokenValid(token))) {
        res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
      }

      const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    } catch (error) {
      console.error('Error serving index.html:', error);
      res.status(500).send('Internal Server Error');
    }
  };

  expressApp.get('/', pageRateLimiter, serveApplication);

  // SPA sub-routes (React Router)
  expressApp.get(/^\/(?!api|static|assets)(?!.*\.[a-zA-Z0-9]+$).*/, pageRateLimiter, serveApplication);

  // Static assets
  expressApp.use(express.static(staticRoot));

  const staticDir = path.join(staticRoot, 'static');
  if (fs.existsSync(staticDir) && fs.statSync(staticDir).isDirectory()) {
    expressApp.use('/static', express.static(staticDir));
  }
}

/**
 * Register static assets and page routes
 *
 * In production: serve built files from out/renderer/
 * In development: proxy to Vite dev server (localhost:5173)
 */
export function registerStaticRoutes(expressApp: Express): void {
  const resolved = resolveRendererPath();

  if (resolved) {
    console.log(`[WebUI] Serving renderer from: ${resolved.staticRoot}`);
    registerProductionStaticRoutes(expressApp, resolved.staticRoot, resolved.indexHtml);
    return;
  }

  // No built assets - proxy to Vite dev server in development mode
  console.log(`[WebUI] No renderer build found, proxying to Vite dev server at http://localhost:${VITE_DEV_PORT}`);
  const proxy = createViteDevProxy();
  expressApp.use(proxy);
}

export default registerStaticRoutes;
