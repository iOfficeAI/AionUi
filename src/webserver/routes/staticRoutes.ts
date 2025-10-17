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
  const searchedPaths: string[] = [];

  // 1. 生产环境：检查 resources/.webpack/{arch}/renderer (通过 extraResources 复制)
  if (process.resourcesPath) {
    const arch = process.arch; // 'x64', 'arm64', etc.

    // Try with architecture-specific path
    const archRoot = path.join(process.resourcesPath, '.webpack', arch, 'renderer');
    const archIndex = path.join(archRoot, 'main_window', 'index.html');
    searchedPaths.push(archRoot);
    if (fs.existsSync(archIndex)) {
      return { indexHtml: archIndex, staticRoot: archRoot } as const;
    }

    // Try without architecture-specific path (legacy/development)
    const extraResourcesRoot = path.join(process.resourcesPath, '.webpack', 'renderer');
    const extraResourcesIndex = path.join(extraResourcesRoot, 'main_window', 'index.html');
    searchedPaths.push(extraResourcesRoot);
    if (fs.existsSync(extraResourcesIndex)) {
      return { indexHtml: extraResourcesIndex, staticRoot: extraResourcesRoot } as const;
    }

    // Try app.asar.unpacked (fallback for native modules)
    const asarUnpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked', '.webpack', arch, 'renderer');
    const asarUnpackedIndex = path.join(asarUnpackedRoot, 'main_window', 'index.html');
    searchedPaths.push(asarUnpackedRoot);
    if (fs.existsSync(asarUnpackedIndex)) {
      return { indexHtml: asarUnpackedIndex, staticRoot: asarUnpackedRoot } as const;
    }
  }

  // 2. 开发环境：从当前工作目录读取
  const devRoot = path.join(process.cwd(), '.webpack', 'renderer');
  const devIndex = path.join(devRoot, 'main_window', 'index.html');
  searchedPaths.push(devRoot);
  if (fs.existsSync(devIndex)) {
    return { indexHtml: devIndex, staticRoot: devRoot } as const;
  }

  // 3. 使用 __dirname 相对路径（适用于某些特殊打包场景）
  const dirnameRoot = path.join(__dirname, '..', '..', '..', '.webpack', 'renderer');
  const dirnameIndex = path.join(dirnameRoot, 'main_window', 'index.html');
  searchedPaths.push(dirnameRoot);
  if (fs.existsSync(dirnameIndex)) {
    return { indexHtml: dirnameIndex, staticRoot: dirnameRoot } as const;
  }

  throw new Error('Renderer assets not found. Searched paths:\n' + searchedPaths.map((p, i) => `  ${i + 1}. ${p}`).join('\n'));
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
