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
export function registerStaticRoutes(app: Express): void {
  // 使用 process.cwd() 而不是 __dirname，因为 webpack 打包后 __dirname 会指向错误的位置
  // Use process.cwd() instead of __dirname because __dirname points to wrong location after webpack bundling
  const rendererPath = path.join(process.cwd(), '.webpack/renderer');
  const indexHtmlPath = path.join(rendererPath, 'main_window/index.html');

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
