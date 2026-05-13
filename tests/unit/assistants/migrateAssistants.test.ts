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
    },
  },
}));

import { legacyAssistantToCreateRequest, migrateAssistantsToBackend } from '@/process/utils/migrateAssistants';
import { ipcBridge } from '@/common';
import { BackendHttpError } from '@/common/adapter/httpBridge';

describe('migrateAssistants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const result = legacyAssistantToCreateRequest(legacy);
      expect(result.id).toBe('my-assistant');
      expect(result.name).toBe('MyAssistant');
      expect(result.preset_agent_type).toBe('claude');
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
  });

  describe('migrateAssistantsToBackend builtin overrides', () => {
    /**
     * Fake ProcessConfig backed by an in-memory map. Exercises the two public
     * surfaces the migration relies on: `get('assistants')` and the optional
     * `remove('assistants')` that fires only on a clean migration.
     */
    function makeConfig(seed: Record<string, unknown>) {
      const store: Record<string, unknown> = { ...seed };
      return {
        get: (key: string) => Promise.resolve(store[key]),
        remove: (key: string) => {
          delete store[key];
          return Promise.resolve();
        },
        store,
      };
    }

    it('treats 404 from retired built-in ids as skip, not failure', async () => {
      // User had two built-ins disabled: one still exists, one was retired from
      // the backend manifest. The migration must finalize despite the 404 so
      // the next launch does not retry forever.
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

      expect(result).toBe(true); // finalize fired, assistants key removed
      expect(config.store).not.toHaveProperty('assistants');
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
      expect(config.store).toHaveProperty('assistants'); // not finalized
    });
  });

  // migrateAssistantsToBackend Phase 1 (import) integration still relies on
  // the backend fake; Phase 2 behavior around retired ids is covered above.
});
