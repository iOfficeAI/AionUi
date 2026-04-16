/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { IProvider } from '@/common/config/storage';
import { isAionrsOnlyPlatform } from '@/renderer/utils/model/modelPlatforms';

/**
 * Classification result for a health check response message.
 *
 * - `'skip'`    – message is metadata or stream-start; ignore and keep waiting.
 * - `'error'`   – API returned an error; health check failed.
 * - `'success'` – first real response chunk arrived; health check passed.
 */
export type HealthCheckAction = 'skip' | 'error' | 'success';

/**
 * Classify a response message type for health check determination.
 *
 * `request_trace` and `start` are infrastructure events emitted before any
 * actual API response — they must be skipped so the health check waits for
 * a real content chunk or an error from the upstream API.
 */
export function classifyHealthCheckMessage(type: string): HealthCheckAction {
  if (type === 'request_trace' || type === 'start') {
    return 'skip';
  }
  if (type === 'error') {
    return 'error';
  }
  return 'success';
}

/**
 * Resolve which conversation backend should be used for model health checks.
 *
 * Most providers can be probed through the Gemini conversation stack, but aionrs-only
 * login providers store auth in aionrs auth files and must be checked through the aionrs backend.
 */
export function getHealthCheckConversationType(platform: IProvider): ICreateConversationParams['type'] {
  return isAionrsOnlyPlatform(platform.platform) ? 'aionrs' : 'gemini';
}
