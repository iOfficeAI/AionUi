/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  groupModelOptions,
  matchesModelSearch,
  parseFavoriteModelKeys,
  serializeFavoriteModelKeys,
  wildcardToRegExp,
  cleanModelLabel,
  extractProviderFromLabel,
  type ModelSelectorOptionBase,
} from '@/renderer/components/agent/modelSelectorUtils';
import { describe, expect, it } from 'vitest';

const options: ModelSelectorOptionBase[] = [
  {
    key: 'anthropic:claude-sonnet-4',
    id: 'claude-sonnet-4',
    label: 'Claude Sonnet 4',
    providerId: 'anthropic',
    providerName: 'Anthropic',
  },
  {
    key: 'openai:gpt-4.1-mini',
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 Mini',
    providerId: 'openai',
    providerName: 'OpenAI',
  },
  {
    key: 'google:gemini-2.5-flash',
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    providerId: 'google',
    providerName: 'Google',
  },
];

describe('model selector filtering', () => {
  it('matches plain text across model and provider fields', () => {
    expect(matchesModelSearch(options[0], 'sonnet')).toBe(true);
    expect(matchesModelSearch(options[1], 'openai')).toBe(true);
    expect(matchesModelSearch(options[2], 'claude')).toBe(false);
  });

  it('supports wildcard searches for separated model tokens', () => {
    expect(wildcardToRegExp('claude*4').test('Claude Sonnet 4')).toBe(true);
    expect(matchesModelSearch(options[1], 'gpt*mini')).toBe(true);
    expect(matchesModelSearch(options[2], 'gemini-?.5*')).toBe(true);
  });

  it('groups matching models by reported provider', () => {
    const groups = groupModelOptions(options, '*i*', 'Models');
    expect(groups.map((group) => group.label)).toEqual(['Anthropic', 'OpenAI', 'Google']);
    expect(groups.map((group) => group.options.map((option) => option.key))).toEqual([
      ['anthropic:claude-sonnet-4'],
      ['openai:gpt-4.1-mini'],
      ['google:gemini-2.5-flash'],
    ]);
  });

  it('falls back safely when favorites storage is malformed', () => {
    expect(parseFavoriteModelKeys('not json')).toEqual([]);
    expect(parseFavoriteModelKeys(JSON.stringify(['a', 'a', '', 1, 'b']))).toEqual(['a', 'b']);
    expect(serializeFavoriteModelKeys(['a', 'a', '', 'b'])).toBe(JSON.stringify(['a', 'b']));
  });
});

describe('cleanModelLabel', () => {
  it('strips provider prefix from model labels', () => {
    expect(cleanModelLabel('[openai] GPT 5')).toBe('GPT 5');
    expect(cleanModelLabel('[poe] Qwen3')).toBe('Qwen3');
    expect(cleanModelLabel('[anthropic] Claude Sonnet 4')).toBe('Claude Sonnet 4');
  });

  it('returns label unchanged when no provider prefix exists', () => {
    expect(cleanModelLabel('GPT 5')).toBe('GPT 5');
    expect(cleanModelLabel('Claude Sonnet 4')).toBe('Claude Sonnet 4');
  });

  it('handles empty or whitespace-only labels', () => {
    expect(cleanModelLabel('')).toBe('');
    expect(cleanModelLabel('   ')).toBe('');
    expect(cleanModelLabel('[provider]')).toBe('');
  });
});

describe('extractProviderFromLabel', () => {
  it('pulls the provider id off the front and returns the cleaned label', () => {
    expect(extractProviderFromLabel('[openai] gpt 5')).toEqual({ providerId: 'openai', cleanLabel: 'gpt 5' });
    expect(extractProviderFromLabel('[anthropic] Claude Sonnet 4')).toEqual({
      providerId: 'anthropic',
      cleanLabel: 'Claude Sonnet 4',
    });
  });

  it('returns the label untouched when no provider prefix is present', () => {
    expect(extractProviderFromLabel('gpt 5')).toEqual({ cleanLabel: 'gpt 5' });
    expect(extractProviderFromLabel('   spaced   ')).toEqual({ cleanLabel: 'spaced' });
  });

  it('leaves empty-bracket labels untouched (no valid provider token)', () => {
    expect(extractProviderFromLabel('[] gpt 5')).toEqual({ cleanLabel: '[] gpt 5' });
  });
});
