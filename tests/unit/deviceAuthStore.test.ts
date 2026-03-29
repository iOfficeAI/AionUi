import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  storeDeviceAuthToken,
  clearDeviceAuthToken,
  loadDeviceAuthToken,
} from '@process/agent/openclaw/deviceAuthStore';

// Use a temp directory to avoid touching real filesystem
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'device-auth-test-'));
  vi.stubEnv('OPENCLAW_STATE_DIR', tmpDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('deviceAuthStore', () => {
  const deviceId = 'test-device-123';
  const role = 'user';

  it('stores and loads a device auth token', () => {
    const entry = storeDeviceAuthToken({ deviceId, role, token: 'tok_abc', scopes: ['read'] });
    expect(entry.token).toBe('tok_abc');
    expect(entry.role).toBe('user');
    expect(entry.scopes).toEqual(['read']);

    const loaded = loadDeviceAuthToken({ deviceId, role });
    expect(loaded).not.toBeNull();
    expect(loaded!.token).toBe('tok_abc');
  });

  it('returns null when no token stored', () => {
    expect(loadDeviceAuthToken({ deviceId, role })).toBeNull();
  });

  it('clears a stored token', () => {
    storeDeviceAuthToken({ deviceId, role, token: 'tok_abc' });
    clearDeviceAuthToken({ deviceId, role });
    expect(loadDeviceAuthToken({ deviceId, role })).toBeNull();
  });

  it('does not throw when filesystem is read-only (EROFS)', () => {
    // Simulate EROFS by making the state dir read-only
    const identityDir = path.join(tmpDir, 'identity');
    fs.mkdirSync(identityDir, { recursive: true });

    // Write initial data so we have a file to work with
    storeDeviceAuthToken({ deviceId, role, token: 'tok_initial' });

    // Make directory read-only to simulate EROFS
    fs.chmodSync(identityDir, 0o444);

    // storeDeviceAuthToken should not throw on write failure
    expect(() => storeDeviceAuthToken({ deviceId, role, token: 'tok_new' })).not.toThrow();

    // clearDeviceAuthToken should not throw on write failure
    expect(() => clearDeviceAuthToken({ deviceId, role })).not.toThrow();

    // Restore permissions for cleanup
    fs.chmodSync(identityDir, 0o755);
  });

  it('returns null for mismatched deviceId', () => {
    storeDeviceAuthToken({ deviceId, role, token: 'tok_abc' });
    expect(loadDeviceAuthToken({ deviceId: 'other-device', role })).toBeNull();
  });
});
