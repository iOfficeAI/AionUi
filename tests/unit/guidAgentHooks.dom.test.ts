/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Hoist mocks for ipcBridge and ConfigStorage
const bridgeMocks = vi.hoisted(() => ({
  readAssistantRule: vi.fn(),
  readAssistantSkill: vi.fn(),
  readBuiltinRule: vi.fn(),
  readBuiltinSkill: vi.fn(),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    fs: {
      readAssistantRule: { invoke: bridgeMocks.readAssistantRule },
      readAssistantSkill: { invoke: bridgeMocks.readAssistantSkill },
      readBuiltinRule: { invoke: bridgeMocks.readBuiltinRule },
      readBuiltinSkill: { invoke: bridgeMocks.readBuiltinSkill },
    },
  },
}));

vi.mock('../../src/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../../src/common/config/presets/assistantPresets', () => ({
  ASSISTANT_PRESETS: [
    {
      id: 'test-preset',
      avatar: '🧪',
      presetAgentType: 'gemini',
      ruleFiles: { 'en-US': 'test-preset.md' },
      skillFiles: { 'en-US': 'test-preset-skill.md' },
      nameI18n: { 'en-US': 'Test Preset' },
      descriptionI18n: { 'en-US': 'A test preset' },
    },
  ],
}));

import { useAgentAvailability } from '../../src/renderer/pages/guid/hooks/useAgentAvailability';
import { usePresetAssistantResolver } from '../../src/renderer/pages/guid/hooks/usePresetAssistantResolver';
import type { AcpBackendConfig, AvailableAgent } from '../../src/renderer/pages/guid/types';
import type { IProvider } from '../../src/common/config/storage';

// ---------------------------------------------------------------------------
// useAgentAvailability
// ---------------------------------------------------------------------------

describe('useAgentAvailability', () => {
  const defaultAvailableAgents: AvailableAgent[] = [
    { backend: 'claude', name: 'Claude' },
    { backend: 'qwen', name: 'Qwen' },
  ];

  const defaultModelList: IProvider[] = [
    { id: '1', platform: 'openai', name: 'gpt-4', baseUrl: '', apiKey: 'k' } as IProvider,
  ];

  const stubResolvePresetAgentType = (info: { backend: string; customAgentId?: string } | undefined) =>
    info?.customAgentId ? 'gemini' : (info?.backend ?? 'gemini');

  // -- isMainAgentAvailable ---------------------------------------------------

  it('isMainAgentAvailable returns true when agent type exists in availableAgents', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: [],
        isGoogleAuth: false,
        availableAgents: defaultAvailableAgents,
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    expect(result.current.isMainAgentAvailable('claude')).toBe(true);
    expect(result.current.isMainAgentAvailable('qwen')).toBe(true);
  });

  it('isMainAgentAvailable returns false for unavailable agent', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: [],
        isGoogleAuth: false,
        availableAgents: defaultAvailableAgents,
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    expect(result.current.isMainAgentAvailable('codex')).toBe(false);
  });

  it('isMainAgentAvailable returns true for gemini when isGoogleAuth is true', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: [],
        isGoogleAuth: true,
        availableAgents: [],
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    expect(result.current.isMainAgentAvailable('gemini')).toBe(true);
  });

  it('isMainAgentAvailable returns true for gemini when modelList has entries', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: defaultModelList,
        isGoogleAuth: false,
        availableAgents: [],
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    expect(result.current.isMainAgentAvailable('gemini')).toBe(true);
  });

  it('isMainAgentAvailable returns false for gemini when no auth and no models', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: [],
        isGoogleAuth: false,
        availableAgents: [],
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    expect(result.current.isMainAgentAvailable('gemini')).toBe(false);
  });

  // -- getEffectiveAgentType ---------------------------------------------------

  it('getEffectiveAgentType returns resolved agent type with availability info', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: [],
        isGoogleAuth: false,
        availableAgents: defaultAvailableAgents,
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    const info = result.current.getEffectiveAgentType({ backend: 'claude' });
    expect(info.agentType).toBe('claude');
    expect(info.originalType).toBe('claude');
    expect(info.isAvailable).toBe(true);
    expect(info.isFallback).toBe(false);
  });

  it('getEffectiveAgentType marks unavailable agent correctly', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: [],
        isGoogleAuth: false,
        availableAgents: [],
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    const info = result.current.getEffectiveAgentType({ backend: 'codex' });
    expect(info.agentType).toBe('codex');
    expect(info.isAvailable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// usePresetAssistantResolver
// ---------------------------------------------------------------------------

describe('usePresetAssistantResolver', () => {
  const customAgents: AcpBackendConfig[] = [
    {
      id: 'agent-alpha',
      name: 'Alpha',
      isPreset: false,
      enabled: true,
      presetAgentType: 'claude',
      enabledSkills: ['code-review', 'testing'],
    } as AcpBackendConfig,
    {
      id: 'agent-beta',
      name: 'Beta',
      isPreset: true,
      enabled: true,
      presetAgentType: 'qwen',
    } as AcpBackendConfig,
  ];

  beforeEach(() => {
    bridgeMocks.readAssistantRule.mockResolvedValue('');
    bridgeMocks.readAssistantSkill.mockResolvedValue('');
    bridgeMocks.readBuiltinRule.mockResolvedValue('');
    bridgeMocks.readBuiltinSkill.mockResolvedValue('');
  });

  // -- resolvePresetAgentType -------------------------------------------------

  it('resolvePresetAgentType returns backend directly for non-custom agents', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolvePresetAgentType({ backend: 'claude' })).toBe('claude');
    expect(result.current.resolvePresetAgentType({ backend: 'gemini' })).toBe('gemini');
  });

  it('resolvePresetAgentType resolves preset agent to its presetAgentType', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolvePresetAgentType({ backend: 'claude', customAgentId: 'agent-alpha' })).toBe('claude');

    expect(result.current.resolvePresetAgentType({ backend: 'qwen', customAgentId: 'agent-beta' })).toBe('qwen');
  });

  it('resolvePresetAgentType defaults to gemini for unknown preset agent', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolvePresetAgentType({ backend: 'claude', customAgentId: 'unknown-id' })).toBe('gemini');
  });

  it('resolvePresetAgentType returns gemini when agentInfo is undefined', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolvePresetAgentType(undefined)).toBe('gemini');
  });

  // -- resolveEnabledSkills ---------------------------------------------------

  it('resolveEnabledSkills returns skills list for custom agent', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolveEnabledSkills({ backend: 'claude', customAgentId: 'agent-alpha' })).toEqual([
      'code-review',
      'testing',
    ]);
  });

  it('resolveEnabledSkills returns undefined for non-custom backend', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolveEnabledSkills({ backend: 'claude' })).toBeUndefined();
  });

  it('resolveEnabledSkills returns undefined when agentInfo is undefined', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolveEnabledSkills(undefined)).toBeUndefined();
  });

  it('resolveEnabledSkills returns undefined for custom agent without skills', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    // agent-beta has no enabledSkills defined
    expect(result.current.resolveEnabledSkills({ backend: 'qwen', customAgentId: 'agent-beta' })).toBeUndefined();
  });

  // -- resolvePresetRulesAndSkills --------------------------------------------

  it('resolvePresetRulesAndSkills returns context as rules for non-custom backend', async () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    const resolved = await result.current.resolvePresetRulesAndSkills({
      backend: 'claude',
      context: 'You are a helpful assistant',
    });

    expect(resolved.rules).toBe('You are a helpful assistant');
    expect(resolved.skills).toBeUndefined();
  });

  it('resolvePresetRulesAndSkills reads rules and skills for custom agent', async () => {
    bridgeMocks.readAssistantRule.mockResolvedValue('Custom rule content');
    bridgeMocks.readAssistantSkill.mockResolvedValue('Custom skill content');

    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    const resolved = await result.current.resolvePresetRulesAndSkills({
      backend: 'claude',
      customAgentId: 'agent-alpha',
      context: 'fallback context',
    });

    expect(resolved.rules).toBe('Custom rule content');
    expect(resolved.skills).toBe('Custom skill content');
  });

  it('resolvePresetRulesAndSkills returns empty object when agentInfo is undefined', async () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    const resolved = await result.current.resolvePresetRulesAndSkills(undefined);
    expect(resolved).toEqual({});
  });
});
