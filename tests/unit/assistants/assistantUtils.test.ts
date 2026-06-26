/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/pages/settings/AssistantSettings/assistantUtils.ts (A5 in N4a).
 * Tests pure utility functions for assistant list filtering, sorting, and avatar resolution.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildAssistantSortUpdates,
  isEmoji,
  reorderAssistantList,
  resolveAvatarImageSrc,
  sortAssistants,
  filterAssistants,
  groupAssistantsByEnabled,
} from '@/renderer/pages/settings/AssistantSettings/assistantUtils';
import type { AssistantListItem } from '@/renderer/pages/settings/AssistantSettings/types';

// Mock resolveExtensionAssetUrl
vi.mock('@/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: vi.fn((url: string) => {
    if (url.startsWith('ext://')) return `resolved-${url}`;
    if (url.startsWith('/api/assistants/')) return `http://127.0.0.1:13400${url}`;
    return null;
  }),
}));

describe('assistantUtils', () => {
  describe('isEmoji', () => {
    it('returns true for single emoji', () => {
      expect(isEmoji('😀')).toBe(true);
      expect(isEmoji('🎉')).toBe(true);
      expect(isEmoji('❤️')).toBe(true);
    });

    it('returns false for non-emoji strings', () => {
      expect(isEmoji('abc')).toBe(false);
      expect(isEmoji('123')).toBe(false);
      expect(isEmoji('😀abc')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isEmoji('')).toBe(false);
    });
  });

  describe('resolveAvatarImageSrc', () => {
    it('returns undefined for empty/undefined avatar', () => {
      expect(resolveAvatarImageSrc(undefined)).toBeUndefined();
      expect(resolveAvatarImageSrc('')).toBeUndefined();
      expect(resolveAvatarImageSrc('   ')).toBeUndefined();
    });

    it('resolves extension asset URLs', () => {
      expect(resolveAvatarImageSrc('ext://my-extension/icon.svg')).toBe('resolved-ext://my-extension/icon.svg');
    });

    it('returns valid image URLs', () => {
      expect(resolveAvatarImageSrc('logo.png')).toBe('logo.png');
      expect(resolveAvatarImageSrc('https://example.com/icon.jpg')).toBe('https://example.com/icon.jpg');
      expect(resolveAvatarImageSrc('data:image/png;base64,xyz')).toBe('data:image/png;base64,xyz');
    });

    it('does not expose local absolute paths as image sources', () => {
      expect(resolveAvatarImageSrc('/Users/demo/avatar.png')).toBeUndefined();
      expect(resolveAvatarImageSrc('/path/icon.svg')).toBeUndefined();
    });

    it('resolves backend-served assistant avatar routes', () => {
      expect(resolveAvatarImageSrc('/api/assistants/u1/avatar')).toBe(
        'http://127.0.0.1:13400/api/assistants/u1/avatar'
      );
    });

    it('returns undefined for non-image strings', () => {
      expect(resolveAvatarImageSrc('not-an-image')).toBeUndefined();
      expect(resolveAvatarImageSrc('text')).toBeUndefined();
    });
  });

  describe('sortAssistants', () => {
    it('sorts assistants by sort_order ascending', () => {
      const list: AssistantListItem[] = [
        { id: 'a', name: 'A', sort_order: 3, source: 'user', enabled: true },
        { id: 'b', name: 'B', sort_order: 1, source: 'user', enabled: true },
        { id: 'c', name: 'C', sort_order: 2, source: 'user', enabled: true },
      ];
      const sorted = sortAssistants(list);
      expect(sorted.map((a) => a.id)).toEqual(['b', 'c', 'a']);
    });

    it('returns empty array for empty input', () => {
      expect(sortAssistants([])).toEqual([]);
    });

    it('does not mutate original array', () => {
      const list: AssistantListItem[] = [
        { id: 'a', name: 'A', sort_order: 2, source: 'user', enabled: true },
        { id: 'b', name: 'B', sort_order: 1, source: 'user', enabled: true },
      ];
      const original = [...list];
      sortAssistants(list);
      expect(list).toEqual(original);
    });

    it('handles stable sorting for equal sort_order', () => {
      const list: AssistantListItem[] = [
        { id: 'a', name: 'A', sort_order: 1, source: 'user', enabled: true },
        { id: 'b', name: 'B', sort_order: 1, source: 'user', enabled: true },
      ];
      const sorted = sortAssistants(list);
      expect(sorted.map((a) => a.id)).toEqual(['a', 'b']); // stable: input order preserved
    });
  });

  describe('reorderAssistantList', () => {
    it('moves the dragged assistant before the target assistant', () => {
      const list: AssistantListItem[] = [
        { id: 'a', name: 'A', sort_order: 1, source: 'user', enabled: true },
        { id: 'b', name: 'B', sort_order: 2, source: 'user', enabled: true },
        { id: 'c', name: 'C', sort_order: 3, source: 'user', enabled: true },
      ];

      const reordered = reorderAssistantList(list, 'c', 'a');
      expect(reordered.map((assistant) => assistant.id)).toEqual(['c', 'a', 'b']);
    });

    it('returns the original order when ids are missing', () => {
      const list: AssistantListItem[] = [
        { id: 'a', name: 'A', sort_order: 1, source: 'user', enabled: true },
        { id: 'b', name: 'B', sort_order: 2, source: 'user', enabled: true },
      ];

      expect(reorderAssistantList(list, 'missing', 'b').map((assistant) => assistant.id)).toEqual(['a', 'b']);
      expect(reorderAssistantList(list, 'a', 'missing').map((assistant) => assistant.id)).toEqual(['a', 'b']);
    });
  });

  describe('buildAssistantSortUpdates', () => {
    it('assigns deterministic sort_order values after reorder', () => {
      const previous: AssistantListItem[] = [
        { id: 'a', name: 'A', sort_order: 1, source: 'user', enabled: true },
        { id: 'b', name: 'B', sort_order: 2, source: 'user', enabled: true },
        { id: 'c', name: 'C', sort_order: 3, source: 'user', enabled: true },
      ];
      const next: AssistantListItem[] = [
        { id: 'c', name: 'C', sort_order: 3, source: 'user', enabled: true },
        { id: 'a', name: 'A', sort_order: 1, source: 'user', enabled: true },
        { id: 'b', name: 'B', sort_order: 2, source: 'user', enabled: true },
      ];

      expect(buildAssistantSortUpdates(previous, next)).toEqual([
        { id: 'c', sort_order: 1000 },
        { id: 'a', sort_order: 2000 },
        { id: 'b', sort_order: 3000 },
      ]);
    });

    it('returns no updates when the effective sort order is unchanged', () => {
      const previous: AssistantListItem[] = [
        { id: 'a', name: 'A', sort_order: 1000, source: 'user', enabled: true },
        { id: 'b', name: 'B', sort_order: 2000, source: 'user', enabled: true },
      ];

      expect(buildAssistantSortUpdates(previous, previous)).toEqual([]);
    });
  });

  describe('filterAssistants', () => {
    const assistants: AssistantListItem[] = [
      { id: '1', name: 'Claude', description: 'AI assistant', sort_order: 1, source: 'builtin', enabled: true },
      { id: '2', name: 'GPT', description: 'OpenAI model', sort_order: 2, source: 'builtin', enabled: false },
      { id: '3', name: 'MyCustom', description: 'User assistant', sort_order: 3, source: 'user', enabled: true },
    ];

    it('returns all assistants when filter is "all" and no query', () => {
      expect(filterAssistants(assistants, '', 'all', 'en')).toHaveLength(3);
    });

    it('filters by enabled status', () => {
      expect(filterAssistants(assistants, '', 'enabled', 'en')).toHaveLength(2);
      expect(filterAssistants(assistants, '', 'disabled', 'en')).toHaveLength(1);
    });

    it('filters by source', () => {
      expect(filterAssistants(assistants, '', 'builtin', 'en')).toHaveLength(2);
      expect(filterAssistants(assistants, '', 'user', 'en')).toHaveLength(1);
    });

    it('filters by search query (case-insensitive)', () => {
      expect(filterAssistants(assistants, 'claude', 'all', 'en').map((a) => a.id)).toEqual(['1']);
      expect(filterAssistants(assistants, 'ASSISTANT', 'all', 'en').map((a) => a.id)).toEqual(['1', '3']);
    });

    it('combines query and filter', () => {
      const result = filterAssistants(assistants, 'claude', 'builtin', 'en');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('supports i18n name/description search', () => {
      const i18nList: AssistantListItem[] = [
        {
          id: '1',
          name: 'Claude',
          name_i18n: { zh: '克劳德' },
          description: 'AI',
          sort_order: 1,
          source: 'builtin',
          enabled: true,
        },
      ];
      expect(filterAssistants(i18nList, '克劳德', 'all', 'zh')).toHaveLength(1);
      expect(filterAssistants(i18nList, 'claude', 'all', 'zh')).toHaveLength(0); // i18n text doesn't contain "claude"
    });
  });

  describe('groupAssistantsByEnabled', () => {
    it('splits assistants into enabled and disabled groups', () => {
      const list: AssistantListItem[] = [
        { id: '1', name: 'A', sort_order: 1, source: 'user', enabled: true },
        { id: '2', name: 'B', sort_order: 2, source: 'user', enabled: false },
        { id: '3', name: 'C', sort_order: 3, source: 'user', enabled: true },
      ];
      const { enabledAssistants, disabledAssistants } = groupAssistantsByEnabled(list);
      expect(enabledAssistants.map((a) => a.id)).toEqual(['1', '3']);
      expect(disabledAssistants.map((a) => a.id)).toEqual(['2']);
    });

    it('handles all enabled assistants', () => {
      const list: AssistantListItem[] = [{ id: '1', name: 'A', sort_order: 1, source: 'user', enabled: true }];
      const { enabledAssistants, disabledAssistants } = groupAssistantsByEnabled(list);
      expect(enabledAssistants).toHaveLength(1);
      expect(disabledAssistants).toHaveLength(0);
    });

    it('treats undefined enabled as true', () => {
      const list: AssistantListItem[] = [
        { id: '1', name: 'A', sort_order: 1, source: 'user', enabled: undefined as any },
      ];
      const { enabledAssistants, disabledAssistants } = groupAssistantsByEnabled(list);
      expect(enabledAssistants).toHaveLength(1);
      expect(disabledAssistants).toHaveLength(0);
    });
  });
});
