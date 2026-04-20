import { describe, expect, it, vi } from 'vitest';

// vi.hoisted ensures the variable is available when vi.mock factories run (hoisted above imports)
const MOCK_PRESETS = vi.hoisted(() => [
  {
    id: 'alpha',
    avatar: 'A',
    ruleFiles: { 'en-US': 'alpha.md' },
    defaultEnabledSkills: ['skill-a'],
    nameI18n: { 'en-US': 'Alpha' },
    descriptionI18n: { 'en-US': 'Alpha assistant' },
  },
  {
    id: 'beta',
    avatar: 'B',
    ruleFiles: { 'en-US': 'beta.md' },
    skillFiles: { 'en-US': 'beta-skills.md' },
    nameI18n: { 'en-US': 'Beta' },
    descriptionI18n: { 'en-US': 'Beta assistant' },
  },
  {
    id: 'gamma',
    avatar: 'G',
    ruleFiles: { 'en-US': 'gamma.md' },
    nameI18n: { 'en-US': 'Gamma' },
    descriptionI18n: { 'en-US': 'Gamma assistant' },
  },
]);

vi.mock('@/common/config/presets/assistantPresets', () => ({
  ASSISTANT_PRESETS: MOCK_PRESETS,
}));

vi.mock('@/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: (url: string) => {
    if (url.startsWith('ext://')) return url.replace('ext://', 'aion-asset://extensions/');
    return '';
  },
}));

import type { AssistantListItem } from '@/renderer/pages/settings/AssistantSettings/types';
import {
  filterAssistants,
  getAssistantSource,
  groupAssistantsByEnabled,
  hasBuiltinSkills,
  isExtensionAssistant,
  normalizeExtensionAssistants,
  sortAssistants,
} from '@/renderer/pages/settings/AssistantSettings/assistantUtils';

// Helper to create a minimal AssistantListItem
function makeAssistant(overrides: Partial<AssistantListItem> & { id: string; name: string }): AssistantListItem {
  return { enabled: true, ...overrides } as AssistantListItem;
}

// ---------------------------------------------------------------------------
// sortAssistants
// ---------------------------------------------------------------------------
describe('sortAssistants', () => {
  it('returns an empty array when given an empty array', () => {
    expect(sortAssistants([])).toEqual([]);
  });

  it('sorts preset assistants according to ASSISTANT_PRESETS order', () => {
    // Provide them in reverse order
    const input: AssistantListItem[] = [
      makeAssistant({ id: 'builtin-gamma', name: 'Gamma', isPreset: true }),
      makeAssistant({ id: 'builtin-alpha', name: 'Alpha', isPreset: true }),
      makeAssistant({ id: 'builtin-beta', name: 'Beta', isPreset: true }),
    ];

    const result = sortAssistants(input);
    expect(result.map((a) => a.id)).toEqual(['builtin-alpha', 'builtin-beta', 'builtin-gamma']);
  });

  it('places custom assistants at the end (filtered out since isPreset is false)', () => {
    const input: AssistantListItem[] = [
      makeAssistant({ id: 'custom-1', name: 'Custom One', isPreset: false }),
      makeAssistant({ id: 'builtin-beta', name: 'Beta', isPreset: true }),
      makeAssistant({ id: 'builtin-alpha', name: 'Alpha', isPreset: true }),
    ];

    const result = sortAssistants(input);
    // sortAssistants filters to isPreset only, so custom assistants are excluded
    expect(result.map((a) => a.id)).toEqual(['builtin-alpha', 'builtin-beta']);
  });

  it('returns an empty array when all assistants are custom (non-preset)', () => {
    const input: AssistantListItem[] = [
      makeAssistant({ id: 'custom-1', name: 'Custom One', isPreset: false }),
      makeAssistant({ id: 'custom-2', name: 'Custom Two', isPreset: false }),
    ];

    const result = sortAssistants(input);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// normalizeExtensionAssistants
// ---------------------------------------------------------------------------
describe('normalizeExtensionAssistants', () => {
  it('returns an empty array for empty input', () => {
    expect(normalizeExtensionAssistants([])).toEqual([]);
  });

  it('normalizes a single extension assistant with all fields', () => {
    const input: Record<string, unknown>[] = [
      {
        id: 'ext-test',
        name: 'Test Extension',
        nameI18n: { 'en-US': 'Test Extension', 'zh-CN': 'Test Extension ZH' },
        description: 'A test extension assistant',
        descriptionI18n: { 'en-US': 'A test extension assistant' },
        avatar: 'icon.png',
        presetAgentType: 'gemini',
        context: 'System prompt here',
        contextI18n: { 'en-US': 'System prompt here' },
        models: ['model-a', 'model-b'],
        enabledSkills: ['skill-1'],
        prompts: ['Hello', 'World'],
        promptsI18n: { 'en-US': ['Hello', 'World'] },
        _extensionName: 'my-ext',
        _kind: 'assistant',
      },
    ];

    const result = normalizeExtensionAssistants(input);
    expect(result).toHaveLength(1);

    const item = result[0];
    expect(item.id).toBe('ext-test');
    expect(item.name).toBe('Test Extension');
    expect(item.description).toBe('A test extension assistant');
    expect(item.avatar).toBe('icon.png');
    expect(item.presetAgentType).toBe('gemini');
    expect(item.context).toBe('System prompt here');
    expect(item.models).toEqual(['model-a', 'model-b']);
    expect(item.enabledSkills).toEqual(['skill-1']);
    expect(item.prompts).toEqual(['Hello', 'World']);
    expect(item.isPreset).toBe(true);
    expect(item.isBuiltin).toBe(false);
    expect(item.enabled).toBe(true);
    expect(item._source).toBe('extension');
    expect(item._extensionName).toBe('my-ext');
    expect(item._kind).toBe('assistant');
  });

  it('normalizes an extension assistant with only required fields (id and name)', () => {
    const input: Record<string, unknown>[] = [{ id: 'ext-minimal', name: 'Minimal' }];

    const result = normalizeExtensionAssistants(input);
    expect(result).toHaveLength(1);

    const item = result[0];
    expect(item.id).toBe('ext-minimal');
    expect(item.name).toBe('Minimal');
    expect(item.description).toBeUndefined();
    expect(item.avatar).toBeUndefined();
    expect(item.models).toBeUndefined();
    expect(item.enabledSkills).toBeUndefined();
    expect(item.isPreset).toBe(true);
    expect(item._source).toBe('extension');
  });

  it('filters out entries missing id or name', () => {
    const input: Record<string, unknown>[] = [
      { id: 'ext-ok', name: 'OK' },
      { id: '', name: 'No ID' },
      { id: 'ext-no-name', name: '' },
      { name: 'Missing ID' },
      { id: 'ext-no-name-field' },
    ];

    const result = normalizeExtensionAssistants(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ext-ok');
  });

  it('normalizes multiple extension assistants', () => {
    const input: Record<string, unknown>[] = [
      { id: 'ext-a', name: 'A' },
      { id: 'ext-b', name: 'B', avatar: 'b.png' },
      { id: 'ext-c', name: 'C', description: 'Third' },
    ];

    const result = normalizeExtensionAssistants(input);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(['ext-a', 'ext-b', 'ext-c']);
  });
});

// ---------------------------------------------------------------------------
// isExtensionAssistant
// ---------------------------------------------------------------------------
describe('isExtensionAssistant', () => {
  it('returns true for assistant with _source "extension"', () => {
    const assistant = makeAssistant({ id: 'some-id', name: 'Ext', _source: 'extension' });
    expect(isExtensionAssistant(assistant)).toBe(true);
  });

  it('returns true for assistant whose id starts with "ext-"', () => {
    const assistant = makeAssistant({ id: 'ext-my-assistant', name: 'Ext' });
    expect(isExtensionAssistant(assistant)).toBe(true);
  });

  it('returns false for a regular assistant without extension markers', () => {
    const assistant = makeAssistant({ id: 'builtin-alpha', name: 'Alpha', isPreset: true });
    expect(isExtensionAssistant(assistant)).toBe(false);
  });

  it('returns false for null input', () => {
    expect(isExtensionAssistant(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(isExtensionAssistant(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAssistantSource
// ---------------------------------------------------------------------------
describe('getAssistantSource', () => {
  it('returns builtin for builtin assistants', () => {
    const assistant = makeAssistant({ id: 'builtin-alpha', name: 'Alpha', isBuiltin: true });
    expect(getAssistantSource(assistant)).toBe('builtin');
  });

  it('returns extension for extension assistants', () => {
    const assistant = makeAssistant({ id: 'ext-alpha', name: 'Alpha', _source: 'extension' });
    expect(getAssistantSource(assistant)).toBe('extension');
  });

  it('returns custom for non-builtin non-extension assistants', () => {
    const assistant = makeAssistant({ id: 'custom-alpha', name: 'Alpha', isBuiltin: false });
    expect(getAssistantSource(assistant)).toBe('custom');
  });
});

// ---------------------------------------------------------------------------
// filterAssistants
// ---------------------------------------------------------------------------
describe('filterAssistants', () => {
  const assistants: AssistantListItem[] = [
    makeAssistant({
      id: 'builtin-alpha',
      name: 'Alpha',
      nameI18n: { 'en-US': 'Alpha' },
      description: 'Word helper',
      isBuiltin: true,
      enabled: true,
    }),
    makeAssistant({
      id: 'custom-beta',
      name: 'Beta',
      nameI18n: { 'en-US': 'Beta' },
      description: 'Sales helper',
      isBuiltin: false,
      enabled: false,
    }),
    makeAssistant({
      id: 'ext-gamma',
      name: 'Gamma',
      nameI18n: { 'en-US': 'Gamma' },
      description: 'Extension helper',
      _source: 'extension',
      enabled: true,
    }),
  ];

  it('returns all assistants for all filter without query', () => {
    expect(filterAssistants(assistants, '', 'all', 'en-US')).toHaveLength(3);
  });

  it('filters assistants by enabled status', () => {
    expect(filterAssistants(assistants, '', 'enabled', 'en-US').map((assistant) => assistant.id)).toEqual([
      'builtin-alpha',
      'ext-gamma',
    ]);
  });

  it('filters assistants by disabled status', () => {
    expect(filterAssistants(assistants, '', 'disabled', 'en-US').map((assistant) => assistant.id)).toEqual([
      'custom-beta',
    ]);
  });

  it('filters assistants by source', () => {
    expect(filterAssistants(assistants, '', 'builtin', 'en-US').map((assistant) => assistant.id)).toEqual([
      'builtin-alpha',
      'ext-gamma',
    ]);
    expect(filterAssistants(assistants, '', 'custom', 'en-US').map((assistant) => assistant.id)).toEqual([
      'custom-beta',
    ]);
    expect(filterAssistants(assistants, '', 'extension', 'en-US').map((assistant) => assistant.id)).toEqual([
      'ext-gamma',
    ]);
  });

  it('keeps custom assistants out of the system filter', () => {
    expect(filterAssistants(assistants, '', 'builtin', 'en-US').map((assistant) => assistant.id)).not.toContain(
      'custom-beta'
    );
  });

  it('filters assistants by localized name and description query', () => {
    expect(filterAssistants(assistants, 'word', 'all', 'en-US').map((assistant) => assistant.id)).toEqual([
      'builtin-alpha',
    ]);
    expect(filterAssistants(assistants, 'gamma', 'all', 'en-US').map((assistant) => assistant.id)).toEqual([
      'ext-gamma',
    ]);
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
});

// ---------------------------------------------------------------------------
// hasBuiltinSkills
// ---------------------------------------------------------------------------
describe('hasBuiltinSkills', () => {
  it('returns true for a builtin assistant with defaultEnabledSkills', () => {
    // "alpha" in MOCK_PRESETS has defaultEnabledSkills: ['skill-a']
    expect(hasBuiltinSkills('builtin-alpha')).toBe(true);
  });

  it('returns true for a builtin assistant with skillFiles', () => {
    // "beta" in MOCK_PRESETS has skillFiles: { 'en-US': 'beta-skills.md' }
    expect(hasBuiltinSkills('builtin-beta')).toBe(true);
  });

  it('returns false for a builtin assistant without skills or skillFiles', () => {
    // "gamma" in MOCK_PRESETS has neither defaultEnabledSkills nor skillFiles
    expect(hasBuiltinSkills('builtin-gamma')).toBeFalsy();
  });

  it('returns false for an unknown assistant id', () => {
    expect(hasBuiltinSkills('builtin-unknown')).toBe(false);
  });

  it('returns false for a non-builtin prefixed id', () => {
    expect(hasBuiltinSkills('custom-assistant')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(hasBuiltinSkills('')).toBe(false);
  });
});
