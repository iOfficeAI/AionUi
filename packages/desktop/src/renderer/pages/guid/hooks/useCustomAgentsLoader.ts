/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { useAgents } from '@/renderer/hooks/agent/useAgents';
import { useCallback, useMemo } from 'react';
import useSWR from 'swr';

type UseCustomAgentsLoaderOptions = {
  /**
   * Ids of ACP custom agents detected as installed/available. Used to filter
   * results from `ipcBridge.acpConversation.getAvailableAgents`
   * (filtered by `agent_source === 'custom'`) down to engine configs whose CLI
   * actually resolves on this machine.
   */
  availableCustomAgentIds: Set<string>;
};

type UseCustomAgentsLoaderResult = {
  /**
   * Preset assistant catalog returned by the backend — merged builtin + user +
   * extension, already sorted. This is the list the Guid pill bar and the
   * Settings list render.
   */
  assistants: Assistant[];
  /**
   * User-defined ACP custom agent rows fetched from
   * `ipcBridge.acpConversation.getAvailableAgents` (filtered by
   * `agent_source === 'custom'`). Completely separate from `assistants`. Only
   * entries whose ids also appear in `availableCustomAgentIds` are returned —
   * we hide configs whose CLI is missing from PATH.
   */
  customAgents: AgentMetadata[];
  /**
   * Merged id → avatar lookup for the `@` mention dropdown, which iterates
   * detected CLI agents (including ACP customs) and needs to resolve avatars
   * from either source.
   */
  customAgentAvatarMap: Map<string, string | undefined>;
  refreshCustomAgents: () => Promise<void>;
};

/**
 * Loads the two distinct assistant-shaped data sources that the Guid page
 * consumes. These two lists are intentionally kept separate by type:
 *
 *   - `assistants: Assistant[]` — the backend-merged preset catalog
 *     (`GET /api/assistants`). This is the single source of truth for
 *     "what to render in the AssistantSelectionArea pill bar" and what the
 *     editor drawer edits.
 *   - `customAgents: AgentMetadata[]` — user-defined ACP engine rows
 *     derived from the shared `useAgents()` SWR cache (filtered by
 *     `agent_source === 'custom'`) because they describe a CLI binary to
 *     spawn, not a prompt-only preset.
 *
 * Conflating these two as a single `customAgents` list used to be a frequent
 * source of bugs (the name hid which of the two a call site actually needed).
 */
export const useCustomAgentsLoader = ({
  availableCustomAgentIds,
}: UseCustomAgentsLoaderOptions): UseCustomAgentsLoaderResult => {
  // Preset assistants share their own cache so settings / guid / conversation
  // all see the same list without duplicate HTTP calls.
  const { data: assistantList } = useSWR('assistants.list', async () => {
    try {
      return await ipcBridge.assistants.list.invoke();
    } catch (error) {
      console.error('Failed to load assistants:', error);
      return [] as Assistant[];
    }
  });
  const assistants = assistantList ?? [];

  // Execution-engine rows come from the shared agents cache — every subscriber
  // (guid / conversation / settings / channels / MCP flows) reads through the
  // same `DETECTED_AGENTS_SWR_KEY` so we make at most one network request.
  const { agents, revalidate } = useAgents();
  const customAgents = useMemo(
    () => agents.filter((a) => a.agent_source === 'custom' && availableCustomAgentIds.has(a.id)),
    [agents, availableCustomAgentIds]
  );

  const customAgentAvatarMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const assistant of assistants) {
      map.set(assistant.id, assistant.avatar);
    }
    for (const agent of customAgents) {
      map.set(agent.id, agent.icon);
    }
    return map;
  }, [assistants, customAgents]);

  // Explicit refresh — used by "switch preset agent type" and the settings
  // refresh button. Not triggered on mount; we rely on the backend's hydration
  // + SWR's revalidate-on-focus to keep the list fresh without the old
  // `useEffect → POST /refresh` loop that fired on every GuidPage mount.
  const refreshCustomAgents = useCallback(async () => {
    try {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
    } catch (error) {
      console.error('Failed to refresh custom agents:', error);
    }
    await revalidate();
  }, [revalidate]);

  return {
    assistants,
    customAgents,
    customAgentAvatarMap,
    refreshCustomAgents,
  };
};
