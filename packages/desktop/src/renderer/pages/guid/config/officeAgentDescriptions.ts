/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AvailableAgent } from '../types';

export function getOfficeAgentDescriptionSlug(agent: AvailableAgent): string {
  if (agent.agent_source === 'custom' || agent.agent_type === 'remote') {
    return 'custom';
  }
  return agent.backend || agent.agent_type;
}

export function getOfficeAgentDescriptionKey(agent: AvailableAgent): string {
  return `guid.office.agents.descriptions.${getOfficeAgentDescriptionSlug(agent)}`;
}
