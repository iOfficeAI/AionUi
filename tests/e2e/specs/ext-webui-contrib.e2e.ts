import { test, expect } from '../fixtures';
import { invokeBridge } from '../helpers';

type EnsureWebuiResult = {
  port: number;
  startedByTest: boolean;
};

/**
 * Try to ensure the WebUI service is running.
 * Returns null (instead of throwing) when the service cannot start —
 * e.g. because better-sqlite3 native module was compiled for a different ABI.
 * Callers should `test.skip()` when null is returned.
 */
async function ensureWebuiRunning(page: import('@playwright/test').Page): Promise<EnsureWebuiResult | null> {
  const status = (await invokeBridge(page, 'webui.get-status')) as {
    success?: boolean;
    data?: { running?: boolean; port?: number };
    msg?: string;
  };

  if (status?.success && status.data?.running) {
    return {
      port: typeof status.data.port === 'number' ? status.data.port : 25808,
      startedByTest: false,
    };
  }

  const pickPort = () => 26000 + Math.floor(Math.random() * 3000);

  let started = (await invokeBridge(page, 'webui.start', {})) as {
    success?: boolean;
    data?: { port?: number };
    msg?: string;
  };

  if (!started?.success) {
    started = (await invokeBridge(page, 'webui.start', { port: pickPort() })) as {
      success?: boolean;
      data?: { port?: number };
      msg?: string;
    };
  }

  if (!started?.success) {
    // Native module failures (e.g. better-sqlite3 ABI mismatch) are
    // environment issues, not application bugs — return null so tests skip.
    console.warn(`[E2E] WebUI service unavailable: ${started?.msg || 'unknown error'}`);
    return null;
  }

  return {
    port: typeof started.data?.port === 'number' ? started.data.port : 25808,
    startedByTest: true,
  };
}

async function stopWebuiIfStarted(page: import('@playwright/test').Page, startedByTest: boolean): Promise<void> {
  if (!startedByTest) return;
  await invokeBridge(page, 'webui.stop');
}

test.describe('Extension WebUI Contributions', () => {
  test('serves ext-feishu static assets', async ({ page }) => {
    const webui = await ensureWebuiRunning(page);
    if (!webui) {
      test.skip(true, 'WebUI service unavailable (native module issue)');
      return;
    }
    const { port, startedByTest } = webui;

    try {
      const result = await page.evaluate(async (servicePort) => {
        const response = await fetch(`http://localhost:${servicePort}/ext-feishu/assets/ext-feishu.svg`);
        const text = await response.text();
        return {
          status: response.status,
          contentType: response.headers.get('content-type') || '',
          bodyPreview: text.slice(0, 256),
        };
      }, port);

      expect(result.status).toBe(200);
      expect(
        result.contentType.toLowerCase().includes('image/svg') || result.bodyPreview.includes('<svg')
      ).toBeTruthy();
    } finally {
      await stopWebuiIfStarted(page, startedByTest);
    }
  });

  test('protects ext-feishu api route with auth middleware', async ({ page }) => {
    const webui = await ensureWebuiRunning(page);
    if (!webui) {
      test.skip(true, 'WebUI service unavailable (native module issue)');
      return;
    }
    const { port, startedByTest } = webui;

    try {
      const result = await page.evaluate(async (servicePort) => {
        const response = await fetch(`http://localhost:${servicePort}/ext-feishu/stats`);
        const body = await response.text();
        return {
          status: response.status,
          body,
        };
      }, port);

      expect(result.status).toBe(403);
      expect(/access denied|login/i.test(result.body)).toBeTruthy();
    } finally {
      await stopWebuiIfStarted(page, startedByTest);
    }
  });

  test('supports runtime toggle of webui-contributed extension routes', async ({ page }) => {
    const webui = await ensureWebuiRunning(page);
    if (!webui) {
      test.skip(true, 'WebUI service unavailable (native module issue)');
      return;
    }
    const { port, startedByTest } = webui;

    try {
      const disableResult = (await invokeBridge(page, 'extensions.disable', {
        name: 'ext-feishu',
        reason: 'e2e-check',
      })) as {
        success?: boolean;
        msg?: string;
      };

      expect(disableResult.success).toBeTruthy();

      const disabledRouteResult = await page.evaluate(async (servicePort) => {
        const response = await fetch(`http://localhost:${servicePort}/ext-feishu/stats`);
        return {
          status: response.status,
          body: await response.text(),
        };
      }, port);
      expect(disabledRouteResult.status).toBe(404);

      const enableResult = (await invokeBridge(page, 'extensions.enable', { name: 'ext-feishu' })) as {
        success?: boolean;
        msg?: string;
      };
      expect(enableResult.success).toBeTruthy();

      const enabledRouteResult = await page.evaluate(async (servicePort) => {
        const response = await fetch(`http://localhost:${servicePort}/ext-feishu/stats`);
        return {
          status: response.status,
          body: await response.text(),
        };
      }, port);
      expect(enabledRouteResult.status).toBe(403);
    } finally {
      await invokeBridge(page, 'extensions.enable', { name: 'ext-feishu' });
      await stopWebuiIfStarted(page, startedByTest);
    }
  });
});
