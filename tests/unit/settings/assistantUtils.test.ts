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
  resolveAssistantSourceTag,
  buildAssistantEditorBackends,
  filterAssistantEditorBackends,
} from '@/renderer/pages/settings/AssistantSettings/assistantUtils';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
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
  it('returns undefined for empty or whitespace-only input', () => {
    expect(resolveAvatarImageSrc('')).toBeUndefined();
    expect(resolveAvatarImageSrc('   ')).toBeUndefined();
    expect(resolveAvatarImageSrc(undefined)).toBeUndefined();
  });

  it('resolves extension URLs', () => {
    expect(resolveAvatarImageSrc('ext://icon.png')).toBe('https://extension.local/icon.png');
  });

  it('returns absolute HTTP URLs as-is', () => {
    expect(resolveAvatarImageSrc('https://example.com/avatar.png')).toBe('https://example.com/avatar.png');
    expect(resolveAvatarImageSrc('http://example.com/avatar.jpg')).toBe('http://example.com/avatar.jpg');
  });

  it('returns data URLs as-is', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGg';
    expect(resolveAvatarImageSrc(dataUrl)).toBe(dataUrl);
  });

  it('does not expose file URLs as image sources', () => {
    expect(resolveAvatarImageSrc('file:///path/to/avatar.png')).toBeUndefined();
  });

  it('returns absolute paths starting with slash', () => {
    expect(resolveAvatarImageSrc('/assets/avatar.png')).toBe('/assets/avatar.png');
  });

  it('returns valid image extensions', () => {
    expect(resolveAvatarImageSrc('avatar.svg')).toBe('avatar.svg');
    expect(resolveAvatarImageSrc('avatar.png')).toBe('avatar.png');
    expect(resolveAvatarImageSrc('avatar.jpg')).toBe('avatar.jpg');
    expect(resolveAvatarImageSrc('avatar.jpeg')).toBe('avatar.jpeg');
    expect(resolveAvatarImageSrc('avatar.webp')).toBe('avatar.webp');
    expect(resolveAvatarImageSrc('avatar.gif')).toBe('avatar.gif');
  });

  it('returns undefined for non-image strings', () => {
    expect(resolveAvatarImageSrc('😀')).toBeUndefined();
    expect(resolveAvatarImageSrc('SomeText')).toBeUndefined();
    expect(resolveAvatarImageSrc('avatar.txt')).toBeUndefined();
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
      source: 'user',
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
    expect(filterAssistants(assistants, '', 'user', 'en').map((a) => a.id)).toEqual(['a2', 'a3', 'a4']);
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

describe('resolveAssistantSourceTag', () => {
  it('shows the built-in tag for builtin assistants', () => {
    expect(resolveAssistantSourceTag('builtin')).toBe('builtin');
  });

  it('shows the custom tag for user assistants', () => {
    expect(resolveAssistantSourceTag('user')).toBe('custom');
  });

  it('shows the CLI tag for generated assistants', () => {
    expect(resolveAssistantSourceTag('generated')).toBe('cli');
  });
});

describe('buildAssistantEditorBackends', () => {
  const agent = (over: Partial<ManagedAgent>): ManagedAgent =>
    ({
      id: 'agent-1',
      name: 'Agent One',
      agent_type: 'acp',
      backend: 'claude',
      status: 'online',
      enabled: true,
      ...over,
    }) as ManagedAgent;

  /**
   * Antigravity is a first-class agent type (agy is a direct-CLI integration,
   * one process per turn), not an `acp` backend. It was absent from the editor's
   * type whitelist, which produced two bugs at once: no Antigravity row in the
   * Agent dropdown, and the editor showing the raw agent id (`a9f3c21e`) where
   * the name belongs — `Select` renders the bare value when no Option matches.
   */
  it('offers every agent type the editor can drive, antigravity included', () => {
    const backends = buildAssistantEditorBackends(
      [
        agent({ id: 'acp-1', agent_type: 'acp', name: 'Claude Code' }),
        agent({ id: 'a9f3c21e', agent_type: 'antigravity', backend: 'antigravity', name: 'Antigravity' }),
        agent({ id: 'aionrs-1', agent_type: 'aionrs', backend: 'aionrs', name: 'Aion CLI' }),
      ],
      'zh-CN'
    );

    expect(backends.map((b) => b.id)).toEqual(['acp-1', 'a9f3c21e', 'aionrs-1']);
    const antigravity = backends.find((b) => b.id === 'a9f3c21e');
    expect(antigravity?.name).toBe('Antigravity');
    expect(antigravity?.runtimeKey).toBe('antigravity');
  });

  /**
   * The name lookup the editor does. Without a matching entry the field falls
   * back to the raw id, which is exactly what the user saw.
   */
  it('lets the editor resolve a name for the selected agent', () => {
    const backends = buildAssistantEditorBackends(
      [agent({ id: 'a9f3c21e', agent_type: 'antigravity', backend: 'antigravity', name: 'Antigravity' })],
      'zh-CN',
      'a9f3c21e'
    );

    expect(backends.find((b) => b.id === 'a9f3c21e')).toBeDefined();
  });

  /** Legacy read-only types stay out — they exist so old rows render, not to be driven. */
  it('leaves legacy and non-editor types out', () => {
    const backends = buildAssistantEditorBackends(
      [
        agent({ id: 'legacy-gemini', agent_type: 'gemini' }),
        agent({ id: 'legacy-codex', agent_type: 'codex' }),
        agent({ id: 'gateway', agent_type: 'openclaw-gateway' }),
      ],
      'zh-CN'
    );

    expect(backends).toHaveLength(0);
  });
});

describe('filterAssistantEditorBackends', () => {
  const backends = [
    { id: '2d23ff1c', name: 'Claude Code', runtimeKey: 'claude', modelOptions: [] },
    { id: 'a9f3c21e', name: 'Antigravity', runtimeKey: 'antigravity', modelOptions: [] },
    { id: '8e1acf31', name: 'Codex CLI', runtimeKey: 'codex', modelOptions: [] },
  ] as Parameters<typeof filterAssistantEditorBackends>[0];

  it('returns everything for an empty or blank query', () => {
    expect(filterAssistantEditorBackends(backends, '')).toHaveLength(3);
    expect(filterAssistantEditorBackends(backends, '   ')).toHaveLength(3);
  });

  it('matches the display name, case-insensitively', () => {
    expect(filterAssistantEditorBackends(backends, 'anti').map((b) => b.id)).toEqual(['a9f3c21e']);
    expect(filterAssistantEditorBackends(backends, 'CLAUDE').map((b) => b.id)).toEqual(['2d23ff1c']);
  });

  /**
   * The reason the runtime key is searched at all: users refer to these agents
   * by their CLI name, which is not always what the row is labelled — "codex"
   * finds "Codex CLI", and "antigravity" finds it whatever the label says.
   */
  it('matches the runtime key and the id', () => {
    expect(filterAssistantEditorBackends(backends, 'codex').map((b) => b.id)).toEqual(['8e1acf31']);
    expect(filterAssistantEditorBackends(backends, 'a9f3').map((b) => b.id)).toEqual(['a9f3c21e']);
  });

  it('returns nothing when nothing matches, rather than falling back to everything', () => {
    expect(filterAssistantEditorBackends(backends, 'zzz')).toHaveLength(0);
  });
});
