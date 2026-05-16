/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isEmoji,
  resolveAvatarImageSrc,
  sortAssistants,
  filterAssistants,
  groupAssistantsByEnabled,
} from '@/renderer/pages/settings/AssistantSettings/assistantUtils';
import type { AssistantListItem } from '@/renderer/pages/settings/AssistantSettings/types';

vi.mock('@/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: (url: string) => {
    if (url.startsWith('ext://')) return url.replace('ext://', 'https://extension.local/');
    return null;
  },
}));

const mockAssistant = (overrides?: Partial<AssistantListItem>): AssistantListItem => ({
  id: 'assistant-1',
  name: 'Test Assistant',
  description: 'A test assistant',
  enabled: true,
  source: 'user',
  sort_order: 0,
  ...overrides,
});

describe('isEmoji', () => {
  it('returns true for single emoji', () => {
    expect(isEmoji('😀')).toBe(true);
    expect(isEmoji('👍')).toBe(true);
    expect(isEmoji('🎉')).toBe(true);
  });

  it('returns true for emoji with variation selector', () => {
    expect(isEmoji('❤️')).toBe(true);
  });

  it('returns true for compound emoji (ZWJ sequence)', () => {
    expect(isEmoji('👨‍👩‍👦')).toBe(true);
  });

  it('returns false for non-emoji strings', () => {
    expect(isEmoji('a')).toBe(false);
    expect(isEmoji('test')).toBe(false);
    expect(isEmoji('123')).toBe(false);
  });

  it('returns false for empty or undefined', () => {
    expect(isEmoji('')).toBe(false);
    expect(isEmoji(undefined as any)).toBe(false);
  });

  it('returns false for emoji mixed with text', () => {
    expect(isEmoji('😀abc')).toBe(false);
    expect(isEmoji('a😀')).toBe(false);
  });
});

describe('resolveAvatarImageSrc', () => {
  const avatarImageMap = {
    placeholder: 'https://example.com/placeholder.png',
    avatar1: 'https://example.com/avatar1.png',
  };

  it('returns mapped value if avatar matches map key', () => {
    expect(resolveAvatarImageSrc('placeholder', avatarImageMap)).toBe('https://example.com/placeholder.png');
    expect(resolveAvatarImageSrc('avatar1', avatarImageMap)).toBe('https://example.com/avatar1.png');
  });

  it('returns undefined for empty or whitespace-only input', () => {
    expect(resolveAvatarImageSrc('', avatarImageMap)).toBeUndefined();
    expect(resolveAvatarImageSrc('   ', avatarImageMap)).toBeUndefined();
    expect(resolveAvatarImageSrc(undefined, avatarImageMap)).toBeUndefined();
  });

  it('resolves extension URLs', () => {
    expect(resolveAvatarImageSrc('ext://icon.png', avatarImageMap)).toBe('https://extension.local/icon.png');
  });

  it('returns absolute HTTP URLs as-is', () => {
    expect(resolveAvatarImageSrc('https://example.com/avatar.png', avatarImageMap)).toBe(
      'https://example.com/avatar.png'
    );
    expect(resolveAvatarImageSrc('http://example.com/avatar.jpg', avatarImageMap)).toBe(
      'http://example.com/avatar.jpg'
    );
  });

  it('returns data URLs as-is', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGg';
    expect(resolveAvatarImageSrc(dataUrl, avatarImageMap)).toBe(dataUrl);
  });

  it('returns file URLs as-is', () => {
    expect(resolveAvatarImageSrc('file:///path/to/avatar.png', avatarImageMap)).toBe('file:///path/to/avatar.png');
  });

  it('returns absolute paths starting with slash', () => {
    expect(resolveAvatarImageSrc('/assets/avatar.png', avatarImageMap)).toBe('/assets/avatar.png');
  });

  it('returns valid image extensions', () => {
    expect(resolveAvatarImageSrc('avatar.svg', avatarImageMap)).toBe('avatar.svg');
    expect(resolveAvatarImageSrc('avatar.png', avatarImageMap)).toBe('avatar.png');
    expect(resolveAvatarImageSrc('avatar.jpg', avatarImageMap)).toBe('avatar.jpg');
    expect(resolveAvatarImageSrc('avatar.jpeg', avatarImageMap)).toBe('avatar.jpeg');
    expect(resolveAvatarImageSrc('avatar.webp', avatarImageMap)).toBe('avatar.webp');
    expect(resolveAvatarImageSrc('avatar.gif', avatarImageMap)).toBe('avatar.gif');
  });

  it('returns undefined for non-image strings', () => {
    expect(resolveAvatarImageSrc('😀', avatarImageMap)).toBeUndefined();
    expect(resolveAvatarImageSrc('SomeText', avatarImageMap)).toBeUndefined();
    expect(resolveAvatarImageSrc('avatar.txt', avatarImageMap)).toBeUndefined();
  });
});

describe('sortAssistants', () => {
  it('sorts assistants by sort_order ascending', () => {
    const assistants = [
      mockAssistant({ id: 'a', sort_order: 2 }),
      mockAssistant({ id: 'b', sort_order: 0 }),
      mockAssistant({ id: 'c', sort_order: 1 }),
    ];
    const sorted = sortAssistants(assistants);
    expect(sorted.map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns a new array without mutating the original', () => {
    const assistants = [mockAssistant({ sort_order: 2 }), mockAssistant({ sort_order: 1 })];
    const sorted = sortAssistants(assistants);
    expect(sorted).not.toBe(assistants);
    expect(assistants[0].sort_order).toBe(2);
  });

  it('handles empty array', () => {
    expect(sortAssistants([])).toEqual([]);
  });
});

describe('filterAssistants', () => {
  const assistants: AssistantListItem[] = [
    mockAssistant({ id: 'a1', name: 'Alpha', description: 'First assistant', enabled: true, source: 'builtin' }),
    mockAssistant({ id: 'a2', name: 'Beta', description: 'Second assistant', enabled: false, source: 'user' }),
    mockAssistant({
      id: 'a3',
      name: 'Gamma',
      description: 'Third assistant',
      enabled: true,
      source: 'extension',
      name_i18n: { zh: '伽马助手' },
    }),
    mockAssistant({ id: 'a4', name: 'Delta', description: 'Fourth', enabled: false, source: 'user' }),
  ];

  it('filters by search query (case-insensitive)', () => {
    expect(filterAssistants(assistants, 'alpha', 'all', 'en').map((a) => a.id)).toEqual(['a1']);
    expect(filterAssistants(assistants, 'BETA', 'all', 'en').map((a) => a.id)).toEqual(['a2']);
    expect(filterAssistants(assistants, 'assistant', 'all', 'en').map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('searches in i18n fields when locale matches', () => {
    expect(filterAssistants(assistants, '伽马', 'all', 'zh').map((a) => a.id)).toEqual(['a3']);
  });

  it('filters by enabled status', () => {
    expect(filterAssistants(assistants, '', 'enabled', 'en').map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(filterAssistants(assistants, '', 'disabled', 'en').map((a) => a.id)).toEqual(['a2', 'a4']);
  });

  it('filters by source', () => {
    expect(filterAssistants(assistants, '', 'builtin', 'en').map((a) => a.id)).toEqual(['a1']);
    expect(filterAssistants(assistants, '', 'user', 'en').map((a) => a.id)).toEqual(['a2', 'a4']);
    expect(filterAssistants(assistants, '', 'extension', 'en').map((a) => a.id)).toEqual(['a3']);
  });

  it('combines search and filter', () => {
    expect(filterAssistants(assistants, 'assistant', 'enabled', 'en').map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(filterAssistants(assistants, 'delta', 'user', 'en').map((a) => a.id)).toEqual(['a4']);
  });

  it('returns all when filter is "all" and no query', () => {
    expect(filterAssistants(assistants, '', 'all', 'en').map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  it('trims whitespace from query', () => {
    expect(filterAssistants(assistants, '  alpha  ', 'all', 'en').map((a) => a.id)).toEqual(['a1']);
  });

  it('returns empty array when no matches', () => {
    expect(filterAssistants(assistants, 'nonexistent', 'all', 'en')).toEqual([]);
  });
});

describe('groupAssistantsByEnabled', () => {
  it('groups assistants by enabled status', () => {
    const assistants = [
      mockAssistant({ id: 'a1', enabled: true }),
      mockAssistant({ id: 'a2', enabled: false }),
      mockAssistant({ id: 'a3', enabled: true }),
      mockAssistant({ id: 'a4', enabled: false }),
    ];
    const { enabledAssistants, disabledAssistants } = groupAssistantsByEnabled(assistants);
    expect(enabledAssistants.map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(disabledAssistants.map((a) => a.id)).toEqual(['a2', 'a4']);
  });

  it('treats undefined enabled as enabled (default)', () => {
    const assistants = [mockAssistant({ id: 'a1', enabled: undefined as any })];
    const { enabledAssistants, disabledAssistants } = groupAssistantsByEnabled(assistants);
    expect(enabledAssistants.map((a) => a.id)).toEqual(['a1']);
    expect(disabledAssistants).toEqual([]);
  });

  it('handles empty array', () => {
    const { enabledAssistants, disabledAssistants } = groupAssistantsByEnabled([]);
    expect(enabledAssistants).toEqual([]);
    expect(disabledAssistants).toEqual([]);
  });

  it('handles all enabled', () => {
    const assistants = [mockAssistant({ id: 'a1', enabled: true }), mockAssistant({ id: 'a2', enabled: true })];
    const { enabledAssistants, disabledAssistants } = groupAssistantsByEnabled(assistants);
    expect(enabledAssistants.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(disabledAssistants).toEqual([]);
  });

  it('handles all disabled', () => {
    const assistants = [mockAssistant({ id: 'a1', enabled: false }), mockAssistant({ id: 'a2', enabled: false })];
    const { enabledAssistants, disabledAssistants } = groupAssistantsByEnabled(assistants);
    expect(enabledAssistants).toEqual([]);
    expect(disabledAssistants.map((a) => a.id)).toEqual(['a1', 'a2']);
  });
});
