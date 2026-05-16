/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { AuthType } from '@office-ai/aioncli-core';
import { getAuthTypeFromPlatform, getProviderAuthType } from '@/common/utils/platformAuthType';

vi.mock('@/common/utils/platformConstants', () => ({
  isNewApiPlatform: (platform: string) => platform.toLowerCase().includes('new-api'),
}));

describe('platformAuthType', () => {
  describe('getAuthTypeFromPlatform', () => {
    it('returns LOGIN_WITH_GOOGLE for gemini-with-google-auth', () => {
      expect(getAuthTypeFromPlatform('gemini-with-google-auth')).toBe(AuthType.LOGIN_WITH_GOOGLE);
      expect(getAuthTypeFromPlatform('GEMINI-WITH-GOOGLE-AUTH')).toBe(AuthType.LOGIN_WITH_GOOGLE);
    });

    it('returns USE_ANTHROPIC for anthropic platforms', () => {
      expect(getAuthTypeFromPlatform('anthropic')).toBe(AuthType.USE_ANTHROPIC);
      expect(getAuthTypeFromPlatform('ANTHROPIC')).toBe(AuthType.USE_ANTHROPIC);
      expect(getAuthTypeFromPlatform('anthropic-api')).toBe(AuthType.USE_ANTHROPIC);
    });

    it('returns USE_ANTHROPIC for claude platforms', () => {
      expect(getAuthTypeFromPlatform('claude')).toBe(AuthType.USE_ANTHROPIC);
      expect(getAuthTypeFromPlatform('CLAUDE')).toBe(AuthType.USE_ANTHROPIC);
      expect(getAuthTypeFromPlatform('claude-3')).toBe(AuthType.USE_ANTHROPIC);
    });

    it('returns USE_BEDROCK for bedrock platforms', () => {
      expect(getAuthTypeFromPlatform('bedrock')).toBe(AuthType.USE_BEDROCK);
      expect(getAuthTypeFromPlatform('BEDROCK')).toBe(AuthType.USE_BEDROCK);
      expect(getAuthTypeFromPlatform('aws-bedrock')).toBe(AuthType.USE_BEDROCK);
    });

    it('returns USE_OPENAI for openai platforms', () => {
      expect(getAuthTypeFromPlatform('openai')).toBe(AuthType.USE_OPENAI);
      expect(getAuthTypeFromPlatform('OPENAI')).toBe(AuthType.USE_OPENAI);
      expect(getAuthTypeFromPlatform('openai-api')).toBe(AuthType.USE_OPENAI);
    });

    it('returns USE_OPENAI for OpenRouter', () => {
      expect(getAuthTypeFromPlatform('openrouter')).toBe(AuthType.USE_OPENAI);
      expect(getAuthTypeFromPlatform('OpenRouter')).toBe(AuthType.USE_OPENAI);
    });

    it('returns USE_OPENAI for DeepSeek', () => {
      expect(getAuthTypeFromPlatform('deepseek')).toBe(AuthType.USE_OPENAI);
      expect(getAuthTypeFromPlatform('DeepSeek')).toBe(AuthType.USE_OPENAI);
    });

    it('returns USE_OPENAI for new-api', () => {
      expect(getAuthTypeFromPlatform('new-api')).toBe(AuthType.USE_OPENAI);
      expect(getAuthTypeFromPlatform('NEW-API')).toBe(AuthType.USE_OPENAI);
    });

    it('returns USE_OPENAI for unknown platforms', () => {
      expect(getAuthTypeFromPlatform('unknown')).toBe(AuthType.USE_OPENAI);
      expect(getAuthTypeFromPlatform('custom-platform')).toBe(AuthType.USE_OPENAI);
    });

    it('returns USE_OPENAI for empty or null platform', () => {
      expect(getAuthTypeFromPlatform('')).toBe(AuthType.USE_OPENAI);
      expect(getAuthTypeFromPlatform(null as any)).toBe(AuthType.USE_OPENAI);
      expect(getAuthTypeFromPlatform(undefined as any)).toBe(AuthType.USE_OPENAI);
    });

    it('handles case-insensitive matching', () => {
      expect(getAuthTypeFromPlatform('AnThRoPiC')).toBe(AuthType.USE_ANTHROPIC);
      expect(getAuthTypeFromPlatform('BeDrOcK')).toBe(AuthType.USE_BEDROCK);
    });
  });

  describe('getProviderAuthType', () => {
    it('returns explicit auth_type when provided', () => {
      const provider = {
        platform: 'openai',
        auth_type: AuthType.USE_ANTHROPIC,
      };
      expect(getProviderAuthType(provider)).toBe(AuthType.USE_ANTHROPIC);
    });

    it('infers auth type from platform when auth_type not specified', () => {
      expect(getProviderAuthType({ platform: 'anthropic' })).toBe(AuthType.USE_ANTHROPIC);
      expect(getProviderAuthType({ platform: 'bedrock' })).toBe(AuthType.USE_BEDROCK);
      expect(getProviderAuthType({ platform: 'openai' })).toBe(AuthType.USE_OPENAI);
    });

    it('applies model_protocols override for new-api platform', () => {
      const provider = {
        platform: 'new-api',
        use_model: 'claude-3-opus',
        model_protocols: {
          'claude-3-opus': 'anthropic',
          'gpt-4': 'openai',
        },
      };
      expect(getProviderAuthType(provider)).toBe(AuthType.USE_ANTHROPIC);
    });

    it('falls back to platform inference when model not in model_protocols', () => {
      const provider = {
        platform: 'new-api',
        use_model: 'gpt-4',
        model_protocols: {
          'claude-3-opus': 'anthropic',
        },
      };
      expect(getProviderAuthType(provider)).toBe(AuthType.USE_OPENAI);
    });

    it('ignores model_protocols for non-new-api platforms', () => {
      const provider = {
        platform: 'openai',
        use_model: 'claude-3-opus',
        model_protocols: {
          'claude-3-opus': 'anthropic',
        },
      };
      expect(getProviderAuthType(provider)).toBe(AuthType.USE_OPENAI);
    });

    it('handles new-api without model_protocols', () => {
      const provider = {
        platform: 'new-api',
        use_model: 'gpt-4',
      };
      expect(getProviderAuthType(provider)).toBe(AuthType.USE_OPENAI);
    });

    it('handles new-api without use_model', () => {
      const provider = {
        platform: 'new-api',
        model_protocols: {
          'claude-3-opus': 'anthropic',
        },
      };
      expect(getProviderAuthType(provider)).toBe(AuthType.USE_OPENAI);
    });

    it('prefers explicit auth_type over model_protocols', () => {
      const provider = {
        platform: 'new-api',
        auth_type: AuthType.USE_BEDROCK,
        use_model: 'claude-3-opus',
        model_protocols: {
          'claude-3-opus': 'anthropic',
        },
      };
      expect(getProviderAuthType(provider)).toBe(AuthType.USE_BEDROCK);
    });

    it('handles model_protocols with bedrock protocol', () => {
      const provider = {
        platform: 'new-api',
        use_model: 'bedrock-model',
        model_protocols: {
          'bedrock-model': 'bedrock',
        },
      };
      expect(getProviderAuthType(provider)).toBe(AuthType.USE_BEDROCK);
    });
  });
});
