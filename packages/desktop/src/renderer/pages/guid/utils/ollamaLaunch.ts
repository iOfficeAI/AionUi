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

/** Local Ollama HTTP API endpoint returning per-model metadata (`ollama show`). */
export const OLLAMA_SHOW_ENDPOINT = 'http://127.0.0.1:11434/api/show';

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
 * Per-model metadata relevant to agent compatibility, from `/api/show`.
 *
 * `null` fields mean "unknown" (endpoint variant without that data) and must
 * never produce a warning — only positively-detected problems should.
 */
export type OllamaModelDetails = {
  name: string;
  /** Context window the model will actually load with: the Modelfile
   *  `num_ctx` pin when present, else the architecture's maximum. */
  effectiveContext: number | null;
  /** Whether the model advertises the `tools` capability. */
  supportsTools: boolean | null;
};

/**
 * Minimum local-model requirements per ACP backend, verified empirically.
 *
 * `claude`: the Claude Code system prompt alone is ~19.5k tokens (measured
 * via `@agentclientprotocol/claude-agent-acp` 0.58.1 usage reports), so any
 * model whose effective context is below ~32k fails the very first prompt
 * turn with an Ollama 400 `exceed_context_size_error`. Tool calling is
 * required by the Claude Code tool-use protocol.
 */
export const OLLAMA_AGENT_MODEL_REQUIREMENTS: Record<string, { minContext: number; needsTools: boolean }> = {
  claude: { minContext: 32768, needsTools: true },
};

/** Why a local model is expected to fail with the selected agent. */
export type OllamaModelWarning = { kind: 'context'; effectiveContext: number; minContext: number } | { kind: 'tools' };

/**
 * Parse an `/api/show` response into {@link OllamaModelDetails}.
 *
 * The Modelfile `num_ctx` parameter (a `"num_ctx  8192"` line in the
 * free-form `parameters` string) wins over the architecture maximum
 * (`model_info["<arch>.context_length"]`) because Ollama loads the model
 * with the pinned value. Tolerates unexpected shapes by returning `null`
 * (unknown) fields.
 */
export function parseOllamaShowResponse(name: string, payload: unknown): OllamaModelDetails {
  const details: OllamaModelDetails = { name, effectiveContext: null, supportsTools: null };
  if (!payload || typeof payload !== 'object') return details;
  const body = payload as { parameters?: unknown; model_info?: unknown; capabilities?: unknown };

  if (typeof body.parameters === 'string') {
    const pinned = /^num_ctx\s+(\d+)\s*$/m.exec(body.parameters);
    if (pinned) details.effectiveContext = Number(pinned[1]);
  }
  if (details.effectiveContext === null && body.model_info && typeof body.model_info === 'object') {
    for (const [key, value] of Object.entries(body.model_info)) {
      if (key.endsWith('.context_length') && typeof value === 'number') {
        details.effectiveContext = value;
        break;
      }
    }
  }
  if (Array.isArray(body.capabilities)) {
    details.supportsTools = body.capabilities.includes('tools');
  }
  return details;
}

/**
 * Compatibility warning for running `details` under the `backend` agent,
 * or `null` when the model looks fine (or we simply don't know enough —
 * unknown metadata must not scare users away from working models).
 */
export function getOllamaModelWarning(backend: string, details: OllamaModelDetails): OllamaModelWarning | null {
  const requirements = OLLAMA_AGENT_MODEL_REQUIREMENTS[backend];
  if (!requirements) return null;
  if (requirements.needsTools && details.supportsTools === false) {
    return { kind: 'tools' };
  }
  if (details.effectiveContext !== null && details.effectiveContext < requirements.minContext) {
    return { kind: 'context', effectiveContext: details.effectiveContext, minContext: requirements.minContext };
  }
  return null;
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
