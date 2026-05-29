/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type BackendStartupResult = { ok: true; port: number } | { ok: false };

type StartBackendOrExitOptions = {
  startBackend: () => Promise<number>;
  onStarted: (port: number) => void;
  captureFailure: (error: unknown) => Promise<void> | void;
  exitApp: (code: number) => void;
  exitOnFailure?: boolean;
  logError?: (message: string, error: unknown) => void;
};

function isBackendStartupCancelledError(error: unknown): boolean {
  return error instanceof Error && error.name === 'BackendStartupCancelledError';
}

export async function startBackendOrExit(options: StartBackendOrExitOptions): Promise<BackendStartupResult> {
  try {
    const port = await options.startBackend();
    options.onStarted(port);
    return { ok: true, port };
  } catch (error) {
    if (isBackendStartupCancelledError(error)) {
      return { ok: false };
    }
    options.logError?.('[AionUi] Failed to start aioncore:', error);
    await options.captureFailure(error);
    if (options.exitOnFailure ?? true) {
      options.exitApp(1);
    }
    return { ok: false };
  }
}
