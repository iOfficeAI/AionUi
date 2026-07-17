/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOllamaLaunchExtra,
  getOllamaModelWarning,
  OLLAMA_GENERATE_ENDPOINT,
  parseOllamaShowResponse,
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

describe('parseOllamaShowResponse', () => {
  it('prefers the Modelfile num_ctx pin over the architecture maximum', () => {
    // Real-world case: juithealian404/MiniCPM5-1B pins num_ctx to 8192 even
    // though the architecture supports 131072 — Ollama loads it with 8192.
    const payload = {
      parameters: 'temperature 0.7\nnum_ctx                        8192\nstop "<|user|>"',
      model_info: { 'llama.context_length': 131072 },
      capabilities: ['tools', 'thinking', 'completion'],
    };
    expect(parseOllamaShowResponse('minicpm', payload)).toEqual({
      name: 'minicpm',
      effectiveContext: 8192,
      supportsTools: true,
    });
  });

  it('falls back to the architecture context length without a num_ctx pin', () => {
    const payload = {
      parameters: 'temperature 0.7',
      model_info: { 'qwen2.context_length': 32768 },
      capabilities: ['completion'],
    };
    expect(parseOllamaShowResponse('qwen2.5-coder:7b', payload)).toEqual({
      name: 'qwen2.5-coder:7b',
      effectiveContext: 32768,
      supportsTools: false,
    });
  });

  it('returns unknown (null) fields for unexpected shapes', () => {
    expect(parseOllamaShowResponse('m', null)).toEqual({ name: 'm', effectiveContext: null, supportsTools: null });
    expect(parseOllamaShowResponse('m', 'nope')).toEqual({ name: 'm', effectiveContext: null, supportsTools: null });
    expect(parseOllamaShowResponse('m', {})).toEqual({ name: 'm', effectiveContext: null, supportsTools: null });
    expect(parseOllamaShowResponse('m', { parameters: 42, model_info: 'x', capabilities: 'y' })).toEqual({
      name: 'm',
      effectiveContext: null,
      supportsTools: null,
    });
  });
});

describe('getOllamaModelWarning', () => {
  it('warns when the effective context is below the claude minimum', () => {
    // Claude Code's system prompt alone is ~19.5k tokens: an 8192-token
    // model deterministically fails with exceed_context_size_error.
    const warning = getOllamaModelWarning('claude', { name: 'm', effectiveContext: 8192, supportsTools: true });
    expect(warning).toEqual({ kind: 'context', effectiveContext: 8192, minContext: 32768 });
  });

  it('warns when the model lacks tool support required by claude', () => {
    const warning = getOllamaModelWarning('claude', { name: 'm', effectiveContext: 131072, supportsTools: false });
    expect(warning).toEqual({ kind: 'tools' });
  });

  it('accepts a model meeting all claude requirements', () => {
    expect(getOllamaModelWarning('claude', { name: 'm', effectiveContext: 32768, supportsTools: true })).toBeNull();
  });

  it('never warns on unknown metadata (no false positives)', () => {
    expect(getOllamaModelWarning('claude', { name: 'm', effectiveContext: null, supportsTools: null })).toBeNull();
  });

  it('has no requirements for backends without a verified profile', () => {
    expect(getOllamaModelWarning('gemini', { name: 'm', effectiveContext: 1024, supportsTools: false })).toBeNull();
  });

  it('applies the lighter qwen profile (compact system prompt)', () => {
    expect(getOllamaModelWarning('qwen', { name: 'm', effectiveContext: 8192, supportsTools: true })).toBeNull();
    expect(getOllamaModelWarning('qwen', { name: 'm', effectiveContext: 4096, supportsTools: true })).toEqual({
      kind: 'context',
      effectiveContext: 4096,
      minContext: 8192,
    });
    expect(getOllamaModelWarning('qwen', { name: 'm', effectiveContext: 32768, supportsTools: false })).toEqual({
      kind: 'tools',
    });
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
