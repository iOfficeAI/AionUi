/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getTeamAvailableModels,
  getTeamDefaultModelId,
  resolveTeamModelLabel,
} from '../../src/common/utils/teamModelUtils';
import { flattenGeminiModeIds } from '../../src/common/utils/geminiModes';
import type { AcpModelInfo } from '../../src/common/types/acpTypes';
import type { IProvider } from '../../src/common/config/storage';

// ---------------------------------------------------------------------------
// Helpers — construct minimal valid objects without mocking
// ---------------------------------------------------------------------------

function makeAcpModelInfo(overrides: Partial<AcpModelInfo> = {}): AcpModelInfo {
  return {
    currentModelId: null,
    currentModelLabel: null,
    availableModels: [],
    canSwitch: true,
    source: 'models',
    ...overrides,
  };
}

function makeProvider(overrides: Partial<IProvider> & { platform: string; model: string[] }): IProvider {
  return {
    id: 'test-provider',
    name: 'Test',
    baseUrl: '',
    apiKey: '',
    enabled: true,
    ...overrides,
  };
}

// ===========================================================================
// getTeamAvailableModels
// ===========================================================================

describe('getTeamAvailableModels', () => {
  // --- ACP backends ---

  it('UT-1: ACP backend with cachedModels returns standardized model list', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({
        availableModels: [
          { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
          { id: 'claude-haiku-3.5', label: 'Claude Haiku 3.5' },
        ],
      }),
    };
    const result = getTeamAvailableModels('claude', cachedModels, []);
    expect(result).toEqual([
      { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
      { id: 'claude-haiku-3.5', label: 'Claude Haiku 3.5' },
    ]);
  });

  it('UT-2: ACP backend with empty label falls back to id', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      codex: makeAcpModelInfo({
        availableModels: [{ id: 'codex-mini', label: '' }],
      }),
    };
    const result = getTeamAvailableModels('codex', cachedModels, []);
    expect(result).toEqual([{ id: 'codex-mini', label: 'codex-mini' }]);
  });

  it('UT-3: ACP backend with empty availableModels returns empty array', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({ availableModels: [] }),
    };
    const result = getTeamAvailableModels('claude', cachedModels, []);
    expect(result).toEqual([]);
  });

  it('UT-4: cachedModels is null returns empty array', () => {
    const result = getTeamAvailableModels('claude', null, []);
    expect(result).toEqual([]);
  });

  it('UT-5: cachedModels is undefined returns empty array', () => {
    const result = getTeamAvailableModels('claude', undefined, []);
    expect(result).toEqual([]);
  });

  // --- Gemini backend with Google Auth ---

  it('UT-6: Gemini backend with Google Auth and provider models', () => {
    const providers: IProvider[] = [
      makeProvider({
        platform: 'gemini',
        model: ['gemini-2.5-pro', 'gemini-2.0-flash'],
        modelEnabled: { 'gemini-2.5-pro': true, 'gemini-2.0-flash': true },
      }),
    ];
    const result = getTeamAvailableModels('gemini', {}, providers, true);
    // Google Auth models come from flattenGeminiModeIds(), not hardcoded
    const expectedGoogleAuthIds = flattenGeminiModeIds();
    for (const id of expectedGoogleAuthIds) {
      expect(result.some((m) => m.id === id)).toBe(true);
    }
    // Google Auth models first
    expect(result[0]).toEqual({ id: 'auto', label: 'auto' });
    expect(result[1]).toEqual({ id: 'auto-gemini-2.5', label: 'auto-gemini-2.5' });
    // Provider model gemini-2.0-flash not in Google Auth list — appended after
    expect(result.some((m) => m.id === 'gemini-2.0-flash')).toBe(true);
    // gemini-2.5-pro in both Google Auth + provider — no duplicate
    expect(result.filter((m) => m.id === 'gemini-2.5-pro')).toHaveLength(1);
  });

  it('UT-7: Gemini backend recognizes gemini-with-google-auth platform', () => {
    const providers: IProvider[] = [
      makeProvider({
        platform: 'gemini-with-google-auth',
        model: ['gemini-2.5-pro'],
      }),
    ];
    const result = getTeamAvailableModels('gemini', {}, providers, true);
    expect(result[0]).toEqual({ id: 'auto', label: 'auto' });
    expect(result.some((m) => m.id === 'gemini-2.5-pro')).toBe(true);
  });

  it('UT-8: Gemini backend excludes disabled providers', () => {
    const providers: IProvider[] = [
      makeProvider({
        platform: 'gemini',
        enabled: false,
        model: ['gemini-2.5-pro'],
      }),
      makeProvider({
        id: 'p2',
        platform: 'gemini',
        enabled: true,
        model: ['gemini-2.0-flash'],
      }),
    ];
    const result = getTeamAvailableModels('gemini', {}, providers, false);
    // Disabled provider's model excluded, enabled provider's model present
    expect(result[0]).toEqual({ id: 'gemini-2.0-flash', label: 'gemini-2.0-flash' });
    // No Google Auth models (isGoogleAuth=false)
    expect(result.some((m) => m.id === 'auto')).toBe(false);
  });

  it('UT-9: Gemini backend excludes models with modelEnabled === false', () => {
    const providers: IProvider[] = [
      makeProvider({
        platform: 'gemini',
        model: ['gemini-2.5-pro', 'gemini-2.0-flash'],
        modelEnabled: { 'gemini-2.5-pro': true, 'gemini-2.0-flash': false },
      }),
    ];
    const result = getTeamAvailableModels('gemini', {}, providers, false);
    expect(result).toEqual([{ id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }]);
  });

  it('UT-28: Gemini backend without Google Auth returns only provider models', () => {
    const providers: IProvider[] = [
      makeProvider({
        platform: 'gemini',
        model: ['gemini-2.5-pro'],
      }),
    ];
    const result = getTeamAvailableModels('gemini', {}, providers, false);
    expect(result).toEqual([{ id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }]);
    expect(result.some((m) => m.id === 'auto')).toBe(false);
  });

  it('UT-35: Gemini backend includes non-gemini-platform providers (e.g. OpenAI)', () => {
    const providers: IProvider[] = [
      makeProvider({
        id: 'gemini-api',
        platform: 'gemini',
        model: ['gemini-2.5-pro'],
      }),
      makeProvider({
        id: 'openai',
        platform: 'openai-compatible',
        model: ['gpt-4o', 'gpt-4o-mini'],
      }),
    ];
    const result = getTeamAvailableModels('gemini', {}, providers, false);
    // Both gemini AND openai provider models included
    expect(result).toEqual([
      { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    ]);
  });

  it('UT-36: Gemini backend with Google Auth + multiple platform providers', () => {
    const providers: IProvider[] = [
      makeProvider({
        id: 'openai',
        platform: 'openai-compatible',
        model: ['gpt-4o'],
      }),
      makeProvider({
        id: 'anthropic',
        platform: 'anthropic',
        model: ['claude-sonnet-4'],
      }),
    ];
    const result = getTeamAvailableModels('gemini', {}, providers, true);
    // Google Auth first
    expect(result[0]).toEqual({ id: 'auto', label: 'auto' });
    // Then all providers' models
    expect(result.some((m) => m.id === 'gpt-4o')).toBe(true);
    expect(result.some((m) => m.id === 'claude-sonnet-4')).toBe(true);
  });

  it('UT-29: Gemini backend isGoogleAuth defaults to no Google Auth models', () => {
    const providers: IProvider[] = [
      makeProvider({
        platform: 'gemini',
        model: ['gemini-2.5-pro'],
      }),
    ];
    // isGoogleAuth not passed (undefined)
    const result = getTeamAvailableModels('gemini', {}, providers);
    expect(result).toEqual([{ id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }]);
    expect(result.some((m) => m.id === 'auto')).toBe(false);
  });

  // --- Aionrs backend ---

  it('UT-10: Aionrs backend takes all enabled providers models', () => {
    const providers: IProvider[] = [
      makeProvider({
        id: 'p1',
        platform: 'openai-compatible',
        model: ['gpt-4o', 'gpt-4o-mini'],
      }),
      makeProvider({
        id: 'p2',
        platform: 'openai-compatible',
        model: ['another-model'],
      }),
    ];
    const result = getTeamAvailableModels('aionrs', {}, providers);
    expect(result).toEqual([
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { id: 'another-model', label: 'another-model' },
    ]);
  });

  it('UT-11: Aionrs backend with no enabled provider returns empty array', () => {
    const providers: IProvider[] = [
      makeProvider({
        platform: 'openai-compatible',
        enabled: false,
        model: ['gpt-4o'],
      }),
    ];
    const result = getTeamAvailableModels('aionrs', {}, providers);
    expect(result).toEqual([]);
  });

  it('UT-12: Aionrs backend excludes models with modelEnabled === false', () => {
    const providers: IProvider[] = [
      makeProvider({
        platform: 'openai-compatible',
        model: ['gpt-4o', 'gpt-4o-mini'],
        modelEnabled: { 'gpt-4o': true, 'gpt-4o-mini': false },
      }),
    ];
    const result = getTeamAvailableModels('aionrs', {}, providers);
    expect(result).toEqual([{ id: 'gpt-4o', label: 'gpt-4o' }]);
  });

  it('UT-30: Aionrs backend deduplicates models across providers', () => {
    const providers: IProvider[] = [
      makeProvider({
        id: 'p1',
        platform: 'openai-compatible',
        model: ['gpt-4o', 'gpt-4o-mini'],
      }),
      makeProvider({
        id: 'p2',
        platform: 'openai-compatible',
        model: ['gpt-4o', 'custom-model'],
      }),
    ];
    const result = getTeamAvailableModels('aionrs', {}, providers);
    expect(result).toEqual([
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { id: 'custom-model', label: 'custom-model' },
    ]);
  });

  // --- Aionrs capability filtering ---

  it('UT-32: Aionrs backend excludes models without function_calling capability', () => {
    const providers: IProvider[] = [
      makeProvider({
        id: 'p1',
        platform: 'openai-compatible',
        // dall-e-3 matches excludeFromPrimary, imagen-3 excluded from function_calling
        model: ['gpt-4o', 'dall-e-3', 'imagen-3'],
      }),
    ];
    const result = getTeamAvailableModels('aionrs', {}, providers);
    expect(result).toEqual([{ id: 'gpt-4o', label: 'gpt-4o' }]);
  });

  it('UT-33: Aionrs backend excludes gemini-with-google-auth platform providers', () => {
    const providers: IProvider[] = [
      makeProvider({
        id: 'google-auth',
        platform: 'gemini-with-google-auth',
        model: ['auto', 'gemini-2.5-pro'],
      }),
      makeProvider({
        id: 'openai',
        platform: 'openai-compatible',
        model: ['gpt-4o'],
      }),
    ];
    const result = getTeamAvailableModels('aionrs', {}, providers);
    // google-auth provider excluded entirely
    expect(result.some((m) => m.id === 'auto')).toBe(false);
    expect(result).toEqual([{ id: 'gpt-4o', label: 'gpt-4o' }]);
  });

  it('UT-34: Gemini backend capability-filters provider models (excludeFromPrimary)', () => {
    const providers: IProvider[] = [
      makeProvider({
        platform: 'gemini',
        model: ['gemini-2.5-pro', 'flux-schnell'],
      }),
    ];
    const result = getTeamAvailableModels('gemini', {}, providers, false);
    expect(result).toEqual([{ id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }]);
  });

  // --- Unknown backend ---

  it('UT-13: unknown backend returns empty array', () => {
    const result = getTeamAvailableModels('custom', {}, []);
    expect(result).toEqual([]);
  });

  // --- providers null/undefined ---

  it('UT-14: providers is null — Gemini with Google Auth still returns auth models from flattenGeminiModeIds', () => {
    const result = getTeamAvailableModels('gemini', {}, null, true);
    const expectedIds = flattenGeminiModeIds();
    expect(result).toHaveLength(expectedIds.length);
    expect(result[0]).toEqual({ id: 'auto', label: 'auto' });
    for (const id of expectedIds) {
      expect(result.some((m) => m.id === id)).toBe(true);
    }
  });

  it('UT-31: providers is null — Gemini without Google Auth returns empty', () => {
    const result = getTeamAvailableModels('gemini', {}, null, false);
    expect(result).toEqual([]);
  });

  it('UT-15: providers is undefined — Aionrs returns empty array', () => {
    const result = getTeamAvailableModels('aionrs', {}, undefined);
    expect(result).toEqual([]);
  });

  // --- Boundary: BC-5 multiple Gemini providers ---

  it('BC-5: Gemini merges models from multiple enabled providers + Google Auth', () => {
    const providers: IProvider[] = [
      makeProvider({
        id: 'g1',
        platform: 'gemini',
        model: ['gemini-2.5-pro'],
      }),
      makeProvider({
        id: 'g2',
        platform: 'gemini-with-google-auth',
        model: ['gemini-2.0-flash'],
      }),
    ];
    const result = getTeamAvailableModels('gemini', {}, providers, true);
    // Google Auth models first
    expect(result[0]).toEqual({ id: 'auto', label: 'auto' });
    // No duplicates for gemini-2.5-pro (in both Google Auth and provider)
    expect(result.filter((m) => m.id === 'gemini-2.5-pro')).toHaveLength(1);
    // Provider-only model appended
    expect(result.some((m) => m.id === 'gemini-2.0-flash')).toBe(true);
  });

  // --- Boundary: BC-6 ACP backend with both cachedModels and providers ---

  it('BC-6: ACP backend uses cachedModels, ignores providers', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({
        availableModels: [{ id: 'claude-sonnet-4', label: 'Claude Sonnet 4' }],
      }),
    };
    const providers: IProvider[] = [
      makeProvider({
        platform: 'gemini',
        model: ['gemini-2.5-pro'],
      }),
    ];
    const result = getTeamAvailableModels('claude', cachedModels, providers);
    expect(result).toEqual([{ id: 'claude-sonnet-4', label: 'Claude Sonnet 4' }]);
  });
});

// ===========================================================================
// getTeamDefaultModelId
// ===========================================================================

describe('getTeamDefaultModelId', () => {
  it('UT-16: returns preferredModelId when present', () => {
    const acpConfig = { claude: { preferredModelId: 'claude-sonnet-4' } };
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({ currentModelId: 'claude-haiku-3.5' }),
    };
    const result = getTeamDefaultModelId('claude', cachedModels, acpConfig);
    expect(result).toBe('claude-sonnet-4');
  });

  it('UT-17: falls back to currentModelId when preferredModelId is absent', () => {
    const acpConfig = { claude: {} };
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({ currentModelId: 'claude-haiku-3.5' }),
    };
    const result = getTeamDefaultModelId('claude', cachedModels, acpConfig);
    expect(result).toBe('claude-haiku-3.5');
  });

  it('UT-18: returns undefined when both are absent', () => {
    const acpConfig = { claude: {} };
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({ currentModelId: null }),
    };
    const result = getTeamDefaultModelId('claude', cachedModels, acpConfig);
    expect(result).toBeUndefined();
  });

  it('UT-19: returns undefined when cachedModels and acpConfig are null', () => {
    const result = getTeamDefaultModelId('claude', null, null);
    expect(result).toBeUndefined();
  });

  it('UT-20: returns undefined for a backend not in config', () => {
    const acpConfig = { claude: { preferredModelId: 'claude-sonnet-4' } };
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({ currentModelId: 'claude-haiku-3.5' }),
    };
    const result = getTeamDefaultModelId('unknown-backend', cachedModels, acpConfig);
    expect(result).toBeUndefined();
  });
});

// ===========================================================================
// resolveTeamModelLabel
// ===========================================================================

describe('resolveTeamModelLabel', () => {
  it('UT-21: returns label from ACP cached models when match found', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({
        availableModels: [
          { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
          { id: 'claude-opus-4', label: 'Claude Opus 4' },
        ],
      }),
    };
    expect(resolveTeamModelLabel('claude-sonnet-4', 'claude', cachedModels)).toBe('Claude Sonnet 4');
  });

  it('UT-22: returns raw model ID when no ACP match (Gemini fallback)', () => {
    expect(resolveTeamModelLabel('gemini-2.5-pro', 'gemini', null)).toBe('gemini-2.5-pro');
  });

  it('UT-23: returns "(default)" when modelId is undefined', () => {
    expect(resolveTeamModelLabel(undefined, 'claude', null)).toBe('(default)');
  });

  it('UT-24: returns raw ID when cachedModels has no entry for the backend', () => {
    expect(resolveTeamModelLabel('claude-sonnet-4', 'claude', {})).toBe('claude-sonnet-4');
  });

  it('UT-25: returns raw ID when backend has models but none match', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({
        availableModels: [{ id: 'claude-opus-4', label: 'Claude Opus 4' }],
      }),
    };
    expect(resolveTeamModelLabel('claude-sonnet-4', 'claude', cachedModels)).toBe('claude-sonnet-4');
  });

  it('UT-26: returns raw ID when matched model has empty label', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({
        availableModels: [{ id: 'claude-sonnet-4', label: '' }],
      }),
    };
    expect(resolveTeamModelLabel('claude-sonnet-4', 'claude', cachedModels)).toBe('claude-sonnet-4');
  });

  it('UT-27: returns "(default)" when cachedModels is provided but modelId is undefined', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({
        availableModels: [{ id: 'claude-sonnet-4', label: 'Claude Sonnet 4' }],
      }),
    };
    expect(resolveTeamModelLabel(undefined, 'claude', cachedModels)).toBe('(default)');
  });
});
