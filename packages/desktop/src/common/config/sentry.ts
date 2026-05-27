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

export function resolveDesktopSentryConfig(env: Record<string, string | undefined>): DesktopSentryConfig {
  const dsn = trimEnv(env.AIONUI_SENTRY_DSN) || trimEnv(env.SENTRY_DSN);
  const release = trimEnv(env.AIONUI_SENTRY_RELEASE) || trimEnv(env.APP_VERSION);
  const environment = trimEnv(env.AIONUI_SENTRY_ENVIRONMENT) || trimEnv(env.NODE_ENV) || 'production';
  const serverName = trimEnv(env.AIONUI_SENTRY_SERVER_NAME) || trimEnv(env.npm_package_name);
  const brand = trimEnv(env.AIONUI_BRAND_NAME) || 'POUNDING';

  return {
    enabled: Boolean(dsn),
    dsn,
    release,
    environment,
    serverName,
    brand,
  };
}
