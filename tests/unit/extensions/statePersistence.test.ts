import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadPersistedStates,
  savePersistedStates,
  markExtensionForReinstall,
} from '../../../src/process/extensions/lifecycle/statePersistence';

const originalEnv = { ...process.env };
const tempRoots: string[] = [];

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  process.env = { ...originalEnv };

  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('extensions/statePersistence', () => {
  it('reads and writes extension states from AIONUI_EXTENSION_STATES_FILE when provided', () => {
    const sandbox = createTempDir('aionui-state-');
    const statesFile = path.join(sandbox, 'isolated', 'extension-states.json');
    process.env.AIONUI_EXTENSION_STATES_FILE = statesFile;

    const disabledAt = new Date('2026-03-08T00:00:00.000Z');
    const states = new Map<
      string,
      { enabled: boolean; disabledAt?: Date; disabledReason?: string; installed?: boolean; lastVersion?: string }
    >([
      [
        'ext-feishu',
        {
          enabled: false,
          disabledAt,
          disabledReason: 'review-test',
          installed: true,
          lastVersion: '1.2.3',
        },
      ],
    ]);

    savePersistedStates(states);

    expect(fs.existsSync(statesFile)).toBe(true);

    const loaded = loadPersistedStates();
    expect(loaded.get('ext-feishu')).toEqual({
      enabled: false,
      disabledAt,
      disabledReason: 'review-test',
      installed: true,
      lastVersion: '1.2.3',
    });
  });

  describe('markExtensionForReinstall', () => {
    it('should set installed to false for an existing extension', () => {
      const sandbox = createTempDir('aionui-reinstall-');
      const statesFile = path.join(sandbox, 'extension-states.json');
      process.env.AIONUI_EXTENSION_STATES_FILE = statesFile;

      const states = new Map([['ext-claude', { enabled: true, installed: true, lastVersion: '1.0.0' }]]);
      savePersistedStates(states);

      markExtensionForReinstall('ext-claude');

      const loaded = loadPersistedStates();
      expect(loaded.get('ext-claude')?.installed).toBe(false);
      // Other fields should be preserved
      expect(loaded.get('ext-claude')?.enabled).toBe(true);
      expect(loaded.get('ext-claude')?.lastVersion).toBe('1.0.0');
    });

    it('should be a no-op for an unknown extension', () => {
      const sandbox = createTempDir('aionui-reinstall-noop-');
      const statesFile = path.join(sandbox, 'extension-states.json');
      process.env.AIONUI_EXTENSION_STATES_FILE = statesFile;

      const states = new Map([['ext-other', { enabled: true, installed: true }]]);
      savePersistedStates(states);

      markExtensionForReinstall('ext-nonexistent');

      const loaded = loadPersistedStates();
      // ext-other should be unchanged
      expect(loaded.get('ext-other')?.installed).toBe(true);
      // ext-nonexistent should not exist
      expect(loaded.has('ext-nonexistent')).toBe(false);
    });
  });
});
