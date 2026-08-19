/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { resolveLocaleKey } from '@/common/utils';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssistantOrder } from './useAssistantOrder';
import {
  applyAssistantSort,
  ASSISTANT_SORT_STRATEGY_CONFIG_KEY,
  ASSISTANT_USAGE_CONFIG_KEY,
  normalizeAssistantUsage,
  normalizeSortStrategy,
  recordAssistantUsage,
  type AssistantSortStrategy,
  type AssistantUsage,
} from '@/renderer/utils/model/assistantSort';

/** Persist a config value through the shared client-preferences endpoint, restoring the cache on failure. */
async function persistConfig(
  key: typeof ASSISTANT_SORT_STRATEGY_CONFIG_KEY | typeof ASSISTANT_USAGE_CONFIG_KEY,
  value: AssistantSortStrategy | AssistantUsage
): Promise<void> {
  const previous = configService.get(key);
  try {
    await configService.set(key, value as never);
  } catch (error) {
    configService.setLocal(key, previous as never);
    throw error;
  }
}

/**
 * Strategy-aware ordering for assistant lists. Composes the manual drag order
 * (#3664) with a selectable strategy (manual / recent / frequency / alphabetical)
 * and per-assistant usage stats. Returns `sortAssistants` to apply the strategy
 * to any assistant list, plus `recordUse` to stamp usage when an assistant is
 * picked for a new conversation, team, or cron task.
 */
export function useAssistantSort(): {
  strategy: AssistantSortStrategy;
  setStrategy: (strategy: AssistantSortStrategy) => Promise<void>;
  usage: AssistantUsage;
  recordUse: (assistantId: string) => Promise<void>;
  sortAssistants: (assistants: readonly Assistant[]) => Assistant[];
  assistantOrder: string[];
  setAssistantOrder: (nextOrder: readonly string[]) => Promise<void>;
} {
  const { i18n } = useTranslation();
  const { assistantOrder, setAssistantOrder } = useAssistantOrder();
  const [configuredStrategy] = useConfig(ASSISTANT_SORT_STRATEGY_CONFIG_KEY);
  const [configuredUsage] = useConfig(ASSISTANT_USAGE_CONFIG_KEY);

  const strategy = useMemo(() => normalizeSortStrategy(configuredStrategy), [configuredStrategy]);
  const usage = useMemo(() => normalizeAssistantUsage(configuredUsage), [configuredUsage]);
  const localeKey = resolveLocaleKey(i18n?.language ?? 'en-US');

  const sortAssistants = useCallback(
    (assistants: readonly Assistant[]) =>
      applyAssistantSort(assistants, { strategy, usage, preferredOrder: assistantOrder, localeKey }),
    [assistantOrder, localeKey, strategy, usage]
  );

  const setStrategy = useCallback(async (next: AssistantSortStrategy) => {
    await persistConfig(ASSISTANT_SORT_STRATEGY_CONFIG_KEY, normalizeSortStrategy(next));
  }, []);

  const recordUse = useCallback(async (assistantId: string) => {
    const nextUsage = recordAssistantUsage(
      normalizeAssistantUsage(configService.get(ASSISTANT_USAGE_CONFIG_KEY)),
      assistantId,
      Date.now()
    );
    await persistConfig(ASSISTANT_USAGE_CONFIG_KEY, nextUsage);
  }, []);

  return {
    strategy,
    setStrategy,
    usage,
    recordUse,
    sortAssistants,
    assistantOrder,
    setAssistantOrder,
  };
}
