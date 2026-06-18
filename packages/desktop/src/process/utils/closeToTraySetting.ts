/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest } from '@/common/adapter/httpBridge';
import { ProcessConfig } from './initStorage';

const CLOSE_TO_TRAY_CONFIG_KEY = 'system.closeToTray';
const LEGACY_BACKEND_CLOSE_TO_TRAY_KEY = 'closeToTray';

const readBackendBoolean = async (key: string): Promise<boolean | undefined> => {
  try {
    const value = await httpRequest<Record<string, unknown>>(
      'GET',
      `/api/settings/client?keys=${encodeURIComponent(key)}`,
      undefined,
      {
        silentStatuses: [404],
      }
    );
    const entry = value?.[key];
    return typeof entry === 'boolean' ? entry : undefined;
  } catch {
    return undefined;
  }
};

export const readCloseToTraySetting = async (): Promise<boolean> => {
  const localValue = await ProcessConfig.get(CLOSE_TO_TRAY_CONFIG_KEY);
  if (typeof localValue === 'boolean') {
    return localValue;
  }

  const backendValue =
    (await readBackendBoolean(CLOSE_TO_TRAY_CONFIG_KEY)) ??
    (await readBackendBoolean(LEGACY_BACKEND_CLOSE_TO_TRAY_KEY));

  if (typeof backendValue === 'boolean') {
    try {
      await writeCloseToTraySetting(backendValue);
    } catch {
      await ProcessConfig.set(CLOSE_TO_TRAY_CONFIG_KEY, backendValue).catch(() => {});
    }
    return backendValue;
  }

  return false;
};

export const writeCloseToTraySetting = async (enabled: boolean): Promise<void> => {
  await httpRequest<void>('PUT', '/api/settings/client', { [CLOSE_TO_TRAY_CONFIG_KEY]: enabled });
  await ProcessConfig.set(CLOSE_TO_TRAY_CONFIG_KEY, enabled);
};
