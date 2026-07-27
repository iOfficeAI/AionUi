/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { assistantRuntimeKey } from '@/common/types/agent/assistantTypes';
import { resolveLocaleKey } from '@/common/utils';
import { fetchAgentLogos, resolveAgentLogo, type AgentLogoMap } from '@/renderer/utils/model/agentLogo';
import { resolveAssistantAvatar } from '@/renderer/utils/model/assistantAvatar';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** A local AI tool (CLI backend) surfaced on page 1 (scan). */
export type ScannedTool = {
  backend: string;
  name: string;
  version?: string;
  installed: boolean;
  builtin: boolean;
  logo: string | null;
};

/** A specialist assistant surfaced on pages 2 & 3, with a real avatar. */
export type OnboardingAssistant = {
  id: string;
  name: string;
  backend: string;
  avatar: { kind: 'image' | 'emoji' | 'fallback'; value?: string };
};

export type OnboardingData = {
  loading: boolean;
  /** Local tools resolved on `$PATH` (installed) plus the built-in AionCLI. */
  tools: ScannedTool[];
  /** True when at least one external (non-builtin) tool was detected. */
  hasExternalTools: boolean;
  /** Built-in specialist assistants with real avatars (for the derive page). */
  assistants: OnboardingAssistant[];
  logos: AgentLogoMap;
  resolveLogo: (backend: string) => string | null;
};

const BUILTIN_BACKEND = 'aionrs';

/**
 * One-shot loader for everything the opening guide renders from real data:
 * the locally-scanned AI tools (`/api/agents/management`), the assistant
 * catalog (`/api/assistants`), and the agent logo map (`/api/agents/logos`).
 *
 * Pure renderer-layer consumption of existing backend APIs — no aionCore
 * changes. Failures degrade gracefully to empty lists so the guide still runs.
 */
export const useOnboardingData = (): OnboardingData => {
  const { i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n.language);
  const [loading, setLoading] = useState(true);
  const [tools, setTools] = useState<ScannedTool[]>([]);
  const [assistants, setAssistants] = useState<OnboardingAssistant[]>([]);
  const [logos, setLogos] = useState<AgentLogoMap>({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [logoMap, managed, assistantList] = await Promise.all([
        fetchAgentLogos().catch((): AgentLogoMap => ({})),
        ipcBridge.acpConversation.getManagedAgents.invoke().catch((): ManagedAgent[] => []),
        ipcBridge.assistants.list.invoke().catch((): Assistant[] => []),
      ]);
      if (cancelled) return;

      setLogos(logoMap);

      // QA switch: append `#/guid?onboardingEmpty=1` (hash router) to preview
      // the "no external tools detected" branch without uninstalling CLIs.
      const emptyPreview = typeof window !== 'undefined' && window.location.hash.includes('onboardingEmpty=1');

      // Tools: built-in AionCLI is always present; external tools are the ones
      // the backend resolved on $PATH (installed/available).
      const scanned: ScannedTool[] = [];
      const builtinRow = managed.find((agent) => agent.backend === BUILTIN_BACKEND || agent.agent_type === 'aionrs');
      scanned.push({
        backend: BUILTIN_BACKEND,
        name: builtinRow?.name || 'AionCLI',
        installed: true,
        builtin: true,
        logo: resolveAgentLogo(logoMap, { backend: BUILTIN_BACKEND, icon: builtinRow?.icon }),
      });
      // Dedupe by backend (falls back to name): the management catalog can
      // surface the same tool twice (e.g. builtin + detected rows).
      const seen = new Set<string>([BUILTIN_BACKEND]);
      for (const agent of emptyPreview ? [] : managed) {
        const isBuiltin = agent.backend === BUILTIN_BACKEND || agent.agent_type === 'aionrs';
        if (isBuiltin) continue;
        if (!agent.installed) continue;
        const key = (agent.backend || agent.name || agent.id).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        scanned.push({
          backend: agent.backend || agent.id,
          name: agent.name,
          version: agent.agent_source_info?.version,
          installed: true,
          builtin: false,
          logo: resolveAgentLogo(logoMap, {
            backend: agent.backend,
            icon: agent.icon,
            custom_agent_id: agent.custom_agent_id,
            isExtension: agent.isExtension,
          }),
        });
      }
      setTools(scanned);

      // Assistants: built-in specialists with real (image) avatars first, so the
      // derive page shows humanized faces rather than emoji fallbacks.
      const mapped: OnboardingAssistant[] = assistantList
        .filter((a) => a.enabled !== false)
        .map((a) => ({
          id: a.id,
          name: a.name_i18n?.[localeKey] || a.name,
          backend: assistantRuntimeKey(a),
          avatar: resolveAssistantAvatar(a.avatar),
        }));
      setAssistants(mapped);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [localeKey]);

  const resolveLogo = useCallback((backend: string) => resolveAgentLogo(logos, { backend }), [logos]);

  const hasExternalTools = tools.some((t) => !t.builtin);

  return { loading, tools, hasExternalTools, assistants, logos, resolveLogo };
};
