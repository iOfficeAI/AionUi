/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IAppRestartResult } from '@/common/adapter/ipcBridge';
import type { App } from 'electron';

type RestartableApp = Pick<App, 'isPackaged' | 'relaunch' | 'exit'>;

export function restartApplication(app: RestartableApp, relaunchArgs?: string[]): IAppRestartResult {
  if (!app.isPackaged) {
    console.info('[CSBU WorkMate] Restart skipped in development mode; manual restart required');
    return {
      restarted: false,
      manualRestartRequired: true,
      reason: 'dev-mode',
    };
  }

  console.info('[CSBU WorkMate] Relaunching application to apply changes');
  if (relaunchArgs) {
    app.relaunch({ args: relaunchArgs });
  } else {
    app.relaunch();
  }
  app.exit(0);
  return {
    restarted: true,
    manualRestartRequired: false,
  };
}
