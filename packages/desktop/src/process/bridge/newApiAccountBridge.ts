/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { newApiDesktopAccountService } from './services/NewApiDesktopAccountService';

export function initNewApiAccountBridge(): void {
  ipcBridge.newApiAccount.getStatus.provider(async () => {
    return await newApiDesktopAccountService.getStatus();
  });

  ipcBridge.newApiAccount.refreshStatus.provider(async () => {
    return await newApiDesktopAccountService.refreshStatus();
  });

  ipcBridge.newApiAccount.login.provider(async (params) => {
    return await newApiDesktopAccountService.login(params);
  });

  ipcBridge.newApiAccount.logout.provider(async () => {
    return await newApiDesktopAccountService.logout();
  });

  ipcBridge.newApiAccount.reconcileModel.provider(async ({ cliTarget, modelId }) => {
    try {
      await newApiDesktopAccountService.reconcileManagedRuntimeState({ cliTarget, modelId });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
