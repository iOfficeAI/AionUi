/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest } from '@/common/adapter/httpBridge';
import { ProcessConfig } from './initStorage';

const START_MINIMIZED_CONFIG_KEY = 'system.startMinimizedToTray';

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

export const readStartMinimizedToTraySetting = async (): Promise<boolean> => {
  const localValue = await ProcessConfig.get(START_MINIMIZED_CONFIG_KEY);
  if (typeof localValue === 'boolean') {
    return localValue;
  }

  const backendValue = await readBackendBoolean(START_MINIMIZED_CONFIG_KEY);
  if (typeof backendValue === 'boolean') {
    try {
      await writeStartMinimizedToTraySetting(backendValue);
    } catch {
      await ProcessConfig.set(START_MINIMIZED_CONFIG_KEY, backendValue).catch(() => {});
    }
    return backendValue;
  }

  return false;
};

export const writeStartMinimizedToTraySetting = async (enabled: boolean): Promise<void> => {
  await httpRequest<void>('PUT', '/api/settings/client', { [START_MINIMIZED_CONFIG_KEY]: enabled });
  await ProcessConfig.set(START_MINIMIZED_CONFIG_KEY, enabled);
};
