/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type { Assistant } from '@/common/types/assistantTypes';
import type { AcpBackendConfig } from '../types';
import { DETECTED_AGENTS_SWR_KEY } from '@/renderer/utils/model/agentTypes';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { mutate } from 'swr';

type UseCustomAgentsLoaderOptions = {
  /**
   * Ids of ACP custom agents detected as installed/available. Used to filter
   * `ConfigStorage.get('acp.customAgents')` down to engine configs whose CLI
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
   * User-defined ACP custom agent ENGINE configs from
   * `ConfigStorage.get('acp.customAgents')` (CLI path, args, env). Completely
   * separate from `assistants`. Only entries whose ids appear in
   * `availableCustomAgentIds` are returned — we hide configs whose CLI is
   * missing from PATH.
   */
  customAgents: AcpBackendConfig[];
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
 *   - `customAgents: AcpBackendConfig[]` — user-defined ACP engine configs
 *     that still live in `ConfigStorage.get('acp.customAgents')` because
 *     they describe a CLI binary to spawn, not a prompt-only preset.
 *
 * Conflating these two as a single `customAgents: AcpBackendConfig[]` used
 * to be a frequent source of bugs (the name hid which of the two a call
 * site actually needed).
 */
export const useCustomAgentsLoader = ({
  availableCustomAgentIds,
}: UseCustomAgentsLoaderOptions): UseCustomAgentsLoaderResult => {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [customAgents, setCustomAgents] = useState<AcpBackendConfig[]>([]);

  const customAgentAvatarMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const assistant of assistants) {
      map.set(assistant.id, assistant.avatar);
    }
    for (const agent of customAgents) {
      map.set(agent.id, agent.avatar);
    }
    return map;
  }, [assistants, customAgents]);

  const loadCustomAgents = useCallback(async () => {
    try {
      const [assistantList, userCustomAgents] = await Promise.all([
        ipcBridge.assistants.list.invoke().catch(() => [] as Assistant[]),
        ConfigStorage.get('acp.customAgents'),
      ]);
      setAssistants(assistantList);
      const filteredCustoms = ((userCustomAgents || []) as AcpBackendConfig[]).filter((a) =>
        availableCustomAgentIds.has(a.id),
      );
      setCustomAgents(filteredCustoms);
    } catch (error) {
      console.error('Failed to load assistants/custom agents:', error);
    }
  }, [availableCustomAgentIds]);

  // Initial load
  useEffect(() => {
    void loadCustomAgents();
  }, [loadCustomAgents]);

  const refreshCustomAgents = useCallback(async () => {
    try {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await mutate(DETECTED_AGENTS_SWR_KEY);
    } catch (error) {
      console.error('Failed to refresh custom agents:', error);
    }
    // Re-read backend + ConfigStorage so UI reflects any changes
    // (e.g. presetAgentType switch on an assistant, CLI path edit on a custom).
    await loadCustomAgents();
  }, [loadCustomAgents]);

  useEffect(() => {
    void refreshCustomAgents();
  }, [refreshCustomAgents]);

  return {
    assistants,
    customAgents,
    customAgentAvatarMap,
    refreshCustomAgents,
  };
};
