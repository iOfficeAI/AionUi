/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for common/adapter/apiModelMapper.ts (T1 in N3 test checklist).
 * Tests model transformation between frontend and backend formats.
 */

import { describe, it, expect } from 'vitest';
import {
  toApiModel,
  toApiModelOptional,
  fromApiModel,
  fromApiConversation,
  fromApiPaginatedConversations,
  type ApiProviderWithModel,
} from '@/common/adapter/apiModelMapper';
import type { TProviderWithModel } from '@/common/config/storage';

describe('apiModelMapper', () => {
  describe('toApiModel', () => {
    it('maps required fields from frontend to backend format', () => {
      const input: TProviderWithModel = {
        id: 'openai',
        use_model: 'gpt-5',
        platform: 'openai',
        name: 'x',
        base_url: 'y',
        api_key: 'z',
      };

      const result = toApiModel(input);

      expect(result).toEqual({
        provider_id: 'openai',
        model: 'gpt-5',
      });
      // Ensure no extra fields
      expect(Object.keys(result)).toEqual(['provider_id', 'model']);
    });
  });

  describe('toApiModelOptional', () => {
    it('returns undefined when input is undefined', () => {
      expect(toApiModelOptional(undefined)).toBeUndefined();
    });

    it('returns undefined when id is empty', () => {
      const input = {
        id: '',
        use_model: 'gpt',
        platform: 'openai',
        name: 'x',
        base_url: 'y',
        api_key: 'z',
      } as TProviderWithModel;

      expect(toApiModelOptional(input)).toBeUndefined();
    });

    it('returns undefined when id is whitespace', () => {
      const input = {
        id: '   ',
        use_model: 'gpt',
        platform: 'openai',
        name: 'x',
        base_url: 'y',
        api_key: 'z',
      } as TProviderWithModel;

      expect(toApiModelOptional(input)).toBeUndefined();
    });

    it('returns undefined when use_model is empty', () => {
      const input = {
        id: 'x',
        use_model: '',
        platform: 'openai',
        name: 'x',
        base_url: 'y',
        api_key: 'z',
      } as TProviderWithModel;

      expect(toApiModelOptional(input)).toBeUndefined();
    });

    it('returns undefined when use_model is whitespace', () => {
      const input = {
        id: 'x',
        use_model: '  ',
        platform: 'openai',
        name: 'x',
        base_url: 'y',
        api_key: 'z',
      } as TProviderWithModel;

      expect(toApiModelOptional(input)).toBeUndefined();
    });

    it('maps to ApiProviderWithModel when complete', () => {
      const input = {
        id: 'x',
        use_model: 'gpt',
        platform: 'openai',
        name: 'x',
        base_url: 'y',
        api_key: 'z',
      } as TProviderWithModel;

      const result = toApiModelOptional(input);

      expect(result).toEqual({
        provider_id: 'x',
        model: 'gpt',
      });
    });
  });

  describe('fromApiModel', () => {
    it('maps backend format to frontend and fills empty provider fields', () => {
      const input: ApiProviderWithModel = {
        provider_id: 'p',
        model: 'm',
      };

      const result = fromApiModel(input);

      expect(result).toEqual({
        id: 'p',
        platform: '',
        name: '',
        base_url: '',
        api_key: '',
        use_model: 'm',
      });
    });

    it('uses use_model field when present instead of model', () => {
      const input: ApiProviderWithModel = {
        provider_id: 'p',
        model: 'm-fallback',
        use_model: 'm-primary',
      };

      const result = fromApiModel(input);

      expect(result.use_model).toBe('m-primary');
    });

    it('falls back to model field when use_model is not present', () => {
      const input: ApiProviderWithModel = {
        provider_id: 'p',
        model: 'm-fallback',
      };

      const result = fromApiModel(input);

      expect(result.use_model).toBe('m-fallback');
    });
  });

  describe('fromApiConversation', () => {
    it('transforms model from ApiProviderWithModel to TProviderWithModel', () => {
      const raw = {
        id: 'conv1',
        model: {
          provider_id: 'p',
          model: 'm',
        } as ApiProviderWithModel,
      };

      const result = fromApiConversation(raw);

      expect(result.model).toEqual({
        id: 'p',
        platform: '',
        name: '',
        base_url: '',
        api_key: '',
        use_model: 'm',
      });
    });

    it('handles missing model field', () => {
      const raw = {
        id: 'conv1',
      };

      const result = fromApiConversation(raw);

      expect(result.model).toBeUndefined();
    });

    it('handles null model field', () => {
      const raw = {
        id: 'conv1',
        model: null,
      };

      const result = fromApiConversation(raw);

      expect(result.model).toBeUndefined();
    });

    it('infers custom_workspace=true when workspace is non-empty and not temporary', () => {
      const raw = {
        id: 'conv1',
        extra: {
          workspace: '/tmp',
          is_temporary_workspace: false,
        },
      };

      const result = fromApiConversation(raw);

      expect(result.extra?.custom_workspace).toBe(true);
    });

    it('infers custom_workspace=false when is_temporary_workspace=true', () => {
      const raw = {
        id: 'conv1',
        extra: {
          workspace: '/tmp',
          is_temporary_workspace: true,
        },
      };

      const result = fromApiConversation(raw);

      expect(result.extra?.custom_workspace).toBe(false);
    });

    it('infers custom_workspace=false when workspace is empty string', () => {
      const raw = {
        id: 'conv1',
        extra: {
          workspace: '',
          is_temporary_workspace: false,
        },
      };

      const result = fromApiConversation(raw);

      expect(result.extra?.custom_workspace).toBe(false);
    });

    it('does not overwrite existing custom_workspace field', () => {
      const raw = {
        id: 'conv1',
        extra: {
          workspace: '/tmp',
          is_temporary_workspace: false,
          custom_workspace: true,
        },
      };

      const result = fromApiConversation(raw);

      // Should preserve the existing value
      expect(result.extra?.custom_workspace).toBe(true);
    });

    it('returns input unchanged for non-object types', () => {
      expect(fromApiConversation(null)).toBeNull();
      expect(fromApiConversation(undefined)).toBeUndefined();
      expect(fromApiConversation('string')).toBe('string');
      expect(fromApiConversation(123)).toBe(123);
    });
  });

  describe('fromApiPaginatedConversations', () => {
    it('maps items through fromApiConversation and preserves total/has_more', () => {
      const input = {
        items: [
          {
            id: 'conv1',
            model: {
              provider_id: 'p1',
              model: 'm1',
            } as ApiProviderWithModel,
          },
          {
            id: 'conv2',
          },
        ],
        total: 2,
        has_more: false,
      };

      const result = fromApiPaginatedConversations(input);

      expect(result.total).toBe(2);
      expect(result.has_more).toBe(false);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].model).toEqual({
        id: 'p1',
        platform: '',
        name: '',
        base_url: '',
        api_key: '',
        use_model: 'm1',
      });
      expect(result.items[1].model).toBeUndefined();
    });

    it('handles empty items array', () => {
      const input = {
        items: [],
        total: 0,
        has_more: false,
      };

      const result = fromApiPaginatedConversations(input);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.has_more).toBe(false);
    });
  });
});
