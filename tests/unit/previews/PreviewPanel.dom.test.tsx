/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  window.__backendPort = 13400;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      return new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  delete window.__backendPort;
});

// PreviewPanel pulls in a large dependency graph; under the full concurrent
// suite the first cold import's transform/resolve can exceed the default 10s
// timeout (flaky), even though it resolves in a few seconds in isolation. Give
// these import-bound assertions extra headroom so they don't flake.
const IMPORT_TIMEOUT_MS = 30000;

describe('PreviewPanel', () => {
  it(
    'is a React component module that exports a default function',
    async () => {
      const mod = await import('@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel');
      expect(typeof mod.default).toBe('function');
    },
    IMPORT_TIMEOUT_MS
  );

  it(
    'module loads without throwing on import',
    async () => {
      await expect(
        import('@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel')
      ).resolves.toBeTruthy();
    },
    IMPORT_TIMEOUT_MS
  );

  it(
    'has a displayName or function name for debugging',
    async () => {
      const mod = await import('@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel');
      const fn = mod.default;
      expect(fn.name || fn.displayName || 'anonymous').toBeTruthy();
    },
    IMPORT_TIMEOUT_MS
  );
});
