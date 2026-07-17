/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOllamaLocalModelDetails } from '@/renderer/pages/guid/hooks/useOllamaLocalModels';
import { OLLAMA_SHOW_ENDPOINT, OLLAMA_TAGS_ENDPOINT } from '@/renderer/pages/guid/utils/ollamaLaunch';

/** fetch stub routing /api/tags and per-model /api/show responses. */
const stubOllamaApi = (tags: unknown, showByModel: Record<string, unknown> = {}) => {
  const fetchMock = vi.fn().mockImplementation((endpoint: string, init?: RequestInit) => {
    if (endpoint === OLLAMA_TAGS_ENDPOINT) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(tags) });
    }
    if (endpoint === OLLAMA_SHOW_ENDPOINT) {
      const { model } = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
      const payload = model !== undefined ? showByModel[model] : undefined;
      if (payload === undefined) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
    }
    return Promise.reject(new TypeError(`Unexpected endpoint: ${endpoint}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('fetchOllamaLocalModelDetails', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves models with compatibility metadata from /api/tags + /api/show', async () => {
    stubOllamaApi(
      { models: [{ name: 'minicpm:1b' }, { name: 'qwen2.5-coder:7b' }] },
      {
        'minicpm:1b': {
          parameters: 'num_ctx                        8192',
          model_info: { 'llama.context_length': 131072 },
          capabilities: ['tools'],
        },
        'qwen2.5-coder:7b': {
          model_info: { 'qwen2.context_length': 32768 },
          capabilities: ['tools', 'completion'],
        },
      }
    );

    await expect(fetchOllamaLocalModelDetails()).resolves.toEqual([
      { name: 'minicpm:1b', effectiveContext: 8192, supportsTools: true },
      { name: 'qwen2.5-coder:7b', effectiveContext: 32768, supportsTools: true },
    ]);
  });

  it('degrades a failed /api/show lookup to unknown metadata (no warning)', async () => {
    stubOllamaApi({ models: [{ name: 'mystery:latest' }] }, {});

    await expect(fetchOllamaLocalModelDetails()).resolves.toEqual([
      { name: 'mystery:latest', effectiveContext: null, supportsTools: null },
    ]);
  });

  it('resolves an empty list on non-OK tag responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));

    await expect(fetchOllamaLocalModelDetails()).resolves.toEqual([]);
  });

  it('resolves an empty list when Ollama is not reachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(fetchOllamaLocalModelDetails()).resolves.toEqual([]);
  });

  it('resolves an empty list on malformed tag payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ models: 'nope' }) }));

    await expect(fetchOllamaLocalModelDetails()).resolves.toEqual([]);
  });
});
