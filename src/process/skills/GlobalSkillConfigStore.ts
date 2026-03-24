/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import type { GlobalSkillConfig, GlobalSkillSetting } from './types';

/**
 * GlobalSkillConfigStore — Persistence layer for global skill toggle configuration.
 *
 * Reads/writes `skills.json` in the user config directory.
 * Thread-safe via sequential write queue.
 */
export class GlobalSkillConfigStore {
  private static instance: GlobalSkillConfigStore | undefined;
  private config: GlobalSkillConfig | undefined;
  private configPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(configDir: string) {
    this.configPath = path.join(configDir, 'skills.json');
  }

  /** Get singleton instance. Must call initialize() before using. */
  static getInstance(configDir?: string): GlobalSkillConfigStore {
    if (!GlobalSkillConfigStore.instance) {
      if (!configDir) {
        throw new Error('[GlobalSkillConfigStore] configDir required for first initialization');
      }
      GlobalSkillConfigStore.instance = new GlobalSkillConfigStore(configDir);
    }
    return GlobalSkillConfigStore.instance;
  }

  /** Reset singleton (for testing). */
  static resetInstance(): void {
    GlobalSkillConfigStore.instance = undefined;
  }

  /**
   * Load config from disk. Returns the in-memory config if already loaded.
   */
  async load(): Promise<GlobalSkillConfig> {
    if (this.config) {
      return this.config;
    }

    if (!existsSync(this.configPath)) {
      this.config = {};
      return this.config;
    }

    try {
      const raw = await fs.readFile(this.configPath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.config = parsed as GlobalSkillConfig;
      } else {
        console.warn('[GlobalSkillConfigStore] Invalid config format, using empty config');
        this.config = {};
      }
    } catch (error) {
      console.warn('[GlobalSkillConfigStore] Failed to load config, using empty config:', error);
      this.config = {};
    }

    return this.config;
  }

  /**
   * Save the current in-memory config to disk.
   * Writes are serialized to avoid corruption.
   */
  async save(config?: GlobalSkillConfig): Promise<void> {
    if (config) {
      this.config = config;
    }

    if (!this.config) {
      return;
    }

    this.writeQueue = this.writeQueue.then(async () => {
      if (!this.config) return;
      const data = JSON.stringify(this.config, null, 2);
      try {
        const dir = path.dirname(this.configPath);
        if (!existsSync(dir)) {
          await fs.mkdir(dir, { recursive: true });
        }
        await fs.writeFile(this.configPath, data, 'utf-8');
      } catch (error) {
        console.error('[GlobalSkillConfigStore] Failed to save config:', error);
      }
    });

    await this.writeQueue;
  }

  /**
   * Get the setting for a specific skill.
   * Returns undefined if the skill has no explicit config.
   */
  async getSetting(skillName: string): Promise<GlobalSkillSetting | undefined> {
    const config = await this.load();
    return config[skillName];
  }

  /**
   * Update the setting for a specific skill and persist.
   */
  async updateSetting(skillName: string, setting: GlobalSkillSetting): Promise<void> {
    const config = await this.load();
    config[skillName] = setting;
    await this.save();
  }

  /**
   * Check if a skill is globally enabled.
   * Applies default rules based on source type when no explicit config exists.
   *
   * Default behavior for unconfigured skills:
   * - bundled / custom / remote: enabled
   * - auto-detected: disabled
   */
  async isEnabled(skillName: string, source: 'bundled' | 'custom' | 'remote' | 'auto-detected'): Promise<boolean> {
    const setting = await this.getSetting(skillName);
    if (setting !== undefined) {
      return setting.enabled;
    }

    // Default: auto-detected starts disabled, everything else starts enabled
    return source !== 'auto-detected';
  }

  /** Get the file path used for persistence. */
  getConfigPath(): string {
    return this.configPath;
  }

  /** Clear in-memory cache (for testing or forced reload). */
  clearCache(): void {
    this.config = undefined;
  }
}
