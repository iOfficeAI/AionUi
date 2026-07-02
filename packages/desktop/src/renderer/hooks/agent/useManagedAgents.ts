/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { MANAGED_AGENTS_SWR_KEY, fetchManagedAgents } from '@/renderer/utils/model/agentTypes';
import useSWR, { mutate } from 'swr';

export type UseManagedAgentsResult = {
  agents: ManagedAgent[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: unknown;
  revalidate: () => Promise<ManagedAgent[] | undefined>;
  refreshCatalog: () => Promise<ManagedAgent[] | undefined>;
  refreshCustomAgents: () => Promise<void>;
};

export async function refreshManagedAgentCatalogAndAssistants(): Promise<ManagedAgent[] | undefined> {
  const [agents] = await Promise.all([
    mutate<ManagedAgent[]>(MANAGED_AGENTS_SWR_KEY),
    mutate('assistants.list'),
    mutate('assistants'),
  ]);
  return agents;
}

/**
 * Hook for the Agent settings management surface only. Reads the dedicated
 * `/api/agents/management` diagnostics view (`MANAGED_AGENTS_SWR_KEY`) so
 * user-disabled or missing agents stay listed with working test-connection
 * and re-enable actions.
 *
 * `revalidate` refreshes only the management key. It is the right action for
 * diagnostics-only changes such as health checks that should not invalidate the
 * shared detected-agent catalog.
 *
 * `refreshCatalog` refreshes the management catalog plus assistant list caches
 * after structural or health changes that can affect generated generated assistants.
 * Business assistant pickers must not depend on this hook or on `/api/agents`.
 *
 * Do not use this anywhere other than `AgentSettings`.
 */
export const useManagedAgents = (): UseManagedAgentsResult => {
  const { data, isLoading, isValidating, error } = useSWR<ManagedAgent[]>(MANAGED_AGENTS_SWR_KEY, fetchManagedAgents);

  const revalidateManaged = () => mutate<ManagedAgent[]>(MANAGED_AGENTS_SWR_KEY);

  return {
    agents: data ?? [],
    isLoading,
    isRefreshing: isValidating && !isLoading,
    error,
    revalidate: revalidateManaged,
    refreshCatalog: refreshManagedAgentCatalogAndAssistants,
    refreshCustomAgents: async () => {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await refreshManagedAgentCatalogAndAssistants();
    },
  };
};

/**
 * Lightweight runtime catalog read model for assistant-bound agent rows.
 * Uses the same `/api/agents/management` payload because that endpoint is
 * backed by `agent_metadata`, where ACP catalog snapshots are persisted.
 */
export const useManagedAgentRuntimeCatalog = (): ManagedAgent[] => {
  const { data } = useSWR<ManagedAgent[]>(MANAGED_AGENTS_SWR_KEY, fetchManagedAgents);
  return data ?? [];
};

/**
 * Non-hook entry point for settings/tooling surfaces that need the management
 * diagnostics catalog rather than the business-facing detected agent list.
 * Writes the result into the shared management cache only. Callers that
 * actually mutate the agent directory should invalidate the detected-agent
 * cache separately.
 */
export async function getManagedAgents(): Promise<ManagedAgent[]> {
  const data = await fetchManagedAgents();
  await mutate(MANAGED_AGENTS_SWR_KEY, data, { revalidate: false });
  return data;
}
