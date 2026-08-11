/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type SentryInitOptions = {
  dsn?: string;
  enableInDevelopment?: boolean;
  isE2ETestMode: boolean;
  isPackaged: boolean;
};

export function isTruthyEnvFlag(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function shouldInitializeSentry(options: SentryInitOptions): boolean {
  if (options.isE2ETestMode) return false;
  if (!options.dsn?.trim()) return false;
  if (options.isPackaged) return true;
  return options.enableInDevelopment === true;
}
