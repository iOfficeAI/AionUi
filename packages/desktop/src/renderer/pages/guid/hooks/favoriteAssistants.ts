/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizeFavoriteAssistantIds } from '@/renderer/hooks/assistant/useAssistantFavorites';

/**
 * Resolve which assistants occupy the front row of the new-conversation
 * assistant picker, given the user's pinned favorites.
 *
 * - When `favoriteIds` is empty (the user has never customized), the front row
 *   falls back to the default behaviour: the first `visibleLimit` enabled
 *   assistants, promoting the selected one into view if needed.
 * - When favorites exist, the front row is the pinned favorites in their
 *   pinned order (restricted to assistants that are still enabled), with the
 *   selected assistant promoted into view if it is not already showing.
 * - Anything not in the front row belongs in the overflow panel.
 *
 * Returns only `assistantId`s; callers map back to full assistant records.
 */
export function resolveFavoriteFrontRow<T extends { id: string }>(
  enabled: readonly T[],
  rawFavoriteIds: readonly string[] | undefined,
  visibleLimit: number,
  selectedId?: string | null
): { frontRowIds: string[]; hasCustomFavorites: boolean } {
  const favoriteIds = normalizeFavoriteAssistantIds(rawFavoriteIds);
  // Only keep favorites that are still enabled.
  const enabledIds = new Set(enabled.map((assistant) => assistant.id));
  const pinnedIds = favoriteIds.filter((id) => enabledIds.has(id));

  // User never customized (or all favorites went away) → default behaviour.
  if (pinnedIds.length === 0) {
    const defaultIds = enabled.slice(0, visibleLimit).map((assistant) => assistant.id);
    if (selectedId && defaultIds.includes(selectedId)) {
      return { frontRowIds: defaultIds, hasCustomFavorites: false };
    }
    const selectedIndex = selectedId ? enabled.findIndex((assistant) => assistant.id === selectedId) : -1;
    if (selectedId && selectedIndex >= visibleLimit) {
      return {
        frontRowIds: [...defaultIds.slice(0, visibleLimit - 1), selectedId],
        hasCustomFavorites: false,
      };
    }
    return { frontRowIds: defaultIds, hasCustomFavorites: false };
  }

  // Customized favorites → front row is the pinned set (capped at the limit),
  // preserving the user's pinned order, and always keeping the selected
  // assistant visible when it is among the enabled assistants.
  let frontRow = pinnedIds.slice(0, visibleLimit);
  if (selectedId && enabledIds.has(selectedId) && !frontRow.includes(selectedId)) {
    frontRow = frontRow.length < visibleLimit ? [...frontRow, selectedId] : [...frontRow.slice(0, -1), selectedId];
  }

  // Drop assistants that are no longer enabled from the front row (should not
  // happen because we filtered above, but guard against stale props).
  const finalFrontRow = frontRow.filter((id) => enabledIds.has(id));
  return { frontRowIds: finalFrontRow, hasCustomFavorites: true };
}

/**
 * Filter an enabled assistant list down to the overflow set (not in the front
 * row), preserving the enabled order and excluding selected duplicates.
 */
export function computeOverflowAssistantIds<T extends { id: string }>(
  enabled: readonly T[],
  frontRowIds: readonly string[]
): string[] {
  const frontRow = new Set(frontRowIds);
  return enabled.filter((assistant) => !frontRow.has(assistant.id)).map((assistant) => assistant.id);
}
