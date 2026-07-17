/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import useSWR from 'swr';
import {
  OLLAMA_SHOW_ENDPOINT,
  OLLAMA_TAGS_ENDPOINT,
  parseOllamaShowResponse,
  parseOllamaTagsResponse,
  type OllamaModelDetails,
} from '../utils/ollamaLaunch';

const OLLAMA_MODELS_SWR_KEY = 'guid.ollama.localModelDetails';
const FETCH_TIMEOUT_MS = 2000;

/**
 * Fetch the models pulled into the local Ollama instance, enriched with the
 * `/api/show` metadata used for agent-compatibility warnings (effective
 * context window, tool-calling capability).
 *
 * Talks directly to the Ollama HTTP API on the local machine, which is why
 * callers must gate `enabled` on the Electron desktop runtime — in remote
 * WebUI sessions the browser host is not where agents are spawned. Any
 * failure degrades gracefully: no Ollama → empty list; a failed `/api/show`
 * lookup → that model is listed with unknown metadata (no warning shown).
 */
export async function fetchOllamaLocalModelDetails(): Promise<OllamaModelDetails[]> {
  const names = await fetchWithTimeout(OLLAMA_TAGS_ENDPOINT, undefined, parseOllamaTagsResponse, []);
  return Promise.all(
    names.map((name) =>
      fetchWithTimeout(
        OLLAMA_SHOW_ENDPOINT,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name }) },
        (payload) => parseOllamaShowResponse(name, payload),
        { name, effectiveContext: null, supportsTools: null }
      )
    )
  );
}

async function fetchWithTimeout<T>(
  endpoint: string,
  init: Omit<RequestInit, 'signal'> | undefined,
  parse: (payload: unknown) => T,
  fallback: T
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, { ...init, signal: controller.signal });
    if (!response.ok) return fallback;
    return parse(await response.json());
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

export type UseOllamaLocalModelsResult = {
  models: OllamaModelDetails[];
  isLoading: boolean;
};

/**
 * SWR-cached list of local Ollama models (with compatibility metadata) for
 * the Guid page Ollama Launch selector. Pass `enabled: false` to skip
 * fetching entirely (agent not Ollama-compatible, or not running in the
 * desktop shell).
 */
export const useOllamaLocalModels = (enabled: boolean): UseOllamaLocalModelsResult => {
  const { data, isLoading } = useSWR<OllamaModelDetails[]>(
    enabled ? OLLAMA_MODELS_SWR_KEY : null,
    fetchOllamaLocalModelDetails,
    {
      revalidateOnFocus: false,
    }
  );

  return useMemo(
    () => ({
      models: data ?? [],
      isLoading: enabled && isLoading,
    }),
    [data, enabled, isLoading]
  );
};
