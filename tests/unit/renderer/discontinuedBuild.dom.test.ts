/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('discontinuedBuild constant', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('defaults to false when __IS_DISCONTINUED_BUILD__ is undefined', async () => {
    vi.resetModules();
    const mod = await import('@/renderer/utils/discontinuedBuild');
    expect(mod.IS_DISCONTINUED_BUILD).toBe(false);
  });

  it('is true when __IS_DISCONTINUED_BUILD__ global is true', async () => {
    vi.stubGlobal('__IS_DISCONTINUED_BUILD__', true);
    vi.resetModules();
    const mod = await import('@/renderer/utils/discontinuedBuild');
    expect(mod.IS_DISCONTINUED_BUILD).toBe(true);
  });
});
