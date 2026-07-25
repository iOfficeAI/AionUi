/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';

/**
 * Single source of truth for which assistants appear in a *selection* list
 * (home pill bar, team creation, scheduled-task dropdown, …) and in what order.
 *
 * Rules (see PRD F-AHM-06 / F-AHM-07):
 *  - Only enabled assistants are selectable.
 *  - A stored enabled-order preference takes priority across every source.
 *  - Without a preference, preserve the legacy bare CLI → user → official
 *    order so an upgrade does not reshuffle an existing user's picker.
 *  - New assistants missing from a stored preference append in legacy order.
 *
 * Note: a bare CLI assistant surfaces with `source === 'generated'`.
 */

/** Legacy group weight — lower comes first. Bare CLI < user-created < official. */
const sourceGroupWeight = (source: string): number => {
  switch (source) {
    case 'generated':
      return 0;
    case 'user':
      return 1;
    case 'builtin':
      return 2;
    default:
      return 1;
  }
};

const compareLegacyAssistantOrder = (left: Assistant, right: Assistant): number => {
  const groupDelta = sourceGroupWeight(left.source) - sourceGroupWeight(right.source);
  if (groupDelta !== 0) return groupDelta;

  const orderDelta = left.sort_order - right.sort_order;
  if (orderDelta !== 0) return orderDelta;

  return left.id.localeCompare(right.id);
};

/**
 * Return enabled assistants in the user's preferred cross-source order.
 * Stale IDs and duplicates in `preferredOrder` are ignored.
 */
export const selectableAssistants = (assistants: Assistant[], preferredOrder?: readonly string[]): Assistant[] => {
  const legacyOrdered = assistants
    .filter((assistant) => assistant.enabled !== false)
    .toSorted(compareLegacyAssistantOrder);

  if (!preferredOrder || preferredOrder.length === 0) {
    return legacyOrdered;
  }

  const enabledById = new Map(legacyOrdered.map((assistant) => [assistant.id, assistant]));
  const orderedAssistants: Assistant[] = [];
  const includedIds = new Set<string>();

  for (const assistantId of preferredOrder) {
    const assistant = enabledById.get(assistantId);
    if (!assistant || includedIds.has(assistantId)) continue;
    includedIds.add(assistantId);
    orderedAssistants.push(assistant);
  }

  for (const assistant of legacyOrdered) {
    if (includedIds.has(assistant.id)) continue;
    includedIds.add(assistant.id);
    orderedAssistants.push(assistant);
  }

  return orderedAssistants;
};

/** Build the persisted enabled order after an assistant is toggled. */
export const assistantOrderAfterToggle = (
  assistants: Assistant[],
  preferredOrder: readonly string[],
  assistantId: string,
  enabled: boolean
): string[] => {
  const currentOrder = selectableAssistants(assistants, preferredOrder)
    .map((assistant) => assistant.id)
    .filter((id) => id !== assistantId);

  return enabled ? [...currentOrder, assistantId] : currentOrder;
};
