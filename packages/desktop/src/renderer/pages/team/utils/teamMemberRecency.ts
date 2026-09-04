/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TeamAssistantOption } from '../components/assistantSelectUtils';
import { assistantKey } from '../components/assistantSelectUtils';

/**
 * Last-used timestamps (ms epoch) keyed by assistant id, used to float the
 * team "add member" candidates the user just added to the top (MRU ordering).
 * Persisted through the shared client-preferences endpoint.
 */
export const TEAM_ADD_MEMBER_RECENCY_CONFIG_KEY = 'team.addMemberRecency' as const;

export type TeamMemberRecency = Record<string, number>;

/** A candidate that has never been added since the preference was introduced has no timestamp. */
const NO_RECENCY = -1;

/**
 * Validate + clean a raw persisted value into a recency map. Drops non-object,
 * non-string keys and non-positive finite timestamps so stale/corrupt data
 * cannot crash the ordering.
 */
export function normalizeMemberRecency(value: unknown): TeamMemberRecency {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const recency: TeamMemberRecency = {};
  for (const [assistantId, timestamp] of Object.entries(value)) {
    if (!assistantId) continue;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) continue;
    recency[assistantId] = timestamp;
  }
  return recency;
}

/**
 * Record that `assistantId` was used at `timestamp`, returning a new map
 * (immutable) so React state updates are traceable. Unrelated entries are kept.
 */
export function touchMemberRecency(
  recency: TeamMemberRecency,
  assistantId: string,
  timestamp: number
): TeamMemberRecency {
  return { ...recency, [assistantId]: timestamp };
}

/**
 * Stable, most-recently-used-first sort for add-member candidates: entries with
 * a recorded timestamp float to the front (newest first); everything else keeps
 * its original relative order and stays behind. Pass = fall back to original order.
 */
export function sortCandidatesByRecency<T extends TeamAssistantOption>(
  candidates: readonly T[],
  recency: Readonly<TeamMemberRecency>
): T[] {
  return candidates
    .map((candidate, originalIndex) => ({
      candidate,
      originalIndex,
      timestamp: recency[assistantKey(candidate)] ?? NO_RECENCY,
    }))
    .toSorted((left, right) => {
      if (right.timestamp !== left.timestamp) return right.timestamp - left.timestamp;
      return left.originalIndex - right.originalIndex;
    })
    .map(({ candidate }) => candidate);
}
