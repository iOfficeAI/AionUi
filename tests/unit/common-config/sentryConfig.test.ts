import { describe, expect, it } from 'vitest';
import { resolveDesktopSentryConfig } from '@/common/config/sentry';

describe('resolveDesktopSentryConfig', () => {
  it('prefers AIONUI_SENTRY_DSN over SENTRY_DSN', () => {
    const config = resolveDesktopSentryConfig({
      AIONUI_SENTRY_DSN: 'https://primary.example/1',
      SENTRY_DSN: 'https://fallback.example/2',
      AIONUI_BRAND_NAME: 'POUNDING',
    });

    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe('https://primary.example/1');
    expect(config.brand).toBe('POUNDING');
  });

  it('falls back to SENTRY_DSN when AIONUI_SENTRY_DSN is absent', () => {
    const config = resolveDesktopSentryConfig({
      SENTRY_DSN: 'https://fallback.example/2',
    });

    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe('https://fallback.example/2');
  });

  it('falls back to the bundled POUNDING DSN when no env override exists', () => {
    const config = resolveDesktopSentryConfig({});

    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe(
      'https://50b2642878dae7371cff3a85e61a3a13@o4511410803441664.ingest.us.sentry.io/4511410809274368'
    );
    expect(config.brand).toBe('POUNDING');
  });

  it('resolves release, environment, and serverName from branded env vars', () => {
    const config = resolveDesktopSentryConfig({
      AIONUI_SENTRY_DSN: 'https://primary.example/1',
      AIONUI_SENTRY_RELEASE: '2.0.2-dev+a3881e2',
      AIONUI_SENTRY_ENVIRONMENT: 'production',
      AIONUI_SENTRY_SERVER_NAME: 'pounding-desktop',
      AIONUI_BRAND_NAME: 'POUNDING',
    });

    expect(config.release).toBe('2.0.2-dev+a3881e2');
    expect(config.environment).toBe('production');
    expect(config.serverName).toBe('pounding-desktop');
    expect(config.brand).toBe('POUNDING');
  });
});
