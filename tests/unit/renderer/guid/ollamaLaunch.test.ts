/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOllamaLaunchExtra,
  OLLAMA_GENERATE_ENDPOINT,
  parseOllamaTagsResponse,
  warmUpOllamaModel,
} from '@/renderer/pages/guid/utils/ollamaLaunch';

describe('buildOllamaLaunchExtra', () => {
  it('returns the ollama extra fragment when a model is selected', () => {
    expect(buildOllamaLaunchExtra('qwen3:14b')).toEqual({
      use_ollama: true,
      ollama_model: 'qwen3:14b',
    });
  });

  it('trims surrounding whitespace from the model name', () => {
    expect(buildOllamaLaunchExtra('  llama3.2:latest ')).toEqual({
      use_ollama: true,
      ollama_model: 'llama3.2:latest',
    });
  });

  it('returns undefined when disabled (null model)', () => {
    expect(buildOllamaLaunchExtra(null)).toBeUndefined();
  });

  it('never emits use_ollama without a model (backend would silently fall back)', () => {
    expect(buildOllamaLaunchExtra('')).toBeUndefined();
    expect(buildOllamaLaunchExtra('   ')).toBeUndefined();
  });

  it('spreads into a conversation extra payload without leftover keys when disabled', () => {
    const extra = { workspace: '/tmp', ...buildOllamaLaunchExtra(null) };
    expect(extra).toEqual({ workspace: '/tmp' });
  });
});

describe('parseOllamaTagsResponse', () => {
  it('extracts model names from a /api/tags response', () => {
    const payload = {
      models: [{ name: 'qwen3:14b', size: 1 }, { name: 'llama3.2:latest' }],
    };
    expect(parseOllamaTagsResponse(payload)).toEqual(['qwen3:14b', 'llama3.2:latest']);
  });

  it('skips entries without a usable name', () => {
    const payload = {
      models: [{ name: 'qwen3:14b' }, { name: '' }, { size: 2 }, null, 'oops'],
    };
    expect(parseOllamaTagsResponse(payload)).toEqual(['qwen3:14b']);
  });

  it('returns an empty list for unexpected shapes', () => {
    expect(parseOllamaTagsResponse(null)).toEqual([]);
    expect(parseOllamaTagsResponse(undefined)).toEqual([]);
    expect(parseOllamaTagsResponse('nope')).toEqual([]);
    expect(parseOllamaTagsResponse({})).toEqual([]);
    expect(parseOllamaTagsResponse({ models: 'nope' })).toEqual([]);
  });
});

describe('warmUpOllamaModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the local Ollama server to pre-load the model (no prompt)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await warmUpOllamaModel('qwen3:14b');

    expect(fetchMock).toHaveBeenCalledWith(OLLAMA_GENERATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3:14b', keep_alive: '10m' }),
    });
  });

  it('does nothing for an empty selection', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await warmUpOllamaModel('   ');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows network failures (best effort only)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(warmUpOllamaModel('qwen3:14b')).resolves.toBeUndefined();
  });
});
