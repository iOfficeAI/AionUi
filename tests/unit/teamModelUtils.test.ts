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
import type { AcpModelInfo } from '../../src/common/types/acpTypes';
import type { IProvider } from '../../src/common/config/storage';

// ---------------------------------------------------------------------------
// Helpers — construct minimal valid objects without mocking
// ---------------------------------------------------------------------------

function makeAcpModelInfo(overrides: Partial<AcpModelInfo> = {}): AcpModelInfo {
  return {
    current_model_id: null,
    currentModelLabel: null,
    available_models: [],
    canSwitch: true,
    source: 'models',
    ...overrides,
  };
}

function makeProvider(overrides: Partial<IProvider> & { platform: string; model: string[] }): IProvider {
  return {
    id: 'test-provider',
    name: 'Test',
    base_url: '',
    api_key: '',
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
        available_models: [
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
        available_models: [{ id: 'codex-mini', label: '' }],
      }),
    };
    const result = getTeamAvailableModels('codex', cachedModels, []);
    expect(result).toEqual([{ id: 'codex-mini', label: 'codex-mini' }]);
  });

  it('UT-3: ACP backend with empty availableModels returns empty array', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({ available_models: [] }),
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

  // --- Gemini backend (now routes through ACP) ---

  it('UT-6: Gemini backend with ACP cached models returns ACP model list', () => {
    // Gemini now runs under ACP, so Gemini backend model list is read from
    // cachedModels['gemini'].available_models exactly like other ACP backends.
    const cachedModels: Record<string, AcpModelInfo> = {
      gemini: makeAcpModelInfo({
        available_models: [
          { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
          { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
        ],
      }),
    };
    const result = getTeamAvailableModels('gemini', cachedModels, []);
    expect(result).toEqual([
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ]);
  });

  it('UT-7: Gemini backend without ACP cached models returns empty array', () => {
    // No Gemini-specific fallback branch anymore — an unresolved 'gemini' backend
    // (no cachedModels entry) is treated the same as any other unknown backend.
    const providers: IProvider[] = [
      makeProvider({
        platform: 'gemini-with-google-auth',
        models: ['gemini-2.5-pro'],
      }),
    ];
    const result = getTeamAvailableModels('gemini', {}, providers, true);
    expect(result).toEqual([]);
  });

  // --- Aionrs backend ---

  it('UT-10: Aionrs backend takes all enabled providers models', () => {
    const providers: IProvider[] = [
      makeProvider({
        id: 'p1',
        platform: 'openai-compatible',
        models: ['gpt-4o', 'gpt-4o-mini'],
      }),
      makeProvider({
        id: 'p2',
        platform: 'openai-compatible',
        models: ['another-model'],
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
        models: ['gpt-4o'],
      }),
    ];
    const result = getTeamAvailableModels('aionrs', {}, providers);
    expect(result).toEqual([]);
  });

  it('UT-12: Aionrs backend excludes models with modelEnabled === false', () => {
    const providers: IProvider[] = [
      makeProvider({
        platform: 'openai-compatible',
        models: ['gpt-4o', 'gpt-4o-mini'],
        model_enabled: { 'gpt-4o': true, 'gpt-4o-mini': false },
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
        models: ['gpt-4o', 'gpt-4o-mini'],
      }),
      makeProvider({
        id: 'p2',
        platform: 'openai-compatible',
        models: ['gpt-4o', 'custom-model'],
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
        models: ['gpt-4o', 'dall-e-3', 'imagen-3'],
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
        models: ['auto', 'gemini-2.5-pro'],
      }),
      makeProvider({
        id: 'openai',
        platform: 'openai-compatible',
        models: ['gpt-4o'],
      }),
    ];
    const result = getTeamAvailableModels('aionrs', {}, providers);
    // google-auth provider excluded entirely
    expect(result.some((m) => m.id === 'auto')).toBe(false);
    expect(result).toEqual([{ id: 'gpt-4o', label: 'gpt-4o' }]);
  });

  // --- Unknown backend ---

  it('UT-13: unknown backend returns empty array', () => {
    const result = getTeamAvailableModels('custom', {}, []);
    expect(result).toEqual([]);
  });

  // --- providers null/undefined ---

  it('UT-15: providers is undefined — Aionrs returns empty array', () => {
    const result = getTeamAvailableModels('aionrs', {}, undefined);
    expect(result).toEqual([]);
  });

  // --- Boundary: BC-6 ACP backend with both cachedModels and providers ---

  it('BC-6: ACP backend uses cachedModels, ignores providers', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({
        available_models: [{ id: 'claude-sonnet-4', label: 'Claude Sonnet 4' }],
      }),
    };
    const providers: IProvider[] = [
      makeProvider({
        platform: 'gemini',
        models: ['gemini-2.5-pro'],
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
      claude: makeAcpModelInfo({ current_model_id: 'claude-haiku-3.5' }),
    };
    const result = getTeamDefaultModelId('claude', cachedModels, acpConfig);
    expect(result).toBe('claude-sonnet-4');
  });

  it('UT-17: falls back to currentModelId when preferredModelId is absent', () => {
    const acpConfig = { claude: {} };
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({ current_model_id: 'claude-haiku-3.5' }),
    };
    const result = getTeamDefaultModelId('claude', cachedModels, acpConfig);
    expect(result).toBe('claude-haiku-3.5');
  });

  it('UT-18: returns undefined when both are absent', () => {
    const acpConfig = { claude: {} };
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({ current_model_id: null }),
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
      claude: makeAcpModelInfo({ current_model_id: 'claude-haiku-3.5' }),
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
        available_models: [
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
        available_models: [{ id: 'claude-opus-4', label: 'Claude Opus 4' }],
      }),
    };
    expect(resolveTeamModelLabel('claude-sonnet-4', 'claude', cachedModels)).toBe('claude-sonnet-4');
  });

  it('UT-26: returns raw ID when matched model has empty label', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({
        available_models: [{ id: 'claude-sonnet-4', label: '' }],
      }),
    };
    expect(resolveTeamModelLabel('claude-sonnet-4', 'claude', cachedModels)).toBe('claude-sonnet-4');
  });

  it('UT-27: returns "(default)" when cachedModels is provided but modelId is undefined', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({
        available_models: [{ id: 'claude-sonnet-4', label: 'Claude Sonnet 4' }],
      }),
    };
    expect(resolveTeamModelLabel(undefined, 'claude', cachedModels)).toBe('(default)');
  });
});
