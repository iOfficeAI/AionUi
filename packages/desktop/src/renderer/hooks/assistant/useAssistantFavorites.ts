/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import { useCallback, useMemo } from 'react';

export const GUID_FAVORITE_ASSISTANTS_CONFIG_KEY = 'guid.favoriteAssistantIds' as const;

export function normalizeFavoriteAssistantIds(value: readonly string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalizedIds: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string') continue;
    const normalizedId = id.trim();
    if (!normalizedId || seen.has(normalizedId)) continue;
    seen.add(normalizedId);
    normalizedIds.push(normalizedId);
  }
  return normalizedIds;
}

/**
 * Persist the favorite assistant ids through the shared client-preferences
 * endpoint. `configService.set` updates its reactive cache before the request
 * completes, so restore the previous cache value if the request fails.
 */
export async function persistFavoriteAssistantIds(nextIds: readonly string[]): Promise<void> {
  const previousIds = configService.get(GUID_FAVORITE_ASSISTANTS_CONFIG_KEY);
  const normalizedIds = normalizeFavoriteAssistantIds(nextIds);

  try {
    await configService.set(GUID_FAVORITE_ASSISTANTS_CONFIG_KEY, normalizedIds);
  } catch (error) {
    configService.setLocal(GUID_FAVORITE_ASSISTANTS_CONFIG_KEY, previousIds);
    throw error;
  }
}

/**
 * Toggle an assistant id in/out of the front-most stable position of the list,
 * returning a new normalized array without mutating the input.
 */
export function toggleFavoriteAssistantId(current: readonly string[], assistantId: string): string[] {
  const index = current.indexOf(assistantId);
  if (index >= 0) {
    return current.filter((id) => id !== assistantId);
  }
  return [assistantId, ...current];
}

export function useAssistantFavorites(): {
  favoriteAssistantIds: string[];
  setFavoriteAssistantIds: (nextIds: readonly string[]) => Promise<void>;
} {
  const [configuredIds] = useConfig(GUID_FAVORITE_ASSISTANTS_CONFIG_KEY);
  const favoriteAssistantIds = useMemo(() => normalizeFavoriteAssistantIds(configuredIds), [configuredIds]);
  const setFavoriteAssistantIds = useCallback((nextIds: readonly string[]) => persistFavoriteAssistantIds(nextIds), []);

  return { favoriteAssistantIds, setFavoriteAssistantIds };
}
