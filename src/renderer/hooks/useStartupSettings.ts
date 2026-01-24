/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import useSWR from 'swr';

export type StartupSettings = {
  startOnBoot: boolean;
  openWebUiOnBoot: boolean;
  silentOnBoot: boolean;
  closeToTray: boolean;
  /** Best-effort OS state (may differ if OS rejects registration). */
  effectiveStartOnBoot?: boolean;
};

export const useStartupSettings = () => {
  const swr = useSWR<StartupSettings>('app.startup.settings', () => ipcBridge.application.getStartupSettings.invoke(), {
    fallbackData: {
      startOnBoot: false,
      openWebUiOnBoot: false,
      silentOnBoot: false,
      closeToTray: true,
    },
    shouldRetryOnError: false,
  });

  const setStartupSettings = async (next: Pick<StartupSettings, 'startOnBoot' | 'openWebUiOnBoot' | 'silentOnBoot' | 'closeToTray'>) => {
    const result = await ipcBridge.application.setStartupSettings.invoke(next);
    if (result?.success) {
      if (result.data) {
        await swr.mutate(result.data, { revalidate: false });
      } else {
        await swr.mutate();
      }
    }
    return result;
  };

  return {
    ...swr,
    setStartupSettings,
  };
};
