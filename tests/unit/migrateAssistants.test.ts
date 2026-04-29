/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ipcBridge BEFORE importing the module under test so the static import
// picks up the mock. `migrateAssistants.ts` touches `.import` (phase 1, user
// imports) and `.setState` (phase 2, builtin disabled-state overrides).
vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      import: { invoke: vi.fn() },
      setState: { invoke: vi.fn() },
    },
  },
}));

// `migrateAssistants.ts` imports `ProcessConfig` purely as a type at the top
// level. Stub the module so the type-only reference doesn't drag in the real
// main-process initStorage (which eagerly opens files on disk).
vi.mock('@/process/utils/initStorage', () => ({
  ProcessConfig: {},
}));

import {
  legacyAssistantToCreateRequest,
  migrateAssistantsToBackend,
} from '@/process/utils/migrateAssistants';
import { ipcBridge } from '@/common';

type Store = Map<string, unknown>;

function makeConfigFile(initial: Record<string, unknown>) {
  const store: Store = new Map(Object.entries(initial));
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k)),
    set: vi.fn(async (k: string, v: unknown) => {
      store.set(k, v);
    }),
    remove: vi.fn(async (k: string) => {
      store.delete(k);
    }),
  };
}

const importInvokeMock = ipcBridge.assistants.import.invoke as unknown as ReturnType<typeof vi.fn>;
const setStateInvokeMock = ipcBridge.assistants.setState.invoke as unknown as ReturnType<typeof vi.fn>;

describe('migrateAssistantsToBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.AIONUI_SKIP_ELECTRON_MIGRATION;
  });

  it('returns true when the legacy assistants key is absent entirely', async () => {
    const cf = makeConfigFile({});
    const result = await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(result).toBe(true);
    expect(importInvokeMock).not.toHaveBeenCalled();
    expect(cf.remove).toHaveBeenCalledWith('assistants');
    expect(cf.set).not.toHaveBeenCalled();
  });

  it('filters out legacy builtin-prefixed rows before importing', async () => {
    const cf = makeConfigFile({
      assistants: [
        { id: 'builtin-office', name: 'Office' },
        { id: 'custom-123', name: 'Mine' },
      ],
    });
    importInvokeMock.mockResolvedValue({
      imported: 1,
      skipped: 0,
      failed: 0,
      errors: [],
    });

    const result = await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(result).toBe(true);
    expect(importInvokeMock).toHaveBeenCalledTimes(1);
    const [call] = importInvokeMock.mock.calls[0];
    expect(call.assistants).toHaveLength(1);
    expect(call.assistants[0].id).toBe('custom-123');
    expect(cf.remove).toHaveBeenCalledWith('assistants');
    expect(cf.set).not.toHaveBeenCalled();
    expect(cf.store.has('assistants')).toBe(false);
  });

  it('returns false when the import reports partial failure', async () => {
    const cf = makeConfigFile({
      assistants: [{ id: 'a', name: 'A' }],
    });
    importInvokeMock.mockResolvedValue({
      imported: 0,
      skipped: 0,
      failed: 1,
      errors: [{ id: 'a', error: 'boom' }],
    });

    const result = await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(result).toBe(false);
    expect(cf.set).not.toHaveBeenCalled();
  });

  it('returns true when every legacy row is a builtin (nothing to import)', async () => {
    const cf = makeConfigFile({
      assistants: [{ id: 'builtin-office', name: 'Office' }],
    });

    const result = await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(result).toBe(true);
    expect(importInvokeMock).not.toHaveBeenCalled();
    expect(cf.remove).toHaveBeenCalledWith('assistants');
    expect(cf.set).not.toHaveBeenCalled();
    expect(cf.store.has('assistants')).toBe(false);
  });

  it('respects AIONUI_SKIP_ELECTRON_MIGRATION=1', async () => {
    process.env.AIONUI_SKIP_ELECTRON_MIGRATION = '1';
    const cf = makeConfigFile({
      assistants: [{ id: 'custom-1', name: 'X' }],
    });

    const result = await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(result).toBe(false);
    expect(cf.set).not.toHaveBeenCalled();
    expect(importInvokeMock).not.toHaveBeenCalled();
  });

  it('returns false when the import call itself throws', async () => {
    const cf = makeConfigFile({
      assistants: [{ id: 'custom-1', name: 'X' }],
    });
    importInvokeMock.mockRejectedValue(new Error('network down'));

    const result = await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(result).toBe(false);
    expect(cf.set).not.toHaveBeenCalled();
  });

  it('normalizes malformed legacy rows into backend-shaped CreateAssistantRequest', async () => {
    const cf = makeConfigFile({
      assistants: [
        {
          id: 'custom-full',
          name: 'Full',
          description: 'desc',
          avatar: 'a.svg',
          presetAgentType: 'claude',
          enabledSkills: ['pptx', 42, 'xlsx'],
          nameI18n: { 'zh-CN': 'Zh', 'en-US': 'En', bad: 123 },
          promptsI18n: { 'en-US': ['p1', 0, 'p2'], bad: 'nope' },
          cliCommand: 'should-be-stripped',
          defaultCliPath: '/should/strip',
        },
      ],
    });
    importInvokeMock.mockResolvedValue({ imported: 1, skipped: 0, failed: 0, errors: [] });

    await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    const [call] = importInvokeMock.mock.calls[0];
    expect(call.assistants).toHaveLength(1);
    const sent = call.assistants[0];
    expect(sent.id).toBe('custom-full');
    expect(sent.name).toBe('Full');
    expect(sent.preset_agent_type).toBe('claude');
    expect(sent.enabled_skills).toEqual(['pptx', 'xlsx']);
    expect(sent.name_i18n).toEqual({ 'zh-CN': 'Zh', 'en-US': 'En' });
    expect(sent.prompts_i18n).toEqual({ 'en-US': ['p1', 'p2'] });
    // CLI-specific legacy fields must not leak into the backend contract.
    expect('cliCommand' in sent).toBe(false);
    expect('defaultCliPath' in sent).toBe(false);
    expect('isPreset' in sent).toBe(false);
  });

  it('defaults preset_agent_type to gemini and name to "Untitled" when missing', async () => {
    const cf = makeConfigFile({
      assistants: [{ id: 'custom-bare' }],
    });
    importInvokeMock.mockResolvedValue({ imported: 1, skipped: 0, failed: 0, errors: [] });

    await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    const [call] = importInvokeMock.mock.calls[0];
    expect(call.assistants[0].name).toBe('Untitled');
    expect(call.assistants[0].preset_agent_type).toBe('gemini');
  });

  // H3: preserve user-set enabled=false state on legacy built-ins by replaying
  // it against the backend's assistant_overrides table.
  describe('builtin disabled-state override (H3)', () => {
    it('replays enabled=false for legacy builtins via setState with stripped id', async () => {
      const cf = makeConfigFile({
        assistants: [
          { id: 'builtin-word-creator', isBuiltin: true, enabled: false },
          { id: 'builtin-openclaw-setup', isBuiltin: true, enabled: false },
          { id: 'builtin-cowork', isBuiltin: true, enabled: true },
          { id: 'custom-123', name: 'Mine' },
        ],
      });
      importInvokeMock.mockResolvedValue({ imported: 1, skipped: 0, failed: 0, errors: [] });
      setStateInvokeMock.mockResolvedValue(undefined);

      const result = await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

      expect(result).toBe(true);
      // setState called only for disabled builtins; id stripped of "builtin-" prefix.
      expect(setStateInvokeMock).toHaveBeenCalledTimes(2);
      expect(setStateInvokeMock).toHaveBeenCalledWith({ id: 'word-creator', enabled: false });
      expect(setStateInvokeMock).toHaveBeenCalledWith({ id: 'openclaw-setup', enabled: false });
      // Cowork was enabled — must not appear.
      expect(setStateInvokeMock).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'cowork' }));
      expect(cf.remove).toHaveBeenCalledWith('assistants');
      expect(cf.set).not.toHaveBeenCalled();
      expect(cf.store.has('assistants')).toBe(false);
    });

    it('returns false when any setState call throws', async () => {
      const cf = makeConfigFile({
        assistants: [{ id: 'builtin-word-creator', isBuiltin: true, enabled: false }],
      });
      setStateInvokeMock.mockRejectedValue(new Error('backend offline'));

      const result = await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

      expect(result).toBe(false);
      expect(importInvokeMock).not.toHaveBeenCalled();
      expect(setStateInvokeMock).toHaveBeenCalledOnce();
      expect(cf.set).not.toHaveBeenCalled();
      expect(cf.remove).not.toHaveBeenCalled();
    });

    it('is also exercised directly via the exported mapper', async () => {
      const out = legacyAssistantToCreateRequest({
        id: 'custom-direct',
        name: 'Direct',
        presetAgentType: 'qwen',
        enabledSkills: ['a'],
      });
      expect(out.id).toBe('custom-direct');
      expect(out.preset_agent_type).toBe('qwen');
      expect(out.enabled_skills).toEqual(['a']);
    });

    it('returns true immediately when there are no user imports and no overrides', async () => {
      const cf = makeConfigFile({
        assistants: [
          // All built-ins, all enabled — nothing to import, nothing to override.
          { id: 'builtin-word-creator', isBuiltin: true, enabled: true },
          { id: 'builtin-cowork', isBuiltin: true }, // enabled defaulted to truthy
        ],
      });

      const result = await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

      expect(result).toBe(true);
      expect(importInvokeMock).not.toHaveBeenCalled();
      expect(setStateInvokeMock).not.toHaveBeenCalled();
      expect(cf.remove).toHaveBeenCalledWith('assistants');
      expect(cf.set).not.toHaveBeenCalled();
      expect(cf.store.has('assistants')).toBe(false);
    });
  });
});

describe('legacyAssistantToCreateRequest', () => {
  it('maps camelCase legacy fields to snake_case CreateAssistantRequest', () => {
    const legacy = {
      id: 'a1',
      name: 'X',
      nameI18n: { 'en-US': 'X-en' },
      description: 'desc',
      descriptionI18n: { 'en-US': 'desc-en' },
      avatar: 'robot',
      presetAgentType: 'gemini',
      enabledSkills: ['s1'],
      customSkillNames: [],
      disabledBuiltinSkills: ['b1'],
      prompts: ['p'],
      promptsI18n: { 'en-US': ['p-en'] },
      models: ['gemini-pro'],
    };
    const out = legacyAssistantToCreateRequest(legacy);
    expect(out.id).toBe('a1');
    expect(out.name).toBe('X');
    expect(out.name_i18n).toEqual({ 'en-US': 'X-en' });
    expect(out.description).toBe('desc');
    expect(out.description_i18n).toEqual({ 'en-US': 'desc-en' });
    expect(out.avatar).toBe('robot');
    expect(out.preset_agent_type).toBe('gemini');
    expect(out.enabled_skills).toEqual(['s1']);
    // customSkillNames was empty → asStringArray returns undefined
    expect(out.custom_skill_names).toBeUndefined();
    expect(out.disabled_builtin_skills).toEqual(['b1']);
    expect(out.prompts).toEqual(['p']);
    expect(out.prompts_i18n).toEqual({ 'en-US': ['p-en'] });
    expect(out.models).toEqual(['gemini-pro']);
  });

  it('handles missing optional fields without crashing and applies defaults', () => {
    const out = legacyAssistantToCreateRequest({ id: 'min', name: 'M' });
    expect(out.id).toBe('min');
    expect(out.name).toBe('M');
    // Missing presetAgentType defaults to 'gemini' (backward-compat for legacy rows)
    expect(out.preset_agent_type).toBe('gemini');
    expect(out.enabled_skills).toBeUndefined();
    expect(out.custom_skill_names).toBeUndefined();
    expect(out.disabled_builtin_skills).toBeUndefined();
    expect(out.name_i18n).toBeUndefined();
    expect(out.description_i18n).toBeUndefined();
    expect(out.prompts_i18n).toBeUndefined();
  });
});
