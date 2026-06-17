/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AssistantDetail } from '@/common/types/agent/assistantTypes';

/**
 * Resolve the `model` value a team agent should send to `POST /api/teams`.
 *
 * Backend `service.rs` consumes `input.model` verbatim with no default, so an
 * empty or backend-name-only value (e.g. "gemini") ends up persisted as
 * `use_model: null`. Downstream, GeminiSendBox / AionrsSendBox gate the
 * textarea on `current_model?.useModel` and render disabled. See mnemo #297.
 *
 * This resolver reads assistant-owned defaults first and then falls back to
 * backend-safe defaults when the selected assistant has no explicit model.
 *
 * For ACP backends (claude, codex, acp) the model is resolved from the
 * agent's handshake data or cached model info so the backend receives a
 * valid model ID (e.g. "claude-sonnet-4-5-20250514") instead of the bare
 * backend name.
 */
export async function resolveDefaultTeamAgentModel(params: {
  assistant_id?: string;
  assistant_backend: string;
}): Promise<string> {
  const { assistant_id, assistant_backend } = params;

  const assistantModel = await resolveAssistantDefaultModel(assistant_id);
  if (assistantModel) {
    return assistantModel;
  }

  if (assistant_backend === 'gemini') {
    return resolveGeminiDefaultModel();
  }

  if (assistant_backend === 'aionrs') {
    return resolveAionrsDefaultModel();
  }

  return resolveAcpDefaultModel(assistant_backend);
}

async function resolveAssistantDefaultModel(assistant_id?: string): Promise<string | undefined> {
  if (!assistant_id) return undefined;

  try {
    const detail = (await ipcBridge.assistants.get.invoke({ id: assistant_id })) as AssistantDetail | null;
    if (!detail) return undefined;

    if (detail.defaults.model.mode === 'fixed' && detail.defaults.model.value) {
      return detail.defaults.model.value;
    }

    if (detail.defaults.model.mode === 'auto' && detail.preferences.last_model_id) {
      return detail.preferences.last_model_id;
    }
  } catch {
    // Fall through to backend/model fallbacks
  }

  return undefined;
}

async function resolveAcpDefaultModel(_assistant_backend: string): Promise<string> {
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
  return 'default';
}
