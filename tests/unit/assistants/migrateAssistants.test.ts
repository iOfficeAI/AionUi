/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for process/utils/migrateAssistants.ts (A11 in N4a).
 * Tests legacy assistant migration: builtin skip, user import, collision handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @/common
vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      create: { invoke: vi.fn() },
      import: { invoke: vi.fn() },
      setState: { invoke: vi.fn() },
      update: { invoke: vi.fn() },
      list: { invoke: vi.fn(async () => []) },
      get: { invoke: vi.fn() },
    },
    acpConversation: {
      getManagedAgents: { invoke: vi.fn(async () => []) },
    },
    fs: {
      writeAssistantRule: { invoke: vi.fn(async () => true) },
      readAssistantRule: { invoke: vi.fn(async () => '') },
    },
  },
}));

// Stub the legacy assistants dir resolver — tests don't touch the real
// filesystem, the `fs.readdir` mock below answers ENOENT for unspecified
// cases so Phase 4 becomes a no-op.
vi.mock('@/process/utils/initStorage', () => ({
  getAssistantsDir: () => '/__test_legacy_assistants__',
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: vi.fn(async () => {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }),
      readFile: vi.fn(async () => ''),
    },
  };
});

import { legacyAssistantToCreateRequest, migrateAssistantsToBackend } from '@/process/utils/migrateAssistants';
import { ipcBridge } from '@/common';
import { BackendHttpError } from '@/common/adapter/httpBridge';

describe('migrateAssistants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ipcBridge.assistants.list.invoke as any).mockResolvedValue([]);
    (ipcBridge.assistants.get.invoke as any).mockResolvedValue(undefined);
    (ipcBridge.acpConversation.getManagedAgents.invoke as any).mockResolvedValue([]);
    (ipcBridge.fs.readAssistantRule.invoke as any).mockResolvedValue('');
  });

  describe('legacyAssistantToCreateRequest', () => {
    it('converts legacy camelCase to backend snake_case', () => {
      const legacy = {
        id: 'my-assistant',
        name: 'MyAssistant',
        description: 'Test',
        presetAgentType: 'claude',
        avatar: '🤖',
      };
      const result = legacyAssistantToCreateRequest(legacy, new Map([['claude', '2d23ff1c']]));
      expect(result.id).toBe('my-assistant');
      expect(result.name).toBe('MyAssistant');
      expect(result.agent_id).toBe('2d23ff1c');
    });

    it('renames colliding preset ids to avoid overwrite', () => {
      const legacy = { id: 'word-creator', name: 'User Word' }; // 'word-creator' is in PRESET_ID_WHITELIST
      const result = legacyAssistantToCreateRequest(legacy);
      expect(result.id).toMatch(/^custom-migrated-/);
      expect(result.name).toBe('User Word');
    });

    it('handles empty/missing fields gracefully', () => {
      const legacy = { id: 'test' };
      const result = legacyAssistantToCreateRequest(legacy);
      expect(result.id).toBe('test');
      expect(result.name).toBe('Untitled'); // Fallback for missing name
    });

    it('filters out CLI-specific fields (cliCommand, acpArgs, env)', () => {
      const legacy = { id: 'test', cliCommand: 'node', acpArgs: ['--version'], env: { FOO: 'bar' } };
      const result = legacyAssistantToCreateRequest(legacy);
      expect(result).not.toHaveProperty('cliCommand');
      expect(result).not.toHaveProperty('acpArgs');
      expect(result).not.toHaveProperty('env');
    });

    it('converts nameI18n / descriptionI18n to snake_case records', () => {
      const legacy = { id: 'test', nameI18n: { zh: '助手' }, descriptionI18n: { zh: '描述' } };
      const result = legacyAssistantToCreateRequest(legacy);
      expect(result.name_i18n).toEqual({ zh: '助手' });
      expect(result.description_i18n).toEqual({ zh: '描述' });
    });

    it('omits legacy default gemini so the backend applies its current default', () => {
      // Legacy Electron shipped 'gemini' as the global default; the current
      // backend default is 'aionrs' (the internal gemini engine was removed).
      // Treat a legacy 'gemini' value as "no explicit choice" so users who
      // never touched the picker get the current default, not a broken one.
      const result = legacyAssistantToCreateRequest({ id: 'x', presetAgentType: 'gemini' });
      expect(result.agent_id).toBeUndefined();
    });

    it('omits agent_id when presetAgentType is missing', () => {
      const result = legacyAssistantToCreateRequest({ id: 'x' });
      expect(result.agent_id).toBeUndefined();
    });

    it('maps non-default legacy backend choices to agent_id', () => {
      // Users who actually picked a backend keep their choice across the
      // gemini → aionrs default migration.
      const result = legacyAssistantToCreateRequest(
        { id: 'x', presetAgentType: 'codex' },
        new Map([['codex', '8e1acf31']])
      );
      expect(result.agent_id).toBe('8e1acf31');
    });
  });

  describe('migrateAssistantsToBackend builtin overrides', () => {
    /**
     * Fake ProcessConfig backed by an in-memory map. The migration only
     * reads `get('assistants')` — there is no completion flag (idempotency
     * is achieved phase-by-phase against the backend, see sibling
     * `configMigration.ts` pattern) — so the fake exposes `get` only.
     */
    function makeConfig(seed: Record<string, unknown>) {
      const store: Record<string, unknown> = { ...seed };
      return {
        get: (key: string) => Promise.resolve(store[key]),
        store,
      };
    }

    it('treats 404 from retired built-in ids as skip, not failure', async () => {
      // User had two built-ins disabled: one still exists, one was retired from
      // the backend manifest. The migration must succeed despite the 404 so
      // the next launch does not abort the whole pipeline.
      const config = makeConfig({
        assistants: [
          { id: 'builtin-morph-ppt-3d', enabled: false, isBuiltin: true },
          { id: 'builtin-pptx-generator', enabled: false, isBuiltin: true },
        ],
      });

      (ipcBridge.assistants.setState.invoke as any).mockImplementation(async ({ id }: { id: string }) => {
        if (id === 'pptx-generator') {
          throw new BackendHttpError({
            method: 'PATCH',
            path: '/api/assistants/pptx-generator/state',
            status: 404,
            body: { error: "assistant 'pptx-generator' not found" },
          });
        }
        return {};
      });

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(true);
      // Legacy `assistants` field is left untouched on disk so users can
      // roll back to an older Electron build at any time.
      expect(config.store).toHaveProperty('assistants');
      expect(ipcBridge.assistants.setState.invoke).toHaveBeenCalledTimes(2);
    });

    it('still fails migration on non-404 backend errors', async () => {
      const config = makeConfig({
        assistants: [{ id: 'builtin-morph-ppt-3d', enabled: false, isBuiltin: true }],
      });

      (ipcBridge.assistants.setState.invoke as any).mockRejectedValue(
        new BackendHttpError({
          method: 'PATCH',
          path: '/api/assistants/morph-ppt-3d/state',
          status: 500,
          body: { error: 'internal' },
        })
      );

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(false); // keep retrying on next launch
      expect(config.store).toHaveProperty('assistants'); // legacy field always preserved
    });

    it('skips legacy builtin override replay when backend already exposes unified assistant detail', async () => {
      const config = makeConfig({
        assistants: [
          { id: 'builtin-morph-ppt-3d', enabled: false, isBuiltin: true },
          { id: 'custom-1', name: 'Custom 1' },
        ],
      });

      (ipcBridge.assistants.list.invoke as any).mockResolvedValue([{ id: 'morph-ppt-3d', source: 'builtin' }]);
      (ipcBridge.assistants.get.invoke as any).mockResolvedValue({
        id: 'morph-ppt-3d',
        source: 'builtin',
        profile: { name: 'Morph PPT', name_i18n: {}, description_i18n: {} },
        state: { enabled: true, sort_order: 0 },
        engine: { agent_id: '632f31d2' },
        rules: { content: '', storage_mode: 'builtin_asset' },
        prompts: { recommended: [], recommended_i18n: {} },
        defaults: {
          model: { mode: 'auto' },
          permission: { mode: 'auto' },
          skills: { mode: 'auto', value: [] },
          mcps: { mode: 'auto', value: [] },
        },
        capabilities: {
          default_skill_ids: [],
          custom_skill_names: [],
          default_disabled_builtin_skill_ids: [],
        },
        preferences: {
          last_skill_ids: [],
          last_disabled_builtin_skill_ids: [],
          last_mcp_ids: [],
        },
      });
      (ipcBridge.assistants.import.invoke as any).mockResolvedValue({ imported: 1, skipped: 0, failed: 0, errors: [] });

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(true);
      expect(ipcBridge.assistants.import.invoke).toHaveBeenCalledTimes(1);
      expect(ipcBridge.assistants.setState.invoke).not.toHaveBeenCalled();
      expect(ipcBridge.assistants.update.invoke).not.toHaveBeenCalled();
    });
  });

  describe('migrateAssistantsToBackend builtin preset_agent_type override', () => {
    function makeConfig(seed: Record<string, unknown>) {
      const store: Record<string, unknown> = { ...seed };
      return {
        get: (key: string) => Promise.resolve(store[key]),
        store,
      };
    }

    /** Minimal Assistant shape for `assistants.list` mock; only the fields the
     *  migration inspects need to be real. */
    function builtinListStub(rows: Array<{ id: string; agent_id: string }>) {
      return rows.map((r) => ({ ...r, source: 'builtin' }));
    }

    it('preserves explicit user choice (codex) across the default change', async () => {
      // Legacy built-in was set to 'codex'; backend default is 'aionrs'. The
      // migration should PUT an override so the user's choice survives.
      const config = makeConfig({
        assistants: [{ id: 'builtin-word-creator', enabled: true, presetAgentType: 'codex', isBuiltin: true }],
      });

      (ipcBridge.assistants.list.invoke as any).mockResolvedValue(
        builtinListStub([{ id: 'word-creator', agent_id: '632f31d2' }])
      );
      (ipcBridge.acpConversation.getManagedAgents.invoke as any).mockResolvedValue([
        { id: '8e1acf31', backend: 'codex', agent_type: 'acp' },
      ]);
      (ipcBridge.assistants.update.invoke as any).mockResolvedValue({});

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(true);
      expect(ipcBridge.assistants.update.invoke).toHaveBeenCalledTimes(1);
      expect(ipcBridge.assistants.update.invoke).toHaveBeenCalledWith({
        id: 'word-creator',
        agent_id: '8e1acf31',
      });
    });

    it('does not override when legacy value is the old default (gemini)', async () => {
      // 'gemini' legacy-default must collapse to "no preference" so the user
      // lands on the new default aionrs, not a broken gemini reference.
      const config = makeConfig({
        assistants: [{ id: 'builtin-word-creator', enabled: true, presetAgentType: 'gemini', isBuiltin: true }],
      });

      (ipcBridge.assistants.list.invoke as any).mockResolvedValue(
        builtinListStub([{ id: 'word-creator', agent_id: '632f31d2' }])
      );

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(true);
      expect(ipcBridge.assistants.update.invoke).not.toHaveBeenCalled();
    });

    it('does not override when legacy value already matches the current default', async () => {
      // User picked 'aionrs' explicitly (or the legacy default already matched):
      // writing an identical override would be a no-op row.
      const config = makeConfig({
        assistants: [{ id: 'builtin-word-creator', enabled: true, presetAgentType: 'aionrs', isBuiltin: true }],
      });

      (ipcBridge.assistants.list.invoke as any).mockResolvedValue(
        builtinListStub([{ id: 'word-creator', agent_id: '632f31d2' }])
      );

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(true);
      expect(ipcBridge.assistants.update.invoke).not.toHaveBeenCalled();
    });

    it('skips retired built-in ids (404 via filter, never calls PUT)', async () => {
      // The id is not in the current backend manifest at all, so Phase 3
      // collect filters it out ahead of the network call.
      const config = makeConfig({
        assistants: [{ id: 'builtin-pdf-to-ppt', enabled: true, presetAgentType: 'codex', isBuiltin: true }],
      });

      (ipcBridge.assistants.list.invoke as any).mockResolvedValue(
        builtinListStub([{ id: 'word-creator', agent_id: '632f31d2' }]) // no pdf-to-ppt
      );

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(true);
      expect(ipcBridge.assistants.update.invoke).not.toHaveBeenCalled();
    });
  });

  // migrateAssistantsToBackend Phase 1 (import) integration still relies on
  // the backend fake; Phase 2 and Phase 3 behavior are covered above.

  describe('migrateAssistantsToBackend Phase 4 (rule file upload)', () => {
    function makeConfig(seed: Record<string, unknown>) {
      const store: Record<string, unknown> = { ...seed };
      return {
        get: (key: string) => Promise.resolve(store[key]),
        store,
      };
    }

    it('uploads rule .md files for custom assistants and skips builtin / mismatched ids', async () => {
      const fsModule = await import('fs');
      const readdirMock = fsModule.promises.readdir as unknown as ReturnType<typeof vi.fn>;
      const readFileMock = fsModule.promises.readFile as unknown as ReturnType<typeof vi.fn>;
      readdirMock.mockResolvedValueOnce([
        'custom-1.zh-CN.md',
        'custom-1.en-US.md',
        'custom-1-skills.zh-CN.md', // skipped: skills filename
        'builtin-word-creator.zh-CN.md', // skipped: builtin id
        'unknown-id.zh-CN.md', // skipped: not in legacy assistant list
        'README.txt', // skipped: not .md
      ]);
      readFileMock.mockResolvedValue('# Rule content\n');

      const config = makeConfig({
        assistants: [{ id: 'custom-1', name: 'Custom 1' }],
      });

      (ipcBridge.assistants.import.invoke as any).mockResolvedValue({ imported: 1, skipped: 0, failed: 0, errors: [] });

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(true);
      expect(ipcBridge.fs.writeAssistantRule.invoke).toHaveBeenCalledTimes(2);
      expect(ipcBridge.fs.writeAssistantRule.invoke).toHaveBeenCalledWith({
        assistant_id: 'custom-1',
        locale: 'zh-CN',
        content: '# Rule content\n',
      });
      expect(ipcBridge.fs.writeAssistantRule.invoke).toHaveBeenCalledWith({
        assistant_id: 'custom-1',
        locale: 'en-US',
        content: '# Rule content\n',
      });
    });

    it('skips upload when backend already has non-empty rule (read-before-write)', async () => {
      const fsModule = await import('fs');
      const readdirMock = fsModule.promises.readdir as unknown as ReturnType<typeof vi.fn>;
      const readFileMock = fsModule.promises.readFile as unknown as ReturnType<typeof vi.fn>;
      readdirMock.mockResolvedValueOnce(['custom-1.zh-CN.md']);
      readFileMock.mockResolvedValue('# legacy rule\n');

      // Backend already has user-edited content; we must not clobber it.
      (ipcBridge.fs.readAssistantRule.invoke as any).mockResolvedValueOnce('# user-edited\n');

      const config = makeConfig({
        assistants: [{ id: 'custom-1', name: 'Custom 1' }],
      });
      (ipcBridge.assistants.import.invoke as any).mockResolvedValue({ imported: 0, skipped: 1, failed: 0, errors: [] });

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(true);
      expect(ipcBridge.fs.writeAssistantRule.invoke).not.toHaveBeenCalled();
    });

    it('returns false when a rule upload fails so the next launch retries', async () => {
      const fsModule = await import('fs');
      const readdirMock = fsModule.promises.readdir as unknown as ReturnType<typeof vi.fn>;
      const readFileMock = fsModule.promises.readFile as unknown as ReturnType<typeof vi.fn>;
      readdirMock.mockResolvedValueOnce(['custom-1.zh-CN.md']);
      readFileMock.mockResolvedValue('# content\n');

      (ipcBridge.fs.writeAssistantRule.invoke as any).mockRejectedValueOnce(new Error('boom'));

      const config = makeConfig({
        assistants: [{ id: 'custom-1', name: 'Custom 1' }],
      });
      (ipcBridge.assistants.import.invoke as any).mockResolvedValue({ imported: 1, skipped: 0, failed: 0, errors: [] });

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(false);
      // Legacy field is never modified by the migration regardless of outcome.
      expect(config.store).toHaveProperty('assistants');
    });

    it('treats a missing legacy assistants dir as no-op success', async () => {
      // Default readdir mock raises ENOENT — no rule files to upload, no
      // failure.
      const config = makeConfig({
        assistants: [{ id: 'custom-1', name: 'Custom 1' }],
      });
      (ipcBridge.assistants.import.invoke as any).mockResolvedValue({ imported: 1, skipped: 0, failed: 0, errors: [] });

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(true);
      // Legacy field is never modified by the migration.
      expect(config.store).toHaveProperty('assistants');
    });
  });

  // ---------------------------------------------------------------------
  // ELECTRON-1KT regression coverage: assistants migration must persist a
  // one-shot flag on success and short-circuit on subsequent launches so a
  // user-deleted assistant does not get re-imported from the legacy on-disk
  // `assistants` field via Phase 1 (insert-only import).
  // ---------------------------------------------------------------------
  describe('migrateAssistantsToBackend completion flag (ELECTRON-1KT)', () => {
    /**
     * Fake config exposing both `get` and `set`, backed by a Map. `get`
     * returns `undefined` for missing keys; `set` stores the value. Tests
     * inspect `store` directly to assert flag persistence.
     */
    function makeConfigWithSet(seed: Record<string, unknown> = {}) {
      const store = new Map<string, unknown>(Object.entries(seed));
      return {
        get: (key: string) => Promise.resolve(store.get(key)),
        set: vi.fn(async (key: string, value: unknown) => {
          store.set(key, value);
        }),
        store,
      };
    }

    it('sets completion flag after a clean migration run', async () => {
      const config = makeConfigWithSet({
        assistants: [{ id: 'custom-1', name: 'Custom 1' }],
      });
      (ipcBridge.assistants.import.invoke as any).mockResolvedValue({ imported: 1, skipped: 0, failed: 0, errors: [] });

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(true);
      expect(config.store.get('migration.assistantsMigrated_v1')).toBe(true);
      // Legacy field preserved for downgrade safety.
      expect(config.store.has('assistants')).toBe(true);
    });

    it('short-circuits subsequent runs once flag is set', async () => {
      const config = makeConfigWithSet({
        assistants: [{ id: 'custom-1', name: 'Custom 1' }],
        'migration.assistantsMigrated_v1': true,
      });

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(true);
      // No backend calls at all — neither import nor list nor setState.
      expect(ipcBridge.assistants.import.invoke).not.toHaveBeenCalled();
      expect(ipcBridge.assistants.list.invoke).not.toHaveBeenCalled();
      expect(ipcBridge.assistants.setState.invoke).not.toHaveBeenCalled();
      expect(ipcBridge.assistants.update.invoke).not.toHaveBeenCalled();
    });

    it('does not re-import an assistant deleted by the user after migration', async () => {
      // Run 1: full import succeeds, flag persisted.
      const config = makeConfigWithSet({
        assistants: [
          { id: 'custom-1', name: 'Custom 1' },
          { id: 'custom-2', name: 'Custom 2' },
        ],
      });
      (ipcBridge.assistants.import.invoke as any).mockResolvedValue({ imported: 2, skipped: 0, failed: 0, errors: [] });

      let result = await migrateAssistantsToBackend(config as any);
      expect(result).toBe(true);
      expect(config.store.get('migration.assistantsMigrated_v1')).toBe(true);

      // Run 2: user deletes custom-1 from the backend. Legacy `assistants`
      // on disk is unchanged. With the flag set, the migration must NOT
      // call import again — that's the bug being fixed.
      vi.clearAllMocks();
      result = await migrateAssistantsToBackend(config as any);
      expect(result).toBe(true);
      expect(ipcBridge.assistants.import.invoke).not.toHaveBeenCalled();
    });

    it('sets flag on the empty/no-op path so we never re-read legacy data', async () => {
      const config = makeConfigWithSet({});

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(true);
      expect(config.store.get('migration.assistantsMigrated_v1')).toBe(true);
    });

    it('does not set flag on a partial failure so retry can finish the job', async () => {
      // Phase 1 reports 1 failed → migration returns false → flag stays unset.
      const config = makeConfigWithSet({
        assistants: [{ id: 'custom-1', name: 'Custom 1' }],
      });
      (ipcBridge.assistants.import.invoke as any).mockResolvedValue({
        imported: 0,
        skipped: 0,
        failed: 1,
        errors: [{ id: 'custom-1', message: 'boom' }],
      });

      const result = await migrateAssistantsToBackend(config as any);

      expect(result).toBe(false);
      expect(config.store.has('migration.assistantsMigrated_v1')).toBe(false);
    });
  });
});
