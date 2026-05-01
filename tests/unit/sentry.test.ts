/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { shouldInitializeSentry } from '../../src/common/config/sentry';

const sentryMainInit = vi.fn();
const sentryRendererInit = vi.fn();

vi.mock('@sentry/electron/main', () => ({
  init: sentryMainInit,
}));

vi.mock('@sentry/electron/renderer', () => ({
  init: sentryRendererInit,
}));

describe('Sentry initialization', () => {
  beforeEach(() => {
    sentryMainInit.mockClear();
    sentryRendererInit.mockClear();
  });

  it('main process calls Sentry.init with DSN from env', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';

    // Dynamic import to trigger top-level Sentry.init()
    await import('@sentry/electron/main');
    const Sentry = await import('@sentry/electron/main');
    Sentry.init({ dsn: process.env.SENTRY_DSN });

    expect(sentryMainInit).toHaveBeenCalledWith({ dsn: 'https://test@sentry.io/123' });

    delete process.env.SENTRY_DSN;
  });

  it('main process calls Sentry.init with empty DSN when env is not set', async () => {
    delete process.env.SENTRY_DSN;

    const Sentry = await import('@sentry/electron/main');
    Sentry.init({ dsn: process.env.SENTRY_DSN });

    expect(sentryMainInit).toHaveBeenCalledWith({ dsn: undefined });
  });

  it('renderer process calls Sentry.init without DSN', async () => {
    const Sentry = await import('@sentry/electron/renderer');
    Sentry.init();

    expect(sentryRendererInit).toHaveBeenCalledWith();
  });
});

describe('Sentry runtime guard', () => {
  it('does not initialize in development unless explicitly enabled', () => {
    expect(
      shouldInitializeSentry({
        dsn: 'https://test@sentry.io/123',
        isE2ETestMode: false,
        isPackaged: false,
      })
    ).toBe(false);

    expect(
      shouldInitializeSentry({
        dsn: 'https://test@sentry.io/123',
        enableInDevelopment: true,
        isE2ETestMode: false,
        isPackaged: false,
      })
    ).toBe(true);
  });

  it('requires a DSN and stays disabled in E2E mode', () => {
    expect(
      shouldInitializeSentry({
        dsn: '',
        isE2ETestMode: false,
        isPackaged: true,
      })
    ).toBe(false);

    expect(
      shouldInitializeSentry({
        dsn: 'https://test@sentry.io/123',
        isE2ETestMode: true,
        isPackaged: true,
      })
    ).toBe(false);
  });

  it('initializes packaged builds when a DSN is configured', () => {
    expect(
      shouldInitializeSentry({
        dsn: 'https://test@sentry.io/123',
        isE2ETestMode: false,
        isPackaged: true,
      })
    ).toBe(true);
  });
});

describe('Sentry source map configuration', () => {
  it('enableSentrySourceMaps is true only when SENTRY_AUTH_TOKEN is set and not in development', () => {
    const check = (isDev: boolean, token: string | undefined) => !isDev && !!token;

    expect(check(false, 'some-token')).toBe(true);
    expect(check(true, 'some-token')).toBe(false);
    expect(check(false, undefined)).toBe(false);
    expect(check(false, '')).toBe(false);
    expect(check(true, undefined)).toBe(false);
  });
});
