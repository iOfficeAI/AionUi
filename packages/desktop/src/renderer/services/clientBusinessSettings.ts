/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest } from '@/common/adapter/httpBridge';
import type { ClientBusinessSettingKey, ClientBusinessSettingMap } from '@/common/config/clientSettings';

export async function getClientBusinessSetting<K extends ClientBusinessSettingKey>(
  key: K
): Promise<ClientBusinessSettingMap[K] | undefined> {
  const data = await httpRequest<Record<string, ClientBusinessSettingMap[K] | undefined>>(
    'GET',
    `/api/settings/client?keys=${encodeURIComponent(key)}`
  );
  return data?.[key];
}

export async function setClientBusinessSetting<K extends ClientBusinessSettingKey>(
  key: K,
  value: ClientBusinessSettingMap[K]
): Promise<void> {
  await httpRequest<void>('PUT', '/api/settings/client', { [key]: value });
}

export async function removeClientBusinessSetting<K extends ClientBusinessSettingKey>(key: K): Promise<void> {
  await httpRequest<void>('PUT', '/api/settings/client', { [key]: null });
}
