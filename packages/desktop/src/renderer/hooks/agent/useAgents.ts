/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import {
  DETECTED_AGENTS_SWR_KEY,
  MANAGED_AGENTS_SWR_KEY,
  fetchDetectedAgents,
  fetchManagedAgents,
} from '@/renderer/utils/model/agentTypes';
import useSWR, { mutate } from 'swr';

export type UseAgentsResult = {
  agents: AgentMetadata[];
  isLoading: boolean;
  error: unknown;
  /** Force re-fetch of `/api/agents` and broadcast to all subscribers. */
  revalidate: () => Promise<AgentMetadata[] | undefined>;
  /** POST `/api/agents/refresh` then revalidate — use this for explicit "refresh" buttons. */
  refreshCustomAgents: () => Promise<void>;
};

/**
 * Canonical React hook for reading detected agents. All components/hooks that
 * need `/api/agents` data must consume this instead of calling
 * `ipcBridge.acpConversation.getAvailableAgents.invoke()` directly —
 * SWR's cross-component de-dup only works when every subscriber shares the
 * same `DETECTED_AGENTS_SWR_KEY`.
 */
export const useAgents = (): UseAgentsResult => {
  const { data, isLoading, error } = useSWR<AgentMetadata[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);

  return {
    agents: data ?? [],
    isLoading,
    error,
    revalidate: () => mutate<AgentMetadata[]>(DETECTED_AGENTS_SWR_KEY),
    refreshCustomAgents: async () => {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await mutate(DETECTED_AGENTS_SWR_KEY);
    },
  };
};

/**
 * Hook for the Agent settings management surface only. Reads the
 * `include_disabled=true` view (`MANAGED_AGENTS_SWR_KEY`) so user-disabled
 * custom agents stay listed with a working re-enable toggle.
 *
 * Its `revalidate` refreshes **both** the management key and the shared
 * `DETECTED_AGENTS_SWR_KEY`, so toggling an agent on/off in settings is
 * immediately reflected in every picker (which reads the detected key).
 * Do not use this anywhere other than `AgentSettings` — pickers must stay
 * on {@link useAgents} to keep disabled agents hidden.
 */
export const useManagedAgents = (): UseAgentsResult => {
  const { data, isLoading, error } = useSWR<AgentMetadata[]>(MANAGED_AGENTS_SWR_KEY, fetchManagedAgents);

  const revalidateBoth = async () => {
    const [managed] = await Promise.all([
      mutate<AgentMetadata[]>(MANAGED_AGENTS_SWR_KEY),
      mutate(DETECTED_AGENTS_SWR_KEY),
    ]);
    return managed;
  };

  return {
    agents: data ?? [],
    isLoading,
    error,
    revalidate: revalidateBoth,
    refreshCustomAgents: async () => {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await revalidateBoth();
    },
  };
};

/**
 * Non-hook entry point — use from plain async functions (e.g. route/action
 * utilities) where `useAgents()` is not allowed. Fetches fresh data and
 * writes the result into the shared SWR cache so every component subscribed
 * via `useAgents()` stays in sync.
 *
 * Note: this call always hits the network. That's fine because the handful
 * of non-React call sites (`createConversationParams`, `teamCreateModelResolver`)
 * only fire on specific user actions, not on every render.
 */
export async function getAgents(): Promise<AgentMetadata[]> {
  const data = await fetchDetectedAgents();
  await mutate(DETECTED_AGENTS_SWR_KEY, data, { revalidate: false });
  return data;
}

/**
 * Non-hook entry point to trigger a backend re-scan (`POST /api/agents/refresh`)
 * and revalidate the shared cache. Safe to call from plain async code.
 */
export async function refreshAgents(): Promise<void> {
  await ipcBridge.acpConversation.refreshCustomAgents.invoke();
  await mutate(DETECTED_AGENTS_SWR_KEY);
}
