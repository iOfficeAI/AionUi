import { describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: (url: string) => {
    if (url.startsWith('ext://')) return url.replace('ext://', 'aion-asset://extensions/');
    return '';
  },
}));

import type { AssistantListItem } from '@/renderer/pages/settings/AssistantSettings/types';
import {
  filterAssistants,
  groupAssistantsByEnabled,
  isEmoji,
  resolveAvatarImageSrc,
  sortAssistants,
} from '@/renderer/pages/settings/AssistantSettings/assistantUtils';

// Helper to create a minimal AssistantListItem. The backend contract requires
// sortOrder, so default it to 0 and let callers override.
function makeAssistant(overrides: Partial<AssistantListItem> & { id: string; name: string }): AssistantListItem {
  return {
    enabled: true,
    sortOrder: 0,
    source: 'user',
    nameI18n: {},
    descriptionI18n: {},
    contextI18n: {},
    prompts: [],
    promptsI18n: {},
    models: [],
    enabledSkills: [],
    customSkillNames: [],
    disabledBuiltinSkills: [],
    presetAgentType: 'gemini',
    ...overrides,
  } as AssistantListItem;
}

// ---------------------------------------------------------------------------
// isEmoji
// ---------------------------------------------------------------------------
describe('isEmoji', () => {
  it('returns false for empty string', () => {
    expect(isEmoji('')).toBe(false);
  });

  it('returns true for a simple single emoji', () => {
    expect(isEmoji('🤖')).toBe(true);
  });

  it('returns false for plain ASCII text', () => {
    expect(isEmoji('hello')).toBe(false);
  });

  it('returns false for a mix of emoji and text', () => {
    expect(isEmoji('🤖 hello')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveAvatarImageSrc
// ---------------------------------------------------------------------------
describe('resolveAvatarImageSrc', () => {
  it('returns undefined when avatar is empty or missing', () => {
    expect(resolveAvatarImageSrc(undefined, {})).toBeUndefined();
    expect(resolveAvatarImageSrc('', {})).toBeUndefined();
    expect(resolveAvatarImageSrc('   ', {})).toBeUndefined();
  });

  it('returns a mapped static asset when the avatar key matches the map', () => {
    const map = { 'writer.svg': '/static/writer.svg' };
    expect(resolveAvatarImageSrc('writer.svg', map)).toBe('/static/writer.svg');
  });

  it('passes through http/https URLs as image sources', () => {
    expect(resolveAvatarImageSrc('https://cdn.example.com/a.png', {})).toBe('https://cdn.example.com/a.png');
  });

  it('passes through data: URIs as image sources', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo';
    expect(resolveAvatarImageSrc(dataUri, {})).toBe(dataUri);
  });

  it('resolves ext:// prefixed URLs through resolveExtensionAssetUrl', () => {
    expect(resolveAvatarImageSrc('ext://foo/bar.png', {})).toBe('aion-asset://extensions/foo/bar.png');
  });

  it('returns undefined when avatar is an emoji (not an image)', () => {
    expect(resolveAvatarImageSrc('🤖', {})).toBeUndefined();
  });

  it('returns undefined for bare strings that do not look like images', () => {
    expect(resolveAvatarImageSrc('writer', {})).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sortAssistants — sorts by sortOrder (backend already returns sorted)
// ---------------------------------------------------------------------------
describe('sortAssistants', () => {
  it('returns an empty array when given an empty array', () => {
    expect(sortAssistants([])).toEqual([]);
  });

  it('sorts by ascending sortOrder', () => {
    const input: AssistantListItem[] = [
      makeAssistant({ id: 'c', name: 'C', sortOrder: 20 }),
      makeAssistant({ id: 'a', name: 'A', sortOrder: 0 }),
      makeAssistant({ id: 'b', name: 'B', sortOrder: 10 }),
    ];

    expect(sortAssistants(input).map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const input: AssistantListItem[] = [
      makeAssistant({ id: 'c', name: 'C', sortOrder: 2 }),
      makeAssistant({ id: 'a', name: 'A', sortOrder: 0 }),
    ];
    const original = [...input];

    sortAssistants(input);
    expect(input.map((a) => a.id)).toEqual(original.map((a) => a.id));
  });

  it('preserves relative order for equal sortOrder values', () => {
    const input: AssistantListItem[] = [
      makeAssistant({ id: 'first', name: 'F', sortOrder: 5 }),
      makeAssistant({ id: 'second', name: 'S', sortOrder: 5 }),
    ];

    expect(sortAssistants(input).map((a) => a.id)).toEqual(['first', 'second']);
  });
});

// ---------------------------------------------------------------------------
// filterAssistants — filters by source / enabled / query
// ---------------------------------------------------------------------------
describe('filterAssistants', () => {
  const assistants: AssistantListItem[] = [
    makeAssistant({
      id: 'builtin-alpha',
      name: 'Alpha',
      nameI18n: { 'en-US': 'Alpha' },
      description: 'Word helper',
      source: 'builtin',
      enabled: true,
    }),
    makeAssistant({
      id: 'custom-beta',
      name: 'Beta',
      nameI18n: { 'en-US': 'Beta' },
      description: 'Sales helper',
      source: 'user',
      enabled: false,
    }),
    makeAssistant({
      id: 'ext-gamma',
      name: 'Gamma',
      nameI18n: { 'en-US': 'Gamma' },
      description: 'Extension helper',
      source: 'extension',
      enabled: true,
    }),
  ];

  it('returns all assistants for all filter without query', () => {
    expect(filterAssistants(assistants, '', 'all', 'en-US')).toHaveLength(3);
  });

  it('filters by enabled status', () => {
    expect(filterAssistants(assistants, '', 'enabled', 'en-US').map((a) => a.id)).toEqual([
      'builtin-alpha',
      'ext-gamma',
    ]);
  });

  it('filters by disabled status', () => {
    expect(filterAssistants(assistants, '', 'disabled', 'en-US').map((a) => a.id)).toEqual(['custom-beta']);
  });

  it('filters by source builtin / user / extension', () => {
    expect(filterAssistants(assistants, '', 'builtin', 'en-US').map((a) => a.id)).toEqual(['builtin-alpha']);
    expect(filterAssistants(assistants, '', 'user', 'en-US').map((a) => a.id)).toEqual(['custom-beta']);
    expect(filterAssistants(assistants, '', 'extension', 'en-US').map((a) => a.id)).toEqual(['ext-gamma']);
  });

  it('combines source filter with text query', () => {
    expect(filterAssistants(assistants, 'word', 'builtin', 'en-US').map((a) => a.id)).toEqual(['builtin-alpha']);
    expect(filterAssistants(assistants, 'word', 'user', 'en-US')).toEqual([]);
  });

  it('matches localized name or description', () => {
    expect(filterAssistants(assistants, 'gamma', 'all', 'en-US').map((a) => a.id)).toEqual(['ext-gamma']);
    expect(filterAssistants(assistants, 'sales', 'all', 'en-US').map((a) => a.id)).toEqual(['custom-beta']);
  });
});

// ---------------------------------------------------------------------------
// groupAssistantsByEnabled
// ---------------------------------------------------------------------------
describe('groupAssistantsByEnabled', () => {
  it('splits assistants into enabled and disabled groups', () => {
    const assistants: AssistantListItem[] = [
      makeAssistant({ id: 'alpha', name: 'Alpha', enabled: true }),
      makeAssistant({ id: 'beta', name: 'Beta', enabled: false }),
      makeAssistant({ id: 'gamma', name: 'Gamma', enabled: true }),
    ];

    expect(groupAssistantsByEnabled(assistants)).toEqual({
      enabledAssistants: [assistants[0], assistants[2]],
      disabledAssistants: [assistants[1]],
    });
  });

  it('treats undefined enabled as enabled (explicit === false disables)', () => {
    const assistants = [
      makeAssistant({ id: 'no-field', name: 'NF', enabled: undefined as unknown as boolean }),
      makeAssistant({ id: 'off', name: 'Off', enabled: false }),
    ];

    expect(groupAssistantsByEnabled(assistants)).toEqual({
      enabledAssistants: [assistants[0]],
      disabledAssistants: [assistants[1]],
    });
  });
});
