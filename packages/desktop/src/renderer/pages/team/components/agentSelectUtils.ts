/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Team agent select utility functions
 */

interface AgentOption {
  id: string;
  name: string;
  kind?: string;
  backend?: string;
}

/**
 * Get display label for a team agent option.
 * Preset assistants keep their original name; CLI agents are branded.
 */
export function getTeamAgentOptionLabel(option: AgentOption): string {
  if (option.kind === 'cli') {
    return 'POUNDING CLI';
  }
  return option.name;
}
