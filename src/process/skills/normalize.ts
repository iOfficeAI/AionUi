/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AssistantSkillConfig } from './types';

/**
 * Normalize skill configuration from conversation extras.
 *
 * Handles both the new `skillConfig` format (Phase 2+) and the legacy
 * `enabledSkills` array format. This allows ConversationServiceImpl and
 * agent managers to read conversations created before and after the
 * skill-system redesign.
 *
 * @param extra - Conversation extra fields (may contain either format)
 * @returns Normalized AssistantSkillConfig with `added` and `blocked` arrays
 */
export function normalizeSkillConfig(extra: Record<string, unknown>): AssistantSkillConfig {
  // New format: { skillConfig: { added: string[], blocked: string[] } }
  if (extra.skillConfig && typeof extra.skillConfig === 'object') {
    const config = extra.skillConfig as Record<string, unknown>;
    const added = Array.isArray(config.added) ? (config.added as string[]) : [];
    const blocked = Array.isArray(config.blocked) ? (config.blocked as string[]) : [];
    return { added, blocked };
  }

  // Legacy format: { enabledSkills: string[] }
  if (Array.isArray(extra.enabledSkills)) {
    return { added: extra.enabledSkills as string[], blocked: [] };
  }

  // No skill config present
  return { added: [], blocked: [] };
}
