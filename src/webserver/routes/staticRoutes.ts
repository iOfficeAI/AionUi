/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import express from 'express';
import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import { AUTH_CONFIG } from '../config/constants';
import { createRateLimiter } from '../middleware/security';

/**
 * Try to resolve built renderer assets path, return null if not found
 */
const resolveRendererPath = (): { staticRoot: string; indexHtml: string } | null => {
  const appPath = app.getAppPath();

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
 * Resolve the renderer dev server URL exposed by electron-vite.
 */
const resolveRendererDevServerUrl = (): URL | null => {
  const rawUrl = process.env.ELECTRON_RENDERER_URL;
  if (!rawUrl) {
    return null;
  }

  try {
    return new URL(rawUrl);
  } catch (error) {
    console.warn(`[WebUI] Ignoring invalid ELECTRON_RENDERER_URL: ${rawUrl}`, error);
    return null;
  }
};

/**
 * Create a proxy middleware that forwards requests to the Vite dev server
 */
function createViteDevProxy(devServerUrl: URL): (req: Request, res: Response) => void {
  const requestImpl = devServerUrl.protocol === 'https:' ? https : http;
  const targetPort = devServerUrl.port ? parseInt(devServerUrl.port, 10) : devServerUrl.protocol === 'https:' ? 443 : 80;
  const targetBasePath = devServerUrl.pathname === '/' ? '' : devServerUrl.pathname.replace(/\/$/, '');

  return (req: Request, res: Response) => {
    // Remove ALL restrictive security headers set by Express middleware -
    // Vite dev server content doesn't need them and they block HMR/inline scripts
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('X-Content-Type-Options');
    res.removeHeader('X-XSS-Protection');

    const options: http.RequestOptions = {
      hostname: devServerUrl.hostname,
      port: targetPort,
      path: `${targetBasePath}${req.url || '/'}`,
      method: req.method,
      headers: {
        ...req.headers,
        host: devServerUrl.host,
      },
    };

    const proxyReq = requestImpl.request(options, (proxyRes) => {
      const headers = proxyRes.headers;
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
        res.status(502).send(`[WebUI] Renderer dev server (${devServerUrl.origin}) unavailable: ${err.message}`);
      }
    });

    req.pipe(proxyReq);
  };
}

function registerMissingRendererBuildRoute(expressApp: Express): void {
  expressApp.use((_req: Request, res: Response) => {
    res.status(503).type('text/plain').send('[WebUI] Renderer build not found. Use `bun run webui` for development, or rebuild with `bun run webui:prod`.');
  });
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

  const serveApplication = (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const token = TokenMiddleware.extractToken(req);
      if (token && !TokenMiddleware.isTokenValid(token)) {
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
 * In development: proxy to the renderer dev server exposed by electron-vite
 */
export function registerStaticRoutes(expressApp: Express): void {
  const resolved = resolveRendererPath();

  if (resolved) {
    console.log(`[WebUI] Serving renderer from: ${resolved.staticRoot}`);
    registerProductionStaticRoutes(expressApp, resolved.staticRoot, resolved.indexHtml);
    return;
  }

  const devServerUrl = resolveRendererDevServerUrl();
  if (devServerUrl) {
    console.log(`[WebUI] No renderer build found, proxying to renderer dev server at ${devServerUrl.origin}`);
    const proxy = createViteDevProxy(devServerUrl);
    expressApp.use(proxy);
    return;
  }

  console.error('[WebUI] Renderer build not found and no renderer dev server detected.');
  registerMissingRendererBuildRoute(expressApp);
}

export default registerStaticRoutes;
