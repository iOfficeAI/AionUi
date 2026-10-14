/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { app, session } from 'electron';
import {
  BROWSER_PARTITION_PREFIX,
  DEFAULT_BROWSER_PROFILE,
  DEFAULT_BROWSER_PROFILE_ID,
  DEFAULT_EXTERNAL_CHROME_PORT,
} from '@/common/browser/constants';
import type {
  BrowserProfile,
  ClearProfileDataResult,
  CreateProfileInput,
  UpdateProfileInput,
} from '@/common/browser/types';

export class BrowserProfileService {
  private profiles: Map<string, BrowserProfile> = new Map();
  private activeProfileId: string = DEFAULT_BROWSER_PROFILE_ID;
  private readonly configFilePath: string;
  private readonly userDataRoot: string;

  constructor(options?: { userDataPath?: string; configFilePath?: string }) {
    this.userDataRoot = options?.userDataPath || this.resolveUserDataRoot();
    this.configFilePath = options?.configFilePath || path.join(this.userDataRoot, 'browser_profiles.json');
    this.loadProfiles();
  }

  private resolveUserDataRoot(): string {
    try {
      if (app && typeof app.getPath === 'function') {
        return app.getPath('userData');
      }
    } catch {
      // In unit test environment without Electron app lifecycle
    }
    return process.cwd();
  }

  private loadProfiles(): void {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.profiles)) {
          for (const item of parsed.profiles) {
            if (item && typeof item.id === 'string') {
              this.profiles.set(item.id, item);
            }
          }
        }
        if (typeof parsed.activeProfileId === 'string' && this.profiles.has(parsed.activeProfileId)) {
          this.activeProfileId = parsed.activeProfileId;
        }
      }
    } catch (err) {
      console.warn('[BrowserProfileService] Failed to read profiles from disk, resetting to default:', err);
    }

    if (!this.profiles.has(DEFAULT_BROWSER_PROFILE_ID)) {
      this.profiles.set(DEFAULT_BROWSER_PROFILE_ID, { ...DEFAULT_BROWSER_PROFILE });
    }
    if (!this.profiles.has(this.activeProfileId)) {
      this.activeProfileId = DEFAULT_BROWSER_PROFILE_ID;
    }
  }

  private saveProfiles(): void {
    try {
      const dir = path.dirname(this.configFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        activeProfileId: this.activeProfileId,
        profiles: Array.from(this.profiles.values()),
      };
      fs.writeFileSync(this.configFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[BrowserProfileService] Failed to save profiles to disk:', err);
    }
  }

  public getProfiles(): BrowserProfile[] {
    return Array.from(this.profiles.values());
  }

  public getProfile(id: string): BrowserProfile | undefined {
    return this.profiles.get(id);
  }

  public getActiveProfile(): BrowserProfile {
    return this.profiles.get(this.activeProfileId) || this.profiles.get(DEFAULT_BROWSER_PROFILE_ID)!;
  }

  public setActiveProfile(id: string): BrowserProfile {
    const target = this.profiles.get(id);
    if (!target) {
      throw new Error(`Profile not found: ${id}`);
    }
    this.activeProfileId = id;
    this.saveProfiles();
    return target;
  }

  public createProfile(input: CreateProfileInput): BrowserProfile {
    const rawName = (input.name || '').trim();
    if (!rawName) {
      throw new Error('Profile name is required');
    }

    const sanitizedBase = rawName
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);

    const suffix = Math.random().toString(36).slice(2, 7);
    const id = sanitizedBase ? `${sanitizedBase}-${suffix}` : `profile-${suffix}`;

    const backend = input.backend || 'embedded';
    const partition = `${BROWSER_PARTITION_PREFIX}${id}`;
    const now = Date.now();

    const externalChromeUserDataDir = path.join(this.userDataRoot, 'chrome-profiles', id);

    const newProfile: BrowserProfile = {
      id,
      name: rawName,
      backend,
      partition,
      externalChrome: {
        port: input.externalChrome?.port || DEFAULT_EXTERNAL_CHROME_PORT,
        userDataDir: input.externalChrome?.userDataDir || externalChromeUserDataDir,
        chromePath: input.externalChrome?.chromePath,
      },
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };

    this.profiles.set(id, newProfile);
    this.saveProfiles();
    return newProfile;
  }

  public updateProfile(input: UpdateProfileInput): BrowserProfile {
    const existing = this.profiles.get(input.id);
    if (!existing) {
      throw new Error(`Profile not found: ${input.id}`);
    }

    if (input.name) {
      existing.name = input.name.trim();
    }
    if (input.backend) {
      existing.backend = input.backend;
    }
    if (input.externalChrome) {
      existing.externalChrome = {
        ...existing.externalChrome,
        ...input.externalChrome,
        port: input.externalChrome.port || existing.externalChrome?.port || DEFAULT_EXTERNAL_CHROME_PORT,
        userDataDir:
          input.externalChrome.userDataDir ||
          existing.externalChrome?.userDataDir ||
          path.join(this.userDataRoot, 'chrome-profiles', existing.id),
      };
    }
    existing.updatedAt = Date.now();

    this.profiles.set(existing.id, existing);
    this.saveProfiles();
    return existing;
  }

  public deleteProfile(id: string): boolean {
    if (id === DEFAULT_BROWSER_PROFILE_ID) {
      throw new Error('Cannot delete default profile');
    }
    const profile = this.profiles.get(id);
    if (!profile) {
      return false;
    }

    this.profiles.delete(id);
    if (this.activeProfileId === id) {
      this.activeProfileId = DEFAULT_BROWSER_PROFILE_ID;
    }
    this.saveProfiles();

    // Clean up external Chrome profile directory if applicable
    if (profile.externalChrome?.userDataDir && fs.existsSync(profile.externalChrome.userDataDir)) {
      try {
        fs.rmSync(profile.externalChrome.userDataDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[BrowserProfileService] Failed to clean up external Chrome dir for ${id}:`, err);
      }
    }

    return true;
  }

  public async clearProfileData(id: string): Promise<ClearProfileDataResult> {
    const profile = this.profiles.get(id);
    if (!profile) {
      return { success: false, profileId: id, error: `Profile not found: ${id}` };
    }

    try {
      if (session && typeof session.fromPartition === 'function') {
        const targetSession = session.fromPartition(profile.partition);
        await targetSession.clearStorageData();
        await targetSession.clearCache();
        await targetSession.clearAuthCache();
      }

      if (profile.externalChrome?.userDataDir && fs.existsSync(profile.externalChrome.userDataDir)) {
        // Clear caches while preserving the user profile root
        const cacheDir = path.join(profile.externalChrome.userDataDir, 'Default', 'Cache');
        if (fs.existsSync(cacheDir)) {
          fs.rmSync(cacheDir, { recursive: true, force: true });
        }
      }

      return { success: true, profileId: id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, profileId: id, error: msg };
    }
  }
}

let instance: BrowserProfileService | null = null;

export function getBrowserProfileService(): BrowserProfileService {
  if (!instance) {
    instance = new BrowserProfileService();
  }
  return instance;
}
