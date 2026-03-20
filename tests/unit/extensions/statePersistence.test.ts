import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadPersistedStates, savePersistedStates } from '../../../src/process/extensions/lifecycle/statePersistence';

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
});
