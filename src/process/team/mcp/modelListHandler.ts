/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared handler for listing available models.
 * Used by both TeamMcpServer (team_list_models) and TeamGuideMcpServer (aion_list_models).
 */

import { isTeamCapableBackend } from '@/common/types/teamTypes';
import { getTeamAvailableModels } from '@/common/utils/teamModelUtils';
import { ProcessConfig } from '@process/utils/initStorage';
import { getMergedModelProviders } from '@process/bridge/modelBridge';
import { hasGeminiOauthCreds } from '../googleAuthCheck';
import { agentRegistry } from '@process/agent/AgentRegistry';

export async function handleListModels(args: Record<string, unknown>): Promise<string> {
  const agentType = args.agent_type ? String(args.agent_type) : undefined;

  const [cachedModels, providers, isGoogleAuth] = await Promise.all([
    ProcessConfig.get('acp.cachedModels'),
    getMergedModelProviders(),
    hasGeminiOauthCreds(),
  ]);

  if (agentType) {
    const models = getTeamAvailableModels(agentType, cachedModels, providers, isGoogleAuth);
    if (models.length === 0) {
      return `No models available for agent type "${agentType}".`;
    }
    return `## Models for ${agentType}\n${models.map((m) => `- ${m.id}`).join('\n')}`;
  }

  // List models for all team-capable backends
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
