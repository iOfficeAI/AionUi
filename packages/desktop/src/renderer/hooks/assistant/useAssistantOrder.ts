/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import { useCallback, useMemo } from 'react';

export const ASSISTANT_ENABLED_ORDER_CONFIG_KEY = 'assistants.enabledOrder' as const;

export function normalizeAssistantOrder(value: readonly string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalizedOrder: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string') continue;
    const normalizedId = id.trim();
    if (!normalizedId || seen.has(normalizedId)) continue;
    seen.add(normalizedId);
    normalizedOrder.push(normalizedId);
  }
  return normalizedOrder;
}

/**
 * Persist an assistant order through the shared client-preferences endpoint.
 * `configService.set` updates its reactive cache before the request completes,
 * so restore the previous cache value if the request fails.
 */
export async function persistAssistantOrder(nextOrder: readonly string[]): Promise<void> {
  const previousOrder = configService.get(ASSISTANT_ENABLED_ORDER_CONFIG_KEY);
  const normalizedOrder = normalizeAssistantOrder(nextOrder);

  try {
    await configService.set(ASSISTANT_ENABLED_ORDER_CONFIG_KEY, normalizedOrder);
  } catch (error) {
    configService.setLocal(ASSISTANT_ENABLED_ORDER_CONFIG_KEY, previousOrder);
    throw error;
  }
}

export function useAssistantOrder(): {
  assistantOrder: string[];
  setAssistantOrder: (nextOrder: readonly string[]) => Promise<void>;
} {
  const [configuredOrder] = useConfig(ASSISTANT_ENABLED_ORDER_CONFIG_KEY);
  const assistantOrder = useMemo(() => normalizeAssistantOrder(configuredOrder), [configuredOrder]);
  const setAssistantOrder = useCallback((nextOrder: readonly string[]) => persistAssistantOrder(nextOrder), []);

  return { assistantOrder, setAssistantOrder };
}
