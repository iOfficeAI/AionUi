/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import useSWR from 'swr';
import { OLLAMA_TAGS_ENDPOINT, parseOllamaTagsResponse } from '../utils/ollamaLaunch';

const OLLAMA_MODELS_SWR_KEY = 'guid.ollama.localModels';
const FETCH_TIMEOUT_MS = 2000;

/**
 * Fetch the model names pulled into the local Ollama instance.
 *
 * Talks directly to the Ollama HTTP API on the local machine, which is why
 * callers must gate `enabled` on the Electron desktop runtime — in remote
 * WebUI sessions the browser host is not where agents are spawned. Any
 * failure (Ollama not installed / not running) resolves to an empty list so
 * the UI can degrade gracefully.
 */
export async function fetchOllamaLocalModels(): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(OLLAMA_TAGS_ENDPOINT, { signal: controller.signal });
    if (!response.ok) return [];
    return parseOllamaTagsResponse(await response.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export type UseOllamaLocalModelsResult = {
  models: string[];
  isLoading: boolean;
};

/**
 * SWR-cached list of local Ollama models for the Guid page Ollama Launch
 * selector. Pass `enabled: false` to skip fetching entirely (agent not
 * Ollama-compatible, or not running in the desktop shell).
 */
export const useOllamaLocalModels = (enabled: boolean): UseOllamaLocalModelsResult => {
  const { data, isLoading } = useSWR<string[]>(enabled ? OLLAMA_MODELS_SWR_KEY : null, fetchOllamaLocalModels, {
    revalidateOnFocus: false,
  });

  return useMemo(
    () => ({
      models: data ?? [],
      isLoading: enabled && isLoading,
    }),
    [data, enabled, isLoading]
  );
};
