import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type { AppMetadata, WebUIConfig } from '../types.js';
import {
  resetPassword,
  changePassword,
  verifyPassword,
  loadConfig,
  saveConfig,
} from './index.js';

async function makeApp(): Promise<AppMetadata> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'web-host-auth-'));
  return { version: '0.0.0-test', isPackaged: false, resourcesPath: dir, userDataPath: dir };
}

describe('auth (UC-3 5 APIs)', () => {
  let app: AppMetadata;
  beforeEach(async () => (app = await makeApp()));
  afterEach(async () => fs.rm(app.userDataPath, { recursive: true, force: true }));

  describe('resetPassword', () => {
    it('returns a new plaintext password string', async () => {
      const pw = await resetPassword({ app });
      expect(typeof pw).toBe('string');
      expect(pw.length).toBeGreaterThanOrEqual(12);
    });

    it('persists bcrypt hash to webui.config.json', async () => {
      const pw = await resetPassword({ app });
      const cfg = await loadConfig(app);
      expect(cfg.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(await bcrypt.compare(pw, cfg.passwordHash)).toBe(true);
    });

    it('sets adminUsername default when absent', async () => {
      await resetPassword({ app });
      const cfg = await loadConfig(app);
      expect(cfg.adminUsername).toBe('admin');
    });

    it('updates passwordUpdatedAt', async () => {
      await resetPassword({ app });
      const cfg = await loadConfig(app);
      expect(cfg.passwordUpdatedAt).toBeDefined();
    });
  });

  describe('changePassword', () => {
    it('throws PASSWORD_NOT_INITIALIZED when no password yet', async () => {
      await expect(
        changePassword({ app, oldPassword: 'x', newPassword: 'newer-pass' }),
      ).rejects.toThrow('PASSWORD_NOT_INITIALIZED');
    });

    it('accepts correct old password and rotates hash', async () => {
      const old = await resetPassword({ app });
      await changePassword({ app, oldPassword: old, newPassword: 'brand-new-pass' });
      const cfg = await loadConfig(app);
      expect(await bcrypt.compare('brand-new-pass', cfg.passwordHash)).toBe(true);
    });

    it('rejects wrong old password', async () => {
      await resetPassword({ app });
      await expect(
        changePassword({ app, oldPassword: 'totally-wrong', newPassword: 'x' }),
      ).rejects.toThrow('INVALID_OLD_PASSWORD');
    });

    it('leaves passwordHash unchanged on rejection', async () => {
      const old = await resetPassword({ app });
      const before = await loadConfig(app);
      await expect(
        changePassword({ app, oldPassword: 'wrong', newPassword: 'x' }),
      ).rejects.toThrow();
      const after = await loadConfig(app);
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(await bcrypt.compare(old, after.passwordHash)).toBe(true);
    });
  });

  describe('verifyPassword', () => {
    it('returns true for correct password', async () => {
      const pw = await resetPassword({ app });
      expect(await verifyPassword({ app, password: pw })).toBe(true);
    });

    it('returns false for wrong password', async () => {
      await resetPassword({ app });
      expect(await verifyPassword({ app, password: 'nope' })).toBe(false);
    });

    it('returns false when config file missing', async () => {
      // No resetPassword call: file does not exist.
      expect(await verifyPassword({ app, password: 'whatever' })).toBe(false);
    });

    it('returns false when passwordHash empty string', async () => {
      await saveConfig(app, { passwordHash: '', adminUsername: 'admin' });
      expect(await verifyPassword({ app, password: 'whatever' })).toBe(false);
    });
  });

  describe('loadConfig', () => {
    it('returns default schema when no file exists', async () => {
      const cfg = await loadConfig(app);
      expect(cfg).toEqual({ passwordHash: '', adminUsername: 'admin' });
    });

    it('parses existing file fields', async () => {
      const full: WebUIConfig = {
        passwordHash: '$2a$10$xxxx',
        adminUsername: 'root',
        port: 25999,
        allowRemote: true,
        passwordUpdatedAt: '2026-01-01T00:00:00Z',
      };
      await saveConfig(app, full);
      expect(await loadConfig(app)).toEqual(full);
    });
  });

  describe('saveConfig', () => {
    it('roundtrip: saved then loaded config equals input', async () => {
      const input: WebUIConfig = {
        passwordHash: 'h',
        adminUsername: 'admin',
        port: 8888,
        allowRemote: false,
      };
      await saveConfig(app, input);
      expect(await loadConfig(app)).toEqual(input);
    });

    it('overwrites previous config (no accidental merge)', async () => {
      await saveConfig(app, { passwordHash: 'a', adminUsername: 'u1', port: 1 });
      await saveConfig(app, { passwordHash: 'b', adminUsername: 'u2' });
      const cfg = await loadConfig(app);
      expect(cfg.passwordHash).toBe('b');
      expect(cfg.port).toBeUndefined();
    });
  });
});
