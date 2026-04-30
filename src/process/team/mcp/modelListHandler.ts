/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared handler for listing available models.
 * Used by both TeamMcpServer (team_list_models) and TeamGuideMcpServer (aion_list_models).
 */

import { ipcBridge } from '@/common';
import { isTeamCapableBackend } from '@/common/types/teamTypes';
import { getTeamAvailableModels } from '@/common/utils/teamModelUtils';
import type { IProvider } from '@/common/config/storage';
import { ProcessConfig } from '@process/utils/initStorage';
import { hasGeminiOauthCreds } from '../googleAuthCheck';
import { agentRegistry } from '@process/agent/AgentRegistry';
import { v4 as uuid } from 'uuid';

async function getMergedModelProviders(): Promise<IProvider[]> {
  try {
    const data = await ipcBridge.mode.listProviders.invoke();
    const sourceList = Array.isArray(data) ? data : [];
    return sourceList.map((v) => ({
      ...v,
      id: v.id || uuid(),
    }));
  } catch {
    return [];
  }
}

export async function handleListModels(args: Record<string, unknown>): Promise<string> {
  const agent_type = args.agent_type ? String(args.agent_type) : undefined;

  const [cachedModels, providers, isGoogleAuth] = await Promise.all([
    ProcessConfig.get('acp.cachedModels'),
    getMergedModelProviders(),
    hasGeminiOauthCreds(),
  ]);

  if (agent_type) {
    const models = getTeamAvailableModels(agent_type, cachedModels, providers, isGoogleAuth);
    if (models.length === 0) {
      return `No models available for agent type "${agent_type}".`;
    }
    return `## Models for ${agent_type}\n${models.map((m) => `- ${m.id}`).join('\n')}`;
  }

  // List models for all team-capable backends
  // TODO(extension-migration-followup): replace this shim-backed sync lookup
  // with ipcBridge.agent.getDetectedAgents.invoke().
  const cachedInitResults = await ProcessConfig.get('acp.cachedInitializeResult');
  const detectedAgents = agentRegistry
    .getDetectedAgents()
    .filter((a) => isTeamCapableBackend(a.backend, cachedInitResults));

  if (detectedAgents.length === 0) {
    return 'No team-capable agent types detected.';
  }

  const sections = detectedAgents.map((a) => {
    const models = getTeamAvailableModels(a.backend, cachedModels, providers, isGoogleAuth);
    const modelLines = models.length > 0 ? models.map((m) => `  - ${m.id}`).join('\n') : '  (no models available)';
    return `### ${a.name} (\`${a.backend}\`)\n${modelLines}`;
  });

  return `## Available Models by Agent Type\n\n${sections.join('\n\n')}`;
}
