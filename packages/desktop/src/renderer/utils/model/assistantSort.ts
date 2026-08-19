/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { selectableAssistants } from './assistantSelection';

/** Selectable assistant ordering strategies (see issue #4017). */
export type AssistantSortStrategy = 'manual' | 'recent' | 'frequency' | 'alphabetical';

/** Per-assistant usage stats, keyed by assistant id. */
export type AssistantUsageRecord = {
  lastUsedAt?: number;
  useCount?: number;
};

export type AssistantUsage = Record<string, AssistantUsageRecord>;

/** Persisted key for the chosen sort strategy. */
export const ASSISTANT_SORT_STRATEGY_CONFIG_KEY = 'assistants.sortStrategy' as const;
/** Persisted key for per-assistant usage stats. */
export const ASSISTANT_USAGE_CONFIG_KEY = 'assistants.usage' as const;

const SORT_STRATEGIES: ReadonlySet<AssistantSortStrategy> = new Set(['manual', 'recent', 'frequency', 'alphabetical']);

const NEVER_USED = -Infinity;

/** Coerce a raw persisted strategy into a known value, defaulting to manual. */
export function normalizeSortStrategy(value: unknown): AssistantSortStrategy {
  return SORT_STRATEGIES.has(value as AssistantSortStrategy) ? (value as AssistantSortStrategy) : 'manual';
}

/** Validate + clean a raw persisted usage map, dropping corrupt entries. */
export function normalizeAssistantUsage(value: unknown): AssistantUsage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const usage: AssistantUsage = {};
  for (const [assistantId, record] of Object.entries(value)) {
    if (!assistantId) continue;
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const lastUsedAt =
      typeof record.lastUsedAt === 'number' && Number.isFinite(record.lastUsedAt) && record.lastUsedAt > 0
        ? record.lastUsedAt
        : undefined;
    const useCount =
      typeof record.useCount === 'number' && Number.isInteger(record.useCount) && record.useCount > 0
        ? record.useCount
        : undefined;
    if (lastUsedAt === undefined && useCount === undefined) continue;
    const entry: AssistantUsageRecord = {};
    if (lastUsedAt !== undefined) entry.lastUsedAt = lastUsedAt;
    if (useCount !== undefined) entry.useCount = useCount;
    usage[assistantId] = entry;
  }
  return usage;
}

/**
 * Record that `assistantId` was used at `timestamp`, returning a new map
 * (immutable) that increments the use count and stamps the last-used time.
 */
export function recordAssistantUsage(usage: AssistantUsage, assistantId: string, timestamp: number): AssistantUsage {
  const previous = usage[assistantId] ?? {};
  return {
    ...usage,
    [assistantId]: { lastUsedAt: timestamp, useCount: (previous.useCount ?? 0) + 1 },
  };
}

const getRecency = (usage: AssistantUsage, id: string): number => usage[id]?.lastUsedAt ?? NEVER_USED;
const getCount = (usage: AssistantUsage, id: string): number => usage[id]?.useCount ?? 0;

const assistantDisplayName = (assistant: Assistant, localeKey: string): string =>
  assistant.name_i18n?.[localeKey] || assistant.name;

/**
 * Apply the chosen sort strategy to an assistant list.
 *
 * The base list is always the manual, enabled-only ordering (so disabled
 * assistants are dropped and new assistants are appended deterministically);
 * automatic strategies then re-sort it live while keeping ties in base order.
 * `manual` returns the base order unchanged, matching the legacy drag order.
 */
export function applyAssistantSort(
  assistants: readonly Assistant[],
  options: {
    strategy: AssistantSortStrategy;
    usage?: AssistantUsage;
    preferredOrder?: readonly string[];
    localeKey: string;
  }
): Assistant[] {
  const { strategy, preferredOrder, localeKey } = options;
  const usage = options.usage ?? {};
  const base = selectableAssistants(assistants, preferredOrder);
  if (strategy === 'manual') return base;

  const indexed = base.map((assistant, index) => ({ assistant, index }));

  if (strategy === 'alphabetical') {
    const collator = new Intl.Collator(localeKey);
    indexed.sort((left, right) => {
      const byName = collator.compare(
        assistantDisplayName(left.assistant, localeKey),
        assistantDisplayName(right.assistant, localeKey)
      );
      return byName !== 0 ? byName : left.index - right.index;
    });
    return indexed.map(({ assistant }) => assistant);
  }

  indexed.sort((left, right) => {
    const byStrategy =
      strategy === 'recent'
        ? getRecency(usage, right.assistant.id) - getRecency(usage, left.assistant.id)
        : getCount(usage, right.assistant.id) - getCount(usage, left.assistant.id);
    return byStrategy !== 0 ? byStrategy : left.index - right.index;
  });

  return indexed.map(({ assistant }) => assistant);
}
