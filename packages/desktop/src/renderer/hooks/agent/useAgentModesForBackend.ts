/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAgentModes, type AgentModeOption } from '@/renderer/utils/model/agentModes';

/**
 * Resolves the available runtime modes for a backend without consuming
 * `/api/agents`. Business surfaces should use assistant or live
 * conversation state, not agent catalog metadata, so this hook only exposes
 * the static backend fallback used before runtime config is observed.
 */
export const useAgentModesForBackend = (backend?: string): AgentModeOption[] => getAgentModes(backend);
