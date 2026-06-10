/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

const trimEnv = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

export type DesktopSentryConfig = {
  enabled: boolean;
  dsn?: string;
  release?: string;
  environment?: string;
  serverName?: string;
  brand: string;
};

// POUNDING Sentry DSN — set via environment variable or CI secret.
// Get the DSN from https://sentry.io -> Settings -> Projects -> pound
const POUNDING_SENTRY_DSN =
  'https://50b2642878dae7371cff3a85e61a3a13@o4511410803441664.ingest.us.sentry.io/4511410809274368'; // POUNDING project DSN (halo-fx org)

export function resolveDesktopSentryConfig(env: Record<string, string | undefined>): DesktopSentryConfig {
  const dsn = trimEnv(env.POUNDING_SENTRY_DSN) || trimEnv(env.SENTRY_DSN) || trimEnv(POUNDING_SENTRY_DSN);
  const release = trimEnv(env.POUNDING_SENTRY_RELEASE) || trimEnv(env.APP_VERSION);
  const environment = trimEnv(env.POUNDING_SENTRY_ENVIRONMENT) || trimEnv(env.NODE_ENV) || 'production';
  const serverName = trimEnv(env.POUNDING_SENTRY_SERVER_NAME) || trimEnv(env.npm_package_name);
  const brand = trimEnv(env.POUNDING_BRAND_NAME) || 'POUNDING';

  return {
    enabled: Boolean(dsn),
    dsn,
    release,
    environment,
    serverName,
    brand,
  };
}
