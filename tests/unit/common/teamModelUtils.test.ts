/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { getTeamAvailableModels, getTeamDefaultModelId, resolveTeamModelLabel } from '@/common/utils/teamModelUtils';
import type { AcpModelInfo } from '@/common/types/acpTypes';
import type { IProvider } from '@/common/config/storage';

vi.mock('@/common/utils/modelCapabilities', () => ({
  hasSpecificModelCapability: (provider: IProvider, modelName: string, capability: string) => {
    if (capability === 'function_calling') {
      if (provider.model_capabilities?.[modelName]?.function_calling === false) return false;
      return undefined;
    }
    if (capability === 'excludeFromPrimary') {
      if (provider.model_capabilities?.[modelName]?.excludeFromPrimary === true) return true;
      return false;
    }
    return undefined;
  },
}));

const mockAcpModelInfo: Record<string, AcpModelInfo> = {
  claude: {
    available_models: [
      { id: 'claude-3-opus', label: 'Claude 3 Opus' },
      { id: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
    ],
    current_model_id: 'claude-3-opus',
  },
  codex: {
    available_models: [{ id: 'gpt-4', label: 'GPT-4' }],
    current_model_id: 'gpt-4',
  },
};

const mockProviders: IProvider[] = [
  {
    id: 'provider-1',
    name: 'OpenAI',
    enabled: true,
    platform: 'openai',
    models: ['gpt-4', 'gpt-3.5-turbo'],
    model_enabled: { 'gpt-4': true, 'gpt-3.5-turbo': true },
  } as IProvider,
  {
    id: 'provider-2',
    name: 'Anthropic',
    enabled: true,
    platform: 'anthropic',
    models: ['claude-3-opus'],
    model_enabled: { 'claude-3-opus': true },
  } as IProvider,
  {
    id: 'provider-3',
    name: 'Disabled Provider',
    enabled: false,
    platform: 'custom',
    models: ['custom-model'],
  } as IProvider,
  {
    id: 'provider-4',
    name: 'Google Auth',
    enabled: true,
    platform: 'gemini-with-google-auth',
    models: ['gemini-pro'],
  } as IProvider,
];

describe('teamModelUtils', () => {
  describe('getTeamAvailableModels', () => {
    it('returns ACP cached models for known backend', () => {
      const result = getTeamAvailableModels('claude', mockAcpModelInfo, [], false);
      expect(result).toEqual([
        { id: 'claude-3-opus', label: 'Claude 3 Opus' },
        { id: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
      ]);
    });

    it('uses model id as label when label is missing', () => {
      const cachedModels = {
        backend: {
          available_models: [{ id: 'model-1' }],
        },
      } as any;
      const result = getTeamAvailableModels('backend', cachedModels, [], false);
      expect(result).toEqual([{ id: 'model-1', label: 'model-1' }]);
    });

    it('returns all enabled provider models for aionrs backend', () => {
      const result = getTeamAvailableModels('aionrs', null, mockProviders, false);
      expect(result).toEqual([
        { id: 'gpt-4', label: 'gpt-4' },
        { id: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' },
        { id: 'claude-3-opus', label: 'claude-3-opus' },
      ]);
    });

    it('excludes google-auth platform for aionrs', () => {
      const result = getTeamAvailableModels('aionrs', null, mockProviders, false);
      expect(result.map((m) => m.id)).not.toContain('gemini-pro');
    });

    it('excludes disabled providers for aionrs', () => {
      const result = getTeamAvailableModels('aionrs', null, mockProviders, false);
      expect(result.map((m) => m.id)).not.toContain('custom-model');
    });

    it('deduplicates models for aionrs', () => {
      const providersWithDuplicates = [
        {
          id: 'p1',
          enabled: true,
          platform: 'openai',
          models: ['gpt-4'],
          model_enabled: { 'gpt-4': true },
        } as IProvider,
        {
          id: 'p2',
          enabled: true,
          platform: 'openrouter',
          models: ['gpt-4'],
          model_enabled: { 'gpt-4': true },
        } as IProvider,
      ];
      const result = getTeamAvailableModels('aionrs', null, providersWithDuplicates, false);
      expect(result).toEqual([{ id: 'gpt-4', label: 'gpt-4' }]);
    });

    it('filters models with function_calling=false', () => {
      const providers = [
        {
          id: 'p1',
          enabled: true,
          platform: 'custom',
          models: ['model-with-fc', 'model-without-fc'],
          model_enabled: { 'model-with-fc': true, 'model-without-fc': true },
          model_capabilities: {
            'model-without-fc': { function_calling: false },
          },
        } as IProvider,
      ];
      const result = getTeamAvailableModels('aionrs', null, providers, false);
      expect(result.map((m) => m.id)).toEqual(['model-with-fc']);
    });

    it('filters models with excludeFromPrimary=true', () => {
      const providers = [
        {
          id: 'p1',
          enabled: true,
          platform: 'custom',
          models: ['model-included', 'model-excluded'],
          model_enabled: { 'model-included': true, 'model-excluded': true },
          model_capabilities: {
            'model-excluded': { excludeFromPrimary: true },
          },
        } as IProvider,
      ];
      const result = getTeamAvailableModels('aionrs', null, providers, false);
      expect(result.map((m) => m.id)).toEqual(['model-included']);
    });

    it('returns empty array for unknown backend', () => {
      const result = getTeamAvailableModels('unknown', null, [], false);
      expect(result).toEqual([]);
    });

    it('returns empty array when aionrs has no providers', () => {
      const result = getTeamAvailableModels('aionrs', null, [], false);
      expect(result).toEqual([]);
    });
  });

  describe('getTeamDefaultModelId', () => {
    it('returns preferred model from acp config', () => {
      const acpConfig = {
        claude: { preferredModelId: 'claude-3-opus' },
      };
      const result = getTeamDefaultModelId('claude', mockAcpModelInfo, acpConfig);
      expect(result).toBe('claude-3-opus');
    });

    it('returns cached current model when no preference', () => {
      const result = getTeamDefaultModelId('claude', mockAcpModelInfo, null);
      expect(result).toBe('claude-3-opus');
    });

    it('returns undefined when no preference or cached model', () => {
      const result = getTeamDefaultModelId('unknown', null, null);
      expect(result).toBeUndefined();
    });

    it('prefers user preference over cached model', () => {
      const acpConfig = {
        claude: { preferredModelId: 'claude-3-sonnet' },
      };
      const result = getTeamDefaultModelId('claude', mockAcpModelInfo, acpConfig);
      expect(result).toBe('claude-3-sonnet');
    });
  });

  describe('resolveTeamModelLabel', () => {
    it('returns label from ACP cached models', () => {
      const result = resolveTeamModelLabel('claude-3-opus', 'claude', mockAcpModelInfo);
      expect(result).toBe('Claude 3 Opus');
    });

    it('returns model id when label not found', () => {
      const result = resolveTeamModelLabel('unknown-model', 'claude', mockAcpModelInfo);
      expect(result).toBe('unknown-model');
    });

    it('returns model id when no cached models', () => {
      const result = resolveTeamModelLabel('gpt-4', 'aionrs', null);
      expect(result).toBe('gpt-4');
    });

    it('returns (default) for undefined model_id', () => {
      const result = resolveTeamModelLabel(undefined, 'claude', mockAcpModelInfo);
      expect(result).toBe('(default)');
    });

    it('returns model id when no label in cached models', () => {
      const cachedModels = {
        backend: {
          available_models: [{ id: 'model-1' }],
        },
      } as any;
      const result = resolveTeamModelLabel('model-1', 'backend', cachedModels);
      expect(result).toBe('model-1');
    });
  });
});
