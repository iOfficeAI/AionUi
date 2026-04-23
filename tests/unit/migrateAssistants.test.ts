/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ipcBridge BEFORE importing the module under test so the static import
// picks up the mock. `migrateAssistants.ts` only touches
// `ipcBridge.assistants.import`, but we mock the whole surface to keep the
// factory self-contained.
vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      import: { invoke: vi.fn() },
    },
  },
}));

// `migrateAssistants.ts` imports `ProcessConfig` purely as a type at the top
// level. Stub the module so the type-only reference doesn't drag in the real
// main-process initStorage (which eagerly opens files on disk).
vi.mock('@/process/utils/initStorage', () => ({
  ProcessConfig: {},
}));

import { migrateAssistantsToBackend } from '@/process/utils/migrateAssistants';
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
  };
}

const importInvokeMock = ipcBridge.assistants.import.invoke as unknown as ReturnType<typeof vi.fn>;

describe('migrateAssistantsToBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.AIONUI_SKIP_ELECTRON_MIGRATION;
  });

  it('is a no-op when migration.electronConfigImported is already true', async () => {
    const cf = makeConfigFile({ 'migration.electronConfigImported': true });
    await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(cf.set).not.toHaveBeenCalled();
    expect(importInvokeMock).not.toHaveBeenCalled();
  });

  it('filters out legacy builtin-prefixed rows before importing', async () => {
    const cf = makeConfigFile({
      'migration.electronConfigImported': false,
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

    await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(importInvokeMock).toHaveBeenCalledTimes(1);
    const [call] = importInvokeMock.mock.calls[0];
    expect(call.assistants).toHaveLength(1);
    expect(call.assistants[0].id).toBe('custom-123');
    // Flag is set when all rows succeed.
    expect(cf.set).toHaveBeenCalledWith('migration.electronConfigImported', true);
  });

  it('does not set the flag when the import reports partial failure', async () => {
    const cf = makeConfigFile({
      'migration.electronConfigImported': false,
      assistants: [{ id: 'a', name: 'A' }],
    });
    importInvokeMock.mockResolvedValue({
      imported: 0,
      skipped: 0,
      failed: 1,
      errors: [{ id: 'a', error: 'boom' }],
    });

    await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(cf.set).not.toHaveBeenCalledWith('migration.electronConfigImported', true);
  });

  it('sets the flag when every legacy row is a builtin (nothing to import)', async () => {
    const cf = makeConfigFile({
      'migration.electronConfigImported': false,
      assistants: [{ id: 'builtin-office', name: 'Office' }],
    });

    await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(importInvokeMock).not.toHaveBeenCalled();
    expect(cf.set).toHaveBeenCalledWith('migration.electronConfigImported', true);
  });

  it('sets the flag when the legacy assistants key is absent entirely', async () => {
    const cf = makeConfigFile({ 'migration.electronConfigImported': false });

    await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(importInvokeMock).not.toHaveBeenCalled();
    expect(cf.set).toHaveBeenCalledWith('migration.electronConfigImported', true);
  });

  it('respects AIONUI_SKIP_ELECTRON_MIGRATION=1', async () => {
    process.env.AIONUI_SKIP_ELECTRON_MIGRATION = '1';
    const cf = makeConfigFile({
      'migration.electronConfigImported': false,
      assistants: [{ id: 'custom-1', name: 'X' }],
    });

    await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(cf.set).not.toHaveBeenCalled();
    expect(importInvokeMock).not.toHaveBeenCalled();
  });

  it('does not set the flag when the import call itself throws', async () => {
    const cf = makeConfigFile({
      'migration.electronConfigImported': false,
      assistants: [{ id: 'custom-1', name: 'X' }],
    });
    importInvokeMock.mockRejectedValue(new Error('network down'));

    await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    expect(cf.set).not.toHaveBeenCalledWith('migration.electronConfigImported', true);
  });

  it('normalizes malformed legacy rows into backend-shaped CreateAssistantRequest', async () => {
    const cf = makeConfigFile({
      'migration.electronConfigImported': false,
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
    expect(sent.presetAgentType).toBe('claude');
    expect(sent.enabledSkills).toEqual(['pptx', 'xlsx']);
    expect(sent.nameI18n).toEqual({ 'zh-CN': 'Zh', 'en-US': 'En' });
    expect(sent.promptsI18n).toEqual({ 'en-US': ['p1', 'p2'] });
    // CLI-specific legacy fields must not leak into the backend contract.
    expect('cliCommand' in sent).toBe(false);
    expect('defaultCliPath' in sent).toBe(false);
    expect('isPreset' in sent).toBe(false);
  });

  it('defaults presetAgentType to gemini and name to "Untitled" when missing', async () => {
    const cf = makeConfigFile({
      'migration.electronConfigImported': false,
      assistants: [{ id: 'custom-bare' }],
    });
    importInvokeMock.mockResolvedValue({ imported: 1, skipped: 0, failed: 0, errors: [] });

    await migrateAssistantsToBackend(cf as unknown as Parameters<typeof migrateAssistantsToBackend>[0]);

    const [call] = importInvokeMock.mock.calls[0];
    expect(call.assistants[0].name).toBe('Untitled');
    expect(call.assistants[0].presetAgentType).toBe('gemini');
  });
});
