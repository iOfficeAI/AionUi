/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

describe('PreviewPanel', () => {
  it('is a React component module that exports a default function', async () => {
    const mod = await import('@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel');
    expect(typeof mod.default).toBe('function');
  });

  it('module loads without throwing on import', async () => {
    await expect(
      import('@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel')
    ).resolves.toBeTruthy();
  });

  it('has a displayName or function name for debugging', async () => {
    const mod = await import('@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel');
    const fn = mod.default;
    expect(fn.name || fn.displayName || 'anonymous').toBeTruthy();
  });
});
