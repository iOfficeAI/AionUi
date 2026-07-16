/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildOllamaLaunchExtra, parseOllamaTagsResponse } from '@/renderer/pages/guid/utils/ollamaLaunch';

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
