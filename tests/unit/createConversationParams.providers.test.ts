/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression coverage for the model-config migration
 * (`docs/backend-migration/specs/2026-04-24-model-config-frontend-migration-design.md`).
 *
 * Pre-migration, `createConversationParams` resolved the default model
 * via `configService.get('model.config')` (a local IProvider[] array).
 * Post-migration the source of truth is `/api/providers`, surfaced
 * through `ipcBridge.mode.listProviders`.
 *
 * These tests freeze that invariant: the provider-resolution code path
 * must NEVER call `configService.get('model.config')` again — not even
 * as a fallback — regardless of whether providers exist, are disabled,
 * or the bridge throws.
 *
 * Companion to `tests/unit/createConversationParams.test.ts`, which
 * already covers the happy-path model selection; this file only guards
 * the removed data source.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadPresetAssistantResources = vi.fn();
const configGet = vi.fn();
const listProvidersInvoke = vi.fn();
const defaultCodexModels: Array<{ id: string; label: string }> = [];

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: { invoke: listProvidersInvoke },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGet,
  },
}));

vi.mock('@/common/utils/presetAssistantResources', () => ({
  loadPresetAssistantResources,
}));

vi.mock('@/common/types/codex/codexModels', () => ({
  DEFAULT_CODEX_MODELS: defaultCodexModels,
}));

const { buildCliAgentParams, buildPresetAssistantParams, getDefaultAionrsModel, getDefaultGeminiModel } =
  await import('@/renderer/pages/conversation/utils/createConversationParams');

function assertNeverQueriedModelConfig(): void {
  const requestedKeys = configGet.mock.calls.map((call) => call[0] as string);
  expect(requestedKeys).not.toContain('model.config');
}

describe('createConversationParams — providers come from /api/providers, not configService', () => {
  beforeEach(() => {
    loadPresetAssistantResources.mockReset();
    configGet.mockReset();
    listProvidersInvoke.mockReset();
    defaultCodexModels.length = 0;
  });

  it('reads providers exclusively via ipcBridge.mode.listProviders (aionrs happy path)', async () => {
    listProvidersInvoke.mockResolvedValue([
      {
        id: 'p1',
        platform: 'openai',
        name: 'OpenAI',
        base_url: 'https://api.openai.com',
        api_key: 'sk-x',
        models: ['gpt-4'],
        enabled: true,
      },
    ]);

    const model = await getDefaultAionrsModel();

    expect(listProvidersInvoke).toHaveBeenCalledTimes(1);
    expect(model.id).toBe('p1');
    assertNeverQueriedModelConfig();
  });

  it('reads providers exclusively via ipcBridge.mode.listProviders (gemini happy path)', async () => {
    listProvidersInvoke.mockResolvedValue([
      {
        id: 'p1',
        platform: 'gemini',
        name: 'Gemini',
        base_url: 'https://g',
        api_key: 'k',
        models: ['gemini-pro'],
        enabled: true,
      },
    ]);

    const model = await getDefaultGeminiModel();

    expect(listProvidersInvoke).toHaveBeenCalledTimes(1);
    expect(model.id).toBe('p1');
    assertNeverQueriedModelConfig();
  });

  it('does NOT fall back to configService when the bridge returns an empty list', async () => {
    // Pre-migration, empty local config triggered a configService read.
    // Post-migration the only signal is the HTTP response; "no providers"
    // is terminal and returns the placeholder (gemini) or throws (aionrs).
    listProvidersInvoke.mockResolvedValue([]);

    await expect(getDefaultAionrsModel()).rejects.toThrow('No model provider configured');
    assertNeverQueriedModelConfig();
  });

  it('does NOT fall back to configService when the bridge returns null', async () => {
    // Some request paths may surface a null envelope — treat the same as
    // empty without reviving the old local-config read path.
    listProvidersInvoke.mockResolvedValue(null);

    await expect(getDefaultGeminiModel()).rejects.toThrow('No model provider configured');
    assertNeverQueriedModelConfig();
  });

  it('does NOT fall back to configService when the bridge throws', async () => {
    listProvidersInvoke.mockRejectedValue(new Error('boom'));

    await expect(getDefaultAionrsModel()).rejects.toThrow('boom');
    assertNeverQueriedModelConfig();
  });

  it('buildCliAgentParams (gemini) routes through listProviders and never touches model.config', async () => {
    listProvidersInvoke.mockResolvedValue([
      {
        id: 'p1',
        platform: 'gemini',
        name: 'Gemini',
        base_url: 'https://g',
        api_key: 'k',
        models: ['gemini-pro'],
        enabled: true,
      },
    ]);

    const params = await buildCliAgentParams({ backend: 'gemini', name: 'Agent' }, '/tmp');

    expect(params.model.id).toBe('p1');
    expect(params.model.useModel).toBe('gemini-pro');
    expect(listProvidersInvoke).toHaveBeenCalled();
    assertNeverQueriedModelConfig();
  });

  it('buildCliAgentParams (aionrs) routes through listProviders and never touches model.config', async () => {
    listProvidersInvoke.mockResolvedValue([
      {
        id: 'p1',
        platform: 'openai',
        name: 'OpenAI',
        base_url: 'https://api.openai.com',
        api_key: 'sk-x',
        models: ['gpt-4'],
        enabled: true,
      },
    ]);

    const params = await buildCliAgentParams({ backend: 'aionrs', name: 'Agent' }, '/tmp');

    expect(params.model.id).toBe('p1');
    expect(listProvidersInvoke).toHaveBeenCalled();
    assertNeverQueriedModelConfig();
  });

  it('buildPresetAssistantParams (gemini) routes through listProviders and never touches model.config', async () => {
    loadPresetAssistantResources.mockResolvedValue({ rules: 'r', skills: '', enabled_skills: [] });
    listProvidersInvoke.mockResolvedValue([
      {
        id: 'p1',
        platform: 'gemini',
        name: 'Gemini',
        base_url: 'https://g',
        api_key: 'k',
        models: ['gemini-pro'],
        enabled: true,
      },
    ]);

    const params = await buildPresetAssistantParams(
      { backend: 'gemini', name: 'A', custom_agent_id: 'p', is_preset: true, presetAgentType: 'gemini' },
      '/tmp',
      'en'
    );

    expect(params.model.id).toBe('p1');
    expect(listProvidersInvoke).toHaveBeenCalled();
    assertNeverQueriedModelConfig();
  });

  it('returns gemini placeholder (not a configService lookup) when no provider is enabled', async () => {
    listProvidersInvoke.mockResolvedValue([{ id: 'p1', enabled: false, models: ['m1'] }]);

    const params = await buildCliAgentParams({ backend: 'gemini', name: 'Agent' }, '/tmp');

    expect(params.model.id).toBe('gemini-placeholder');
    expect(params.model.platform).toBe('gemini-with-google-auth');
    assertNeverQueriedModelConfig();
  });

  it('consumes snake_case IProvider shape end-to-end (regression on field renames)', async () => {
    // Before T2, consumers read `.model`/`.baseUrl`/`.apiKey`. After T2,
    // all sites use snake_case. If a regression sneaks a camelCase access
    // back in, the returned `TProviderWithModel` would drop the field on
    // the floor — assert the whole round-trip.
    listProvidersInvoke.mockResolvedValue([
      {
        id: 'p1',
        platform: 'openai',
        name: 'OpenAI',
        base_url: 'https://api.openai.com',
        api_key: 'sk-x',
        models: ['gpt-4', 'gpt-4o'],
        capabilities: ['vision'],
        context_limit: 128000,
        model_protocols: { 'gpt-4': 'openai' },
        model_enabled: { 'gpt-4': false, 'gpt-4o': true },
        enabled: true,
      },
    ]);

    const model = await getDefaultAionrsModel();

    expect(model.base_url).toBe('https://api.openai.com');
    expect(model.api_key).toBe('sk-x');
    expect(model.context_limit).toBe(128000);
    expect(model.model_protocols).toEqual({ 'gpt-4': 'openai' });
    expect(model.model_enabled).toEqual({ 'gpt-4': false, 'gpt-4o': true });
    // model_enabled skips gpt-4 → first enabled is gpt-4o
    expect(model.useModel).toBe('gpt-4o');
  });
});
