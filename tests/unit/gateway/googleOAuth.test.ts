/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
}));

describe('Google OAuth Service Tests', () => {
  it('exports loginWithGoogleInBrowser function', async () => {
    const { loginWithGoogleInBrowser } = await import('@process/services/oauth/googleOAuthService');
    expect(typeof loginWithGoogleInBrowser).toBe('function');
  });
});
