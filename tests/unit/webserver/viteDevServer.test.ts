/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalRendererUrl = process.env['ELECTRON_RENDERER_URL'];

afterEach(() => {
  vi.resetModules();

  if (originalRendererUrl === undefined) {
    delete process.env['ELECTRON_RENDERER_URL'];
  } else {
    process.env['ELECTRON_RENDERER_URL'] = originalRendererUrl;
  }
});

describe('viteDevServer', () => {
  it('uses localhost as the vite dev host', async () => {
    const { VITE_DEV_HOST } = await import('../../../src/process/webserver/viteDevServer');

    expect(VITE_DEV_HOST).toBe('localhost');
  });

  it('reads the dev server port from ELECTRON_RENDERER_URL', async () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://127.0.0.1:6123';

    const { VITE_DEV_PORT } = await import('../../../src/process/webserver/viteDevServer');

    expect(VITE_DEV_PORT).toBe(6123);
  });

  it('falls back to 5173 when ELECTRON_RENDERER_URL is an empty string', async () => {
    process.env['ELECTRON_RENDERER_URL'] = '';

    const { VITE_DEV_PORT } = await import('../../../src/process/webserver/viteDevServer');

    expect(VITE_DEV_PORT).toBe(5173);
  });

  it('falls back to 5173 when ELECTRON_RENDERER_URL is invalid', async () => {
    process.env['ELECTRON_RENDERER_URL'] = 'not-a-valid-url';

    const { VITE_DEV_PORT } = await import('../../../src/process/webserver/viteDevServer');

    expect(VITE_DEV_PORT).toBe(5173);
  });

  it('falls back to 5173 when ELECTRON_RENDERER_URL is missing', async () => {
    delete process.env['ELECTRON_RENDERER_URL'];

    const { VITE_DEV_PORT } = await import('../../../src/process/webserver/viteDevServer');

    expect(VITE_DEV_PORT).toBe(5173);
  });
});
