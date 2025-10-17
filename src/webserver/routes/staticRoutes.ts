/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import { AUTH_CONFIG } from '../config/constants';

/**
 * 注册静态资源和页面路由
 * Register static assets and page routes
 */
const resolveRendererPath = () => {
  // Packaged build: resources/index.html
  if (process.resourcesPath) {
    const packagedIndex = path.join(process.resourcesPath, 'index.html');
    if (fs.existsSync(packagedIndex)) {
      return {
        indexHtml: packagedIndex,
        staticRoot: process.resourcesPath,
      } as const;
    }
  }

  // Development build: .webpack/renderer/index.html
  const devIndex = path.join(process.cwd(), '.webpack', 'renderer', 'index.html');
  if (fs.existsSync(devIndex)) {
    return {
      indexHtml: devIndex,
      staticRoot: path.join(process.cwd(), '.webpack', 'renderer'),
    } as const;
  }

  throw new Error('Renderer assets not found. Expected index.html in packaged resources or dev renderer output.');
};

export function registerStaticRoutes(app: Express): void {
  const { staticRoot, indexHtml } = resolveRendererPath();
  const indexHtmlPath = indexHtml;

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

  /**
   * 主页路由
   * Homepage
   * GET /
   */
  app.get('/', serveApplication);

  /**
   * 处理 favicon 请求
   * Handle favicon requests
   * GET /favicon.ico
   */
  app.get('/favicon.ico', (_req: Request, res: Response) => {
    res.status(204).end(); // No Content
  });

  /**
   * 处理子路径路由 (React Router)
   * Handle SPA sub-routes (React Router)
   */
  app.get(/^\/(?!api|static|main_window).*/, serveApplication);

  /**
   * 静态资源
   * Static assets
   */
  const cssFile = path.join(staticRoot, 'main_window.css');
  if (fs.existsSync(cssFile)) {
    app.get('/main_window.css', (_req, res) => {
      res.setHeader('Content-Type', 'text/css');
      res.sendFile(cssFile);
    });
  }

  const mainWindowDir = path.join(staticRoot, 'main_window');
  if (fs.existsSync(mainWindowDir) && fs.statSync(mainWindowDir).isDirectory()) {
    app.use('/main_window', express.static(mainWindowDir));
  }

  const staticDir = path.join(staticRoot, 'static');
  if (fs.existsSync(staticDir) && fs.statSync(staticDir).isDirectory()) {
    app.use('/static', express.static(staticDir));
  }

  /**
   * React Syntax Highlighter 语言包
   * React Syntax Highlighter language packs
   */
  if (fs.existsSync(rendererPath)) {
    app.use(
      '/react-syntax-highlighter_languages_highlight_',
      express.static(rendererPath, {
        setHeaders: (res, filePath) => {
          if (filePath.includes('react-syntax-highlighter_languages_highlight_')) {
            res.setHeader('Content-Type', 'application/javascript');
          }
        },
      })
    );
  }
}

export default registerStaticRoutes;
