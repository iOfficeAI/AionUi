/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AvailableAgent } from '../types';
import { getAgentKey as getAgentKeyUtil } from './agentSelectionUtils';

/**
 * Reorder a freshly-fetched agent list according to a user-saved order.
 *
 * - Saved keys that no longer match any detected agent are silently dropped.
 * - Newly-detected agents (absent from `savedOrder`) are appended at the end
 *   in their backend-returned order.
 * - Returns the original list untouched when `savedOrder` is empty/undefined.
 */
export const applySavedAgentOrder = (agents: AvailableAgent[], savedOrder: string[] | undefined): AvailableAgent[] => {
  if (!savedOrder || savedOrder.length === 0) return agents;

  const byKey = new Map<string, AvailableAgent>();
  for (const agent of agents) {
    byKey.set(getAgentKeyUtil(agent), agent);
  }

  const ordered: AvailableAgent[] = [];
  const known = new Set<string>();
  for (const key of savedOrder) {
    const agent = byKey.get(key);
    if (agent) {
      ordered.push(agent);
      known.add(key);
    }
  }
  for (const agent of agents) {
    if (!known.has(getAgentKeyUtil(agent))) {
      ordered.push(agent);
    }
  }
  return ordered;
};
