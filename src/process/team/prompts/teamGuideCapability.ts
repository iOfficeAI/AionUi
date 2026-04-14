/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isTeamCapableBackend } from '@/common/types/teamTypes.ts';
import { ProcessConfig } from '@process/utils/initStorage.ts';

/**
 * Returns true if the given agent backend should receive the team guide prompt injection.
 * Checks cached ACP initialize results — agents with mcpCapabilities.stdio are team-capable.
 * Gemini is always team-capable (non-ACP protocol).
 *
 * Separated from teamGuidePrompt.ts to avoid pulling ProcessConfig (and its
 * transitive database dependencies) into the standalone MCP stdio bundle.
 */
export async function shouldInjectTeamGuideMcp(backend: string): Promise<boolean> {
  const cachedInitResults = await ProcessConfig.get('acp.cachedInitializeResult');
  return isTeamCapableBackend(backend, cachedInitResults);
}
