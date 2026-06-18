/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IAppRestartResult } from '@/common/adapter/ipcBridge';
import type { App } from 'electron';

type RestartableApp = Pick<App, 'isPackaged' | 'relaunch' | 'exit'>;

export function restartApplication(app: RestartableApp): IAppRestartResult {
  if (!app.isPackaged) {
    console.info('[AionUi] Restart skipped in development mode; manual restart required');
    return {
      restarted: false,
      manualRestartRequired: true,
      reason: 'dev-mode',
    };
  }

  console.info('[AionUi] Relaunching application to apply changes');
  app.relaunch();
  app.exit(0);
  return {
    restarted: true,
    manualRestartRequired: false,
  };
}
