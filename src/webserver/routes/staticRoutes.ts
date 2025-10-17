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
  const candidates: string[] = [];

  const resourcesPath = process.resourcesPath;
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'app.asar.unpacked', '.webpack', 'renderer'));
    candidates.push(path.join(resourcesPath, '.webpack', 'renderer'));
  }

  candidates.push(path.join(process.cwd(), '.webpack/renderer'));
  candidates.push(path.resolve(__dirname, '../../../.webpack/renderer'));

  const match = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'main_window/index.html')));
  if (!match) {
    throw new Error(`Renderer assets not found. Checked: ${candidates.join(', ')}`);
  }
  return match;
};

export function registerStaticRoutes(app: Express): void {
  const rendererPath = resolveRendererPath();
  const indexHtmlPath = path.join(rendererPath, 'main_window', 'index.html');

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
  app.use('/main_window.css', express.static(path.join(rendererPath, 'main_window.css')));
  app.use('/main_window', express.static(path.join(rendererPath, 'main_window')));
  app.use('/static', express.static(path.join(rendererPath, 'static')));

  /**
   * React Syntax Highlighter 语言包
   * React Syntax Highlighter language packs
   */
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

export default registerStaticRoutes;
