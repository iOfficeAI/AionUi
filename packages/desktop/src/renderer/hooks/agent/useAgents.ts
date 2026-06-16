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
  error: unknown;
  revalidate: () => Promise<ManagedAgent[] | undefined>;
  refreshCustomAgents: () => Promise<void>;
};

/**
 * Hook for the Agent settings management surface only. Reads the dedicated
 * `/api/agents/management` diagnostics view (`MANAGED_AGENTS_SWR_KEY`) so
 * user-disabled or missing agents stay listed with working test-connection
 * and re-enable actions.
 *
 * Its `revalidate` refreshes the management key only. Business candidate
 * selection must not depend on `/api/agents`; settings diagnostics should not
 * reach across and mutate unrelated caches.
 *
 * Do not use this anywhere other than `AgentSettings`.
 */
export const useManagedAgents = (): UseManagedAgentsResult => {
  const { data, isLoading, error } = useSWR<ManagedAgent[]>(MANAGED_AGENTS_SWR_KEY, fetchManagedAgents);

  const revalidateManaged = async () => {
    const managed = await mutate<ManagedAgent[]>(MANAGED_AGENTS_SWR_KEY);
    return managed;
  };

  return {
    agents: data ?? [],
    isLoading,
    error,
    revalidate: revalidateManaged,
    refreshCustomAgents: async () => {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await revalidateManaged();
    },
  };
};

/**
 * Non-hook entry point for settings/tooling surfaces that need the management
 * diagnostics catalog rather than the business-facing detected agent list.
 * Writes the result into the shared management cache only.
 */
export async function getManagedAgents(): Promise<ManagedAgent[]> {
  const data = await fetchManagedAgents();
  await mutate(MANAGED_AGENTS_SWR_KEY, data, { revalidate: false });
  return data;
}
