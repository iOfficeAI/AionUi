import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tempDirs: string[] = [];
const originalRendererUrl = process.env['ELECTRON_RENDERER_URL'];

function createPackagedRendererRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-static-routes-'));
  const rendererDir = path.join(root, 'out', 'renderer');
  fs.mkdirSync(rendererDir, { recursive: true });
  fs.writeFileSync(path.join(rendererDir, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
  const staticDir = path.join(rendererDir, 'static');
  fs.mkdirSync(staticDir, { recursive: true });
  fs.writeFileSync(path.join(staticDir, 'hello.txt'), 'hello', 'utf8');
  tempDirs.push(root);
  return root;
}

function countStaticMiddlewareLayers(app: express.Express): number {
  const stack = (app as unknown as { router?: { stack: unknown[] } }).router?.stack;
  if (!stack) return 0;

  return stack.filter((layer) => (layer as { name?: string }).name === 'serveStatic').length;
}

function getRegisteredGetRoutePaths(app: express.Express): Array<string | RegExp> {
  return app.router.stack
    .filter(
      (layer: { route?: { path: string | RegExp; methods?: Record<string, boolean> } }) => layer.route?.methods?.get
    )
    .map((layer: { route?: { path: string | RegExp } }) => layer.route?.path)
    .filter((value): value is string | RegExp => value !== undefined);
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  if (originalRendererUrl === undefined) {
    delete process.env['ELECTRON_RENDERER_URL'];
  } else {
    process.env['ELECTRON_RENDERER_URL'] = originalRendererUrl;
  }

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('registerStaticRoutes', () => {
  it('does not register a dedicated /favicon.ico route in production static mode', async () => {
    const packagedRoot = createPackagedRendererRoot();

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

    const { registerStaticRoutes } = await import('../../src/process/webserver/routes/staticRoutes');
    const app = express();

    registerStaticRoutes(app);

    expect(getRegisteredGetRoutePaths(app)).not.toContain('/favicon.ico');
    // With `out/renderer/static/` present, `registerStaticRoutes` should register:
    // - one `serveStatic` for the renderer root
    // - an additional `serveStatic` for `/static/*`
    expect(countStaticMiddlewareLayers(app)).toBe(2);
  });

  it('proxies dev requests to the renderer port from ELECTRON_RENDERER_URL', async () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://127.0.0.1:6123';

    const requestMock = vi.fn((options: unknown, callback?: (proxyRes: express.Response) => void) => {
      const proxyRes = {
        headers: {
          'content-type': 'application/javascript',
        },
        statusCode: 200,
        pipe: vi.fn(),
      } as unknown as express.Response;

      callback?.(proxyRes);

      return {
        on: vi.fn(),
      } as never;
    });

    vi.doMock('@/common/platform', () => ({
      getPlatformServices: () => ({
        paths: {
          getAppPath: () => null,
        },
      }),
    }));
    vi.doMock('http', async () => {
      const actual = await vi.importActual<typeof import('http')>('http');
      return {
        ...actual,
        default: {
          ...actual,
          request: requestMock,
        },
        request: requestMock,
      };
    });

    const { registerStaticRoutes } = await import('../../src/process/webserver/routes/staticRoutes');
    const app = {
      use: vi.fn(),
      get: vi.fn(),
    } as unknown as express.Express;

    registerStaticRoutes(app);

    const proxyMiddleware = (app.use as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      | ((req: express.Request, res: express.Response) => void)
      | undefined;

    expect(proxyMiddleware).toBeTypeOf('function');

    const req = {
      url: '/@vite/client',
      method: 'GET',
      headers: {
        host: 'localhost:25809',
      },
      pipe: vi.fn(),
    } as unknown as express.Request;

    const resStatus = vi.fn();
    const res = {
      removeHeader: vi.fn(),
      setHeader: vi.fn(),
      status: resStatus,
      headersSent: false,
      send: vi.fn(),
    } as unknown as express.Response;
    resStatus.mockReturnValue(res);

    proxyMiddleware?.(req, res);

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'localhost',
        port: 6123,
        path: '/@vite/client',
        headers: expect.objectContaining({
          host: 'localhost:6123',
        }),
      }),
      expect.any(Function)
    );
    expect(req.pipe).toHaveBeenCalled();
    expect((res.removeHeader as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      ['Content-Security-Policy'],
      ['X-Frame-Options'],
      ['X-Content-Type-Options'],
      ['X-XSS-Protection'],
    ]);
  });
});
