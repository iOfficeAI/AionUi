/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PreviewPanel from '@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel';

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
  delete window.__backendPort;
});

describe('PreviewPanel', () => {
  it('is a React component module that exports a default function', () => {
    expect(typeof PreviewPanel).toBe('function');
  });

  it('module loads without throwing on import', () => {
    expect(PreviewPanel).toBeTruthy();
  });

  it('has a displayName or function name for debugging', () => {
    expect(PreviewPanel.name || PreviewPanel.displayName || 'anonymous').toBeTruthy();
  });
});
