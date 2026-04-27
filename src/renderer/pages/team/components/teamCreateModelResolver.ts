/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage } from '@/common/config/storage';

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
 * For ACP backends (claude, codex, acp) the model selection happens inside
 * the ACP init flow and the backend ignores the field; we still pass a
 * non-empty string to avoid triggering empty-value paths.
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

  // ACP / claude / codex / openclaw / nanobot / remote — backend picks its own
  // model via the ACP init flow. Pass the agent_type so the field is non-empty;
  // backend still records it as the model string but it is not used for
  // sendbox-gating on those platforms (ACP sendbox hardcodes disabled={false}).
  return agent_type || 'default';
}

async function resolveGeminiDefaultModel(): Promise<string> {
  // The legacy 'gemini.defaultModel' config key has been removed after the
  // Gemini → ACP consolidation. Always fall back to the 'auto' alias.
  // aioncli-core alias: 'auto' maps to PREVIEW_GEMINI_MODEL_AUTO. See
  // src/common/utils/geminiModes.ts for the full list of aliases.
  return 'auto';
}

async function resolveAionrsDefaultModel(): Promise<string> {
  const saved = await ConfigStorage.get('aionrs.defaultModel').catch((): undefined => undefined);
  if (saved && typeof saved === 'object' && typeof saved.use_model === 'string' && saved.use_model.length > 0) {
    return saved.use_model;
  }
  return 'default';
}
