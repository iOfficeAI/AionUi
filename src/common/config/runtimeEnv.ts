/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type RuntimeEnv = Record<string, string | undefined>;

type GlobalWithOptionalProcess = typeof globalThis & {
  process?: {
    env?: RuntimeEnv;
  };
};

function getRuntimeEnv(): RuntimeEnv {
  return ((globalThis as GlobalWithOptionalProcess).process?.env as RuntimeEnv | undefined) ?? {};
}

export function getRuntimeEnvValue(key: string): string | undefined {
  return getRuntimeEnv()[key];
}

export function isProductionRuntime(): boolean {
  return getRuntimeEnvValue('NODE_ENV') === 'production';
}

export function isDevelopmentRuntime(): boolean {
  return !isProductionRuntime();
}

export function isMultiInstanceRuntime(): boolean {
  return getRuntimeEnvValue('AIONUI_MULTI_INSTANCE') === '1';
}

export function resolveWebUiDefaultPort(): number {
  if (isProductionRuntime()) return 25808;
  if (isMultiInstanceRuntime()) return 25810;
  return 25809;
}
