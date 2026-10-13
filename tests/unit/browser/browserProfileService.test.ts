import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserProfileService } from '@process/services/browser/BrowserProfileService';
import { DEFAULT_BROWSER_PROFILE_ID } from '@/common/browser/constants';

describe('BrowserProfileService', () => {
  let tempDir: string;
  let service: BrowserProfileService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-browser-profile-test-'));
    service = new BrowserProfileService({
      userDataPath: tempDir,
      configFilePath: path.join(tempDir, 'browser_profiles.json'),
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  });

  it('initializes with default profile', () => {
    const profiles = service.getProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(1);
    const defaultProfile = service.getProfile(DEFAULT_BROWSER_PROFILE_ID);
    expect(defaultProfile).toBeDefined();
    expect(defaultProfile?.id).toBe(DEFAULT_BROWSER_PROFILE_ID);
    expect(defaultProfile?.backend).toBe('embedded');
  });

  it('creates and retrieves a new profile with sanitized id', () => {
    const created = service.createProfile({
      name: 'Instagram Brand Account',
      backend: 'embedded',
    });

    expect(created.name).toBe('Instagram Brand Account');
    expect(created.id).toContain('instagram-brand');
    expect(created.partition).toBe(`persist:aionui-browser-${created.id}`);
    expect(service.getProfile(created.id)).toEqual(created);
  });

  it('updates profile settings correctly', () => {
    const created = service.createProfile({ name: 'Work Profile' });
    const updated = service.updateProfile({
      id: created.id,
      name: 'Work Profile Renamed',
      backend: 'external-chrome',
      externalChrome: { port: 9333 },
    });

    expect(updated.name).toBe('Work Profile Renamed');
    expect(updated.backend).toBe('external-chrome');
    expect(updated.externalChrome?.port).toBe(9333);
  });

  it('switches active profile', () => {
    const created = service.createProfile({ name: 'Secondary' });
    expect(service.getActiveProfile().id).toBe(DEFAULT_BROWSER_PROFILE_ID);

    service.setActiveProfile(created.id);
    expect(service.getActiveProfile().id).toBe(created.id);
  });

  it('prevents deleting the default profile', () => {
    expect(() => service.deleteProfile(DEFAULT_BROWSER_PROFILE_ID)).toThrow('Cannot delete default profile');
  });

  it('deletes custom profile and resets active to default if deleted was active', () => {
    const created = service.createProfile({ name: 'Temp Profile' });
    service.setActiveProfile(created.id);

    const deleted = service.deleteProfile(created.id);
    expect(deleted).toBe(true);
    expect(service.getProfile(created.id)).toBeUndefined();
    expect(service.getActiveProfile().id).toBe(DEFAULT_BROWSER_PROFILE_ID);
  });

  it('clears profile data safely', async () => {
    const created = service.createProfile({ name: 'Clean Me' });
    const result = await service.clearProfileData(created.id);
    expect(result.success).toBe(true);
    expect(result.profileId).toBe(created.id);
  });
});
