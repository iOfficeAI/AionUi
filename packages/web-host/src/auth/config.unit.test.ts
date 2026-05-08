import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppMetadata } from '../types.js';
import { readConfig, writeConfig } from './config.js';

async function makeTempApp(): Promise<AppMetadata> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'web-host-config-'));
  return {
    version: '0.0.0-test',
    isPackaged: false,
    resourcesPath: dir,
    userDataPath: dir,
  };
}

describe('auth/config', () => {
  let app: AppMetadata;

  beforeEach(async () => {
    app = await makeTempApp();
  });

  afterEach(async () => {
    await fs.rm(app.userDataPath, { recursive: true, force: true });
  });

  it('readConfig returns default when file missing', async () => {
    const cfg = await readConfig(app);
    expect(cfg).toEqual({ passwordHash: '', adminUsername: 'admin' });
  });

  it('readConfig returns default when JSON malformed', async () => {
    await fs.writeFile(path.join(app.userDataPath, 'webui.config.json'), '{not json');
    const cfg = await readConfig(app);
    expect(cfg.adminUsername).toBe('admin');
  });

  it('writeConfig then readConfig returns same object', async () => {
    const input = {
      passwordHash: '$2a$12$fakehashvalue',
      adminUsername: 'custom-admin',
      port: 25808,
      allowRemote: true,
      passwordUpdatedAt: '2026-05-07T12:00:00Z',
    };
    await writeConfig(app, input);
    const out = await readConfig(app);
    expect(out).toEqual(input);
  });

  it('writeConfig is atomic (no .tmp leaked on success)', async () => {
    await writeConfig(app, { passwordHash: 'h', adminUsername: 'admin' });
    const entries = await fs.readdir(app.userDataPath);
    expect(entries).toContain('webui.config.json');
    expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0);
  });

  it('writeConfig creates missing userDataPath', async () => {
    const nested = path.join(app.userDataPath, 'deep', 'new', 'dir');
    const app2: AppMetadata = { ...app, userDataPath: nested };
    await writeConfig(app2, { passwordHash: 'h', adminUsername: 'admin' });
    const stat = await fs.stat(path.join(nested, 'webui.config.json'));
    expect(stat.isFile()).toBe(true);
  });

  it('readConfig ignores unknown fields without crashing', async () => {
    await fs.writeFile(
      path.join(app.userDataPath, 'webui.config.json'),
      JSON.stringify({ passwordHash: 'h', adminUsername: 'a', futureField: 'x' }),
    );
    const cfg = await readConfig(app);
    expect(cfg.passwordHash).toBe('h');
    expect((cfg as Record<string, unknown>).futureField).toBeUndefined();
  });
});
