/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOllamaLocalModels } from '@/renderer/pages/guid/hooks/useOllamaLocalModels';
import { OLLAMA_TAGS_ENDPOINT } from '@/renderer/pages/guid/utils/ollamaLaunch';

describe('fetchOllamaLocalModels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves model names from the local Ollama /api/tags endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: 'qwen3:14b' }, { name: 'llama3.2:latest' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOllamaLocalModels()).resolves.toEqual(['qwen3:14b', 'llama3.2:latest']);
    expect(fetchMock).toHaveBeenCalledWith(
      OLLAMA_TAGS_ENDPOINT,
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('resolves an empty list on non-OK responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));

    await expect(fetchOllamaLocalModels()).resolves.toEqual([]);
  });

  it('resolves an empty list when Ollama is not reachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(fetchOllamaLocalModels()).resolves.toEqual([]);
  });

  it('resolves an empty list on malformed payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ models: 'nope' }) }));

    await expect(fetchOllamaLocalModels()).resolves.toEqual([]);
  });
});
