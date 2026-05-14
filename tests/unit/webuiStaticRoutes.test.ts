import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tempDirs: string[] = [];

function createPackagedRendererRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-static-routes-'));
  const rendererDir = path.join(root, 'out', 'renderer');
  fs.mkdirSync(rendererDir, { recursive: true });
  fs.writeFileSync(path.join(rendererDir, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
  tempDirs.push(root);
  return root;
}

function getRegisteredGetRoutePaths(app: express.Express): Array<string | RegExp> {
  return app.router.stack
    .filter(
      (layer: { route?: { path: string | RegExp; methods?: Record<string, boolean> } }) => layer.route?.methods?.get
    )
    .map((layer: { route?: { path: string | RegExp } }) => layer.route?.path)
    .filter((value): value is string | RegExp => value !== undefined);
}

function requestApp(app: express.Express, requestPath: string): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to bind test server')));
        return;
      }

      const request = http.get(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: requestPath,
        },
        (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            body += chunk;
          });
          response.on('end', () => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve({
                statusCode: response.statusCode ?? 0,
                headers: response.headers,
                body,
              });
            });
          });
        }
      );
      request.on('error', (error) => {
        server.close(() => reject(error));
      });
    });

    server.on('error', reject);
  });
}

function mockProductionStaticRouteDeps(packagedRoot: string): void {
  vi.doMock('@/common/platform', () => ({
    getPlatformServices: () => ({
      paths: {
        getAppPath: () => packagedRoot,
      },
    }),
  }));
  vi.doMock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
    TokenMiddleware: {
      extractToken: () => null,
      isTokenValid: () => true,
    },
  }));
  vi.doMock('@process/webserver/middleware/security', () => ({
    createRateLimiter: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  }));
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('registerStaticRoutes', () => {
  it('does not register a dedicated /favicon.ico route in production static mode', async () => {
    const packagedRoot = createPackagedRendererRoot();

    mockProductionStaticRouteDeps(packagedRoot);

    const { registerStaticRoutes } = await import('@process/webserver/routes/staticRoutes');
    const app = express();

    registerStaticRoutes(app);

    expect(getRegisteredGetRoutePaths(app)).not.toContain('/favicon.ico');
  });

  it('redirects direct HashRouter sub-routes to hash URLs in production static mode', async () => {
    const packagedRoot = createPackagedRendererRoot();

    mockProductionStaticRouteDeps(packagedRoot);

    const { registerStaticRoutes } = await import('@process/webserver/routes/staticRoutes');
    const app = express();

    registerStaticRoutes(app);

    const response = await requestApp(app, '/settings/providers?tab=keys');

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/#/settings/providers?tab=keys');
  });
});
