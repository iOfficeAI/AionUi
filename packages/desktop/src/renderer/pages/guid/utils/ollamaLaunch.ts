/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ollama Launch helpers for the Guid page.
 *
 * `ollama launch <agent>` (Ollama v0.15+) runs a compatible ACP agent against
 * local Ollama models, so no provider API key is needed. The backend exposes
 * `ollama_compatible` per agent and consumes `use_ollama` + `ollama_model`
 * from the conversation `extra` payload.
 */

/** Local Ollama HTTP API endpoint listing pulled models (`ollama list`). */
export const OLLAMA_TAGS_ENDPOINT = 'http://127.0.0.1:11434/api/tags';

/** Local Ollama HTTP API endpoint used to pre-load a model into memory. */
export const OLLAMA_GENERATE_ENDPOINT = 'http://127.0.0.1:11434/api/generate';

/** Human-readable host shown in the empty-state hint so users know where
 *  model discovery looked (Ollama's default bind address). */
export const OLLAMA_HOST_LABEL = '127.0.0.1:11434';

/** Extra payload fragment that opts a conversation into Ollama Launch. */
export type OllamaLaunchExtra = {
  use_ollama: true;
  ollama_model: string;
};

/**
 * Build the conversation-extra fragment for Ollama Launch.
 *
 * Returns `undefined` when no model is selected: the backend requires an
 * explicit `ollama_model` for headless `ollama launch --model` and would
 * silently fall back to the native launch otherwise, so we never send
 * `use_ollama` without a model.
 */
export function buildOllamaLaunchExtra(ollamaModel: string | null): OllamaLaunchExtra | undefined {
  const trimmed = ollamaModel?.trim();
  if (!trimmed) return undefined;
  return { use_ollama: true, ollama_model: trimmed };
}

/**
 * Parse the `/api/tags` response from the local Ollama server into a list of
 * model names. Tolerates unexpected shapes by returning an empty list.
 */
export function parseOllamaTagsResponse(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const models = (payload as { models?: unknown }).models;
  if (!Array.isArray(models)) return [];
  const names: string[] = [];
  for (const model of models) {
    if (!model || typeof model !== 'object') continue;
    const name = (model as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim().length > 0) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Pre-load the selected model into Ollama's memory (fire-and-forget).
 *
 * Per the Ollama API docs, a `/api/generate` call without a prompt only
 * loads the model. Warming on selection means the model is already resident
 * when the spawned agent sends its first request, instead of paying the
 * cold-load cost on the user's first message. Failures are swallowed — the
 * launch path loads the model on demand anyway; this is purely an
 * optimisation.
 */
export async function warmUpOllamaModel(ollamaModel: string): Promise<void> {
  const extra = buildOllamaLaunchExtra(ollamaModel);
  if (!extra) return;
  try {
    await fetch(OLLAMA_GENERATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: extra.ollama_model, keep_alive: '10m' }),
    });
  } catch {
    // Best effort only: the agent's first request will load the model instead.
  }
}
