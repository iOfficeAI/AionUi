/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest } from '@/common/adapter/httpBridge';
import type { ConfigKeyMap } from '@/common/config/configKeys';

type BusinessClientSettingKey =
  | 'google.config'
  | 'tools.imageGenerationModel'
  | 'tools.speechToText'
  | 'acp.promptTimeout'
  | 'acp.agentIdleTimeout';

export async function getClientBusinessSetting<K extends BusinessClientSettingKey>(
  key: K
): Promise<ConfigKeyMap[K] | undefined> {
  return httpRequest<ConfigKeyMap[K] | undefined>('GET', `/api/settings/client?key=${encodeURIComponent(key)}`);
}

export async function setClientBusinessSetting<K extends BusinessClientSettingKey>(
  key: K,
  value: ConfigKeyMap[K]
): Promise<void> {
  await httpRequest<void>('PUT', '/api/settings/client', { [key]: value });
}

export async function removeClientBusinessSetting<K extends BusinessClientSettingKey>(key: K): Promise<void> {
  await httpRequest<void>('PUT', '/api/settings/client', { [key]: null });
}
