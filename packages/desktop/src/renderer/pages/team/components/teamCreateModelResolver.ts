/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import { getAgents } from '@/renderer/hooks/agent/useAgents';

/**
 * Resolve the `model` value a team agent should send to `POST /api/teams`.
 *
 * Backend `service.rs` consumes `input.model` verbatim with no default, so an
 * empty or backend-name-only value (e.g. "gemini") ends up persisted as
 * `use_model: null`. Downstream, GeminiSendBox / AionrsSendBox gate the
 * textarea on `current_model?.useModel` and render disabled. See mnemo #297.
 *
 * This resolver reads the user's configured default model for provider-based
 * agents (gemini / aionrs) from ConfigStorage and falls back to a sensible
 * CLI default when no preference is set.
 *
 * For ACP backends (claude, codex, acp) the model is resolved from the
 * agent's handshake data or cached model info so the backend receives a
 * valid model ID (e.g. "claude-sonnet-4-5-20250514") instead of the bare
 * backend name.
 */
export async function resolveDefaultTeamAgentModel(params: {
  agent_type: string;
  conversation_type: string;
}): Promise<string> {
  const { agent_type, conversation_type } = params;

  if (conversation_type === 'gemini' || agent_type === 'gemini') {
    return resolveGeminiDefaultModel();
  }

  if (conversation_type === 'aionrs' || agent_type === 'aionrs') {
    return resolveAionrsDefaultModel();
  }

  return resolveAcpDefaultModel(agent_type);
}

async function resolveAcpDefaultModel(agent_type: string): Promise<string> {
  // 1. Try handshake data from /api/agents
  try {
    const agents = await getAgents();
    const matched = agents.find((a) => (a.backend ?? a.agent_type) === agent_type);
    const handshakeModels = matched?.handshake?.available_models as AcpModelInfo | undefined;
    if (handshakeModels?.current_model_id) {
      return handshakeModels.current_model_id;
    }
  } catch {
    // Fall through to cached models
  }

  return 'default';
}

async function resolveGeminiDefaultModel(): Promise<string> {
  // The legacy 'gemini.defaultModel' config key has been removed after the
  // Gemini → ACP consolidation. Always fall back to the 'auto' alias.
  // aioncli-core alias: 'auto' maps to PREVIEW_GEMINI_MODEL_AUTO. See
  // src/common/utils/geminiModes.ts for the full list of aliases.
  return 'auto';
}

async function resolveAionrsDefaultModel(): Promise<string> {
  const saved = configService.get('aionrs.defaultModel');
  if (saved && typeof saved === 'object' && typeof saved.use_model === 'string' && saved.use_model.length > 0) {
    return saved.use_model;
  }
  return 'default';
}
