/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import { AUTH_CONFIG } from '../config/constants';
import { createRateLimiter } from '../middleware/security';

/**
 * 注册静态资源和页面路由
 * Register static assets and page routes
 */
const resolveRendererPath = () => {
  // Webpack assets are always inside app.asar in production or project directory in development
  // app.getAppPath() returns the correct path for both cases
  const appPath = app.getAppPath();
  const baseRoot = path.join(appPath, '.webpack', 'renderer');
  const indexHtml = path.join(baseRoot, 'main_window', 'index.html');

  if (fs.existsSync(indexHtml)) {
    return { indexHtml, staticRoot: baseRoot } as const;
  }

  throw new Error(`Renderer assets not found at ${indexHtml}`);
};

export function registerStaticRoutes(app: Express): void {
  const { staticRoot, indexHtml } = resolveRendererPath();
  const indexHtmlPath = indexHtml;

  // Create a lenient rate limiter for static page requests to prevent DDoS
  // 为静态页面请求创建宽松的速率限制器以防止 DDoS 攻击
  const pageRateLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute / 1分钟
    max: 300, // 300 requests per minute (very lenient) / 每分钟300次请求（非常宽松）
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

  /**
   * 主页路由
   * Homepage
   * GET /
   */
  app.get('/', pageRateLimiter, serveApplication);

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
   * Exclude: api, static, main_window, and webpack chunk directories (react, arco, vendors, etc.)
   * Also exclude files with extensions (.js, .css, .map, etc.)
   */
  app.get(/^\/(?!api|static|main_window|react|arco|vendors|markdown|codemirror)(?!.*\.[a-zA-Z0-9]+$).*/, pageRateLimiter, serveApplication);

  /**
   * 静态资源
   * Static assets
   */
  // 直接挂载编译输出目录，让 webpack 在写出文件后即可被访问
  app.use(express.static(staticRoot));

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
  if (fs.existsSync(staticRoot)) {
    app.use(
      '/react-syntax-highlighter_languages_highlight_',
      express.static(staticRoot, {
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
