/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DetectedAgent } from '@/common/types/detectedAgent';

/**
 * Minimal compatibility shim kept until Team/MCP consumers finish migrating
 * to backend-owned detected agents.
 */
class AgentRegistry {
  // TODO(extension-migration-followup): replace synchronous Team/MCP consumers
  // with ipcBridge.agent.getDetectedAgents.invoke() and delete this shim.
  async initialize(): Promise<void> {}

  getDetectedAgents(): DetectedAgent[] {
    return [];
  }
}

export const agentRegistry = new AgentRegistry();
