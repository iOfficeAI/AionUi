/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for common/adapter/searchMapper.ts (T2 in N3 test checklist).
 * Tests search result transformation from backend to frontend format.
 */

import { describe, it, expect } from 'vitest';
import { fromApiSearchResult, type ApiMessageSearchItem } from '@/common/adapter/searchMapper';
import type { PaginatedResult } from '@/common/adapter/ipcBridge';

describe('searchMapper', () => {
  describe('fromApiSearchResult', () => {
    it('preserves total and has_more fields', () => {
      const input: PaginatedResult<ApiMessageSearchItem> = {
        items: [],
        total: 42,
        has_more: true,
      };

      const result = fromApiSearchResult(input);

      expect(result.total).toBe(42);
      expect(result.has_more).toBe(true);
      expect(result.items).toHaveLength(0);
    });

    it('maps item with complete conversation fields including model', () => {
      const input: PaginatedResult<ApiMessageSearchItem> = {
        items: [
          {
            message_id: 'msg1',
            message_type: 'text',
            message_created_at: 1000,
            preview_text: 'hello',
            conversation: {
              id: 'conv1',
              name: 'Test Conv',
              type: 'normal',
              model: {
                provider_id: 'p1',
                model: 'm1',
              },
              status: 'active',
              source: 'user',
              pinned: true,
              pinned_at: 2000,
              channel_chat_id: 'ch1',
              created_at: 3000,
              modified_at: 4000,
              extra: { key: 'value' },
            },
          },
        ],
        total: 1,
        has_more: false,
      };

      const result = fromApiSearchResult(input);

      expect(result.items).toHaveLength(1);
      const item = result.items[0];

      expect(item.message_id).toBe('msg1');
      expect(item.message_type).toBe('text');
      expect(item.message_created_at).toBe(1000);
      expect(item.preview_text).toBe('hello');

      expect(item.conversation.id).toBe('conv1');
      expect(item.conversation.name).toBe('Test Conv');
      expect(item.conversation.model).toEqual({
        id: 'p1',
        platform: '',
        name: '',
        base_url: '',
        api_key: '',
        use_model: 'm1',
      });
    });

    it('handles conversation with null model field', () => {
      const input: PaginatedResult<ApiMessageSearchItem> = {
        items: [
          {
            message_id: 'msg1',
            message_type: 'text',
            message_created_at: 1000,
            preview_text: 'hello',
            conversation: {
              id: 'conv1',
              name: 'Test Conv',
              type: 'normal',
              model: null,
              status: 'active',
              pinned: false,
              created_at: 3000,
              modified_at: 4000,
              extra: {},
            },
          },
        ],
        total: 1,
        has_more: false,
      };

      const result = fromApiSearchResult(input);

      expect(result.items[0].conversation.model).toBeUndefined();
    });

    it('handles conversation with missing optional fields', () => {
      const input: PaginatedResult<ApiMessageSearchItem> = {
        items: [
          {
            message_id: 'msg1',
            message_type: 'text',
            message_created_at: 1000,
            preview_text: 'hello',
            conversation: {
              id: 'conv1',
              name: 'Test Conv',
              type: 'normal',
              status: 'active',
              pinned: false,
              created_at: 3000,
              modified_at: 4000,
              extra: {},
            },
          },
        ],
        total: 1,
        has_more: false,
      };

      const result = fromApiSearchResult(input);

      expect(result.items[0].conversation.id).toBe('conv1');
      expect(result.items[0].conversation.model).toBeUndefined();
    });

    it('passes message_type as TMessage type', () => {
      const input: PaginatedResult<ApiMessageSearchItem> = {
        items: [
          {
            message_id: 'msg1',
            message_type: 'assistant',
            message_created_at: 1000,
            preview_text: 'hello',
            conversation: {
              id: 'conv1',
              name: 'Test',
              type: 'normal',
              status: 'active',
              pinned: false,
              created_at: 3000,
              modified_at: 4000,
              extra: {},
            },
          },
        ],
        total: 1,
        has_more: false,
      };

      const result = fromApiSearchResult(input);

      expect(result.items[0].message_type).toBe('assistant');
    });

    it('maps multiple items correctly', () => {
      const input: PaginatedResult<ApiMessageSearchItem> = {
        items: [
          {
            message_id: 'msg1',
            message_type: 'text',
            message_created_at: 1000,
            preview_text: 'first',
            conversation: {
              id: 'conv1',
              name: 'Conv1',
              type: 'normal',
              status: 'active',
              pinned: false,
              created_at: 3000,
              modified_at: 4000,
              extra: {},
            },
          },
          {
            message_id: 'msg2',
            message_type: 'assistant',
            message_created_at: 2000,
            preview_text: 'second',
            conversation: {
              id: 'conv2',
              name: 'Conv2',
              type: 'normal',
              model: {
                provider_id: 'p2',
                model: 'm2',
              },
              status: 'active',
              pinned: true,
              created_at: 5000,
              modified_at: 6000,
              extra: {},
            },
          },
        ],
        total: 2,
        has_more: false,
      };

      const result = fromApiSearchResult(input);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].message_id).toBe('msg1');
      expect(result.items[0].preview_text).toBe('first');
      expect(result.items[0].conversation.model).toBeUndefined();

      expect(result.items[1].message_id).toBe('msg2');
      expect(result.items[1].preview_text).toBe('second');
      expect(result.items[1].conversation.model?.id).toBe('p2');
    });

    it('applies fromApiConversation transformation including custom_workspace inference', () => {
      const input: PaginatedResult<ApiMessageSearchItem> = {
        items: [
          {
            message_id: 'msg1',
            message_type: 'text',
            message_created_at: 1000,
            preview_text: 'hello',
            conversation: {
              id: 'conv1',
              name: 'Test',
              type: 'normal',
              status: 'active',
              pinned: false,
              created_at: 3000,
              modified_at: 4000,
              extra: {
                workspace: '/custom',
                is_temporary_workspace: false,
              },
            },
          },
        ],
        total: 1,
        has_more: false,
      };

      const result = fromApiSearchResult(input);

      // fromApiConversation should have inferred custom_workspace=true
      expect(result.items[0].conversation.extra?.custom_workspace).toBe(true);
    });
  });
});
