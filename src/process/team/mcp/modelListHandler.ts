/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared handler for listing available models.
 * Used by both TeamMcpServer (team_list_models) and TeamGuideMcpServer (aion_list_models).
 */

import { getTeamAvailableModels } from '@/common/utils/teamModelUtils';
import { ProcessConfig } from '@process/utils/initStorage';
import { getMergedModelProviders } from '@process/bridge/modelBridge';
import { hasGeminiOauthCreds } from '../googleAuthCheck';
import { teamAgentCatalog } from '../TeamAgentCatalog';

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

  // List models for all team-capable backends via the unified catalog.
  // Dedup by backend so presets sharing a backend don't produce duplicate
  // sections (the catalog returns one entry per source, which is right for
  // spawn dispatch but wrong for a model-list view).
  const capable = await teamAgentCatalog.listTeamCapable();
  const byBackend = new Map<string, { backend: string; displayName: string }>();
  for (const e of capable) {
    if (e.source === 'preset') continue;
    if (!byBackend.has(e.backend)) byBackend.set(e.backend, { backend: e.backend, displayName: e.displayName });
  }

  if (byBackend.size === 0) {
    return 'No team-capable agent types detected.';
  }

  const sections = Array.from(byBackend.values()).map((a) => {
    const models = getTeamAvailableModels(a.backend, cachedModels, providers, isGoogleAuth);
    const modelLines = models.length > 0 ? models.map((m) => `  - ${m.id}`).join('\n') : '  (no models available)';
    return `### ${a.displayName} (\`${a.backend}\`)\n${modelLines}`;
  });

  return `## Available Models by Agent Type\n\n${sections.join('\n\n')}`;
}
