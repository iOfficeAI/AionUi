/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { DETECTED_AGENTS_SWR_KEY, MANAGED_AGENTS_SWR_KEY, fetchManagedAgents } from '@/renderer/utils/model/agentTypes';
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
 * Its `revalidate` refreshes both the management key and the shared detected
 * cache. Manual health checks and custom-agent rescans should update the
 * diagnostics page immediately and keep assistant/backend selectors in sync,
 * while business candidate selection still remains assistant-first.
 *
 * Do not use this anywhere other than `AgentSettings`.
 */
export const useManagedAgents = (): UseManagedAgentsResult => {
  const { data, isLoading, error } = useSWR<ManagedAgent[]>(MANAGED_AGENTS_SWR_KEY, fetchManagedAgents);

  const revalidateManaged = async () => {
    const managed = await mutate<ManagedAgent[]>(MANAGED_AGENTS_SWR_KEY);
    await mutate(DETECTED_AGENTS_SWR_KEY);
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
 * Writes the result into the shared management cache and revalidates the
 * shared detected-agent cache so diagnostics-triggered refreshes propagate to
 * assistant/backend selectors too.
 */
export async function getManagedAgents(): Promise<ManagedAgent[]> {
  const data = await fetchManagedAgents();
  await mutate(MANAGED_AGENTS_SWR_KEY, data, { revalidate: false });
  await mutate(DETECTED_AGENTS_SWR_KEY);
  return data;
}
