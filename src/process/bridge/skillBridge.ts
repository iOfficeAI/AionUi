/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Skill Bridge — IPC providers for the new skill repository and global config channels.
 *
 * Implements:
 * - `skill.get-global-config`      — returns the full GlobalSkillConfig map
 * - `skill.set-global-enabled`     — toggles a skill's global enabled state
 * - `skill.compute-effective`      — computes effective skills for an assistant config
 * - `skill.repository.list`        — lists all registered skills
 * - `skill.repository.get`         — gets a single skill by name
 * - `skill.repository.add`         — registers a skill into the repository
 * - `skill.repository.remove`      — removes a skill from the repository
 * - `skill.assistant-config.get`   — reads per-assistant skill override config
 * - `skill.assistant-config.update`— persists per-assistant skill override config
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { ipcBridge } from '@/common';
import { GlobalSkillConfigStore, SkillInjector, SkillRepository } from '@process/skills';
import type { AssistantSkillConfig, SkillFilter } from '@process/skills/types';
import { getSystemDir } from '@process/utils/initStorage';

/**
 * AssistantSkillConfigStore — Lightweight persistence for per-assistant skill configs.
 *
 * Stores configs as `assistant-skill-configs.json` in the workDir.
 * Key: assistantId, Value: AssistantSkillConfig.
 * Thread-safe via sequential write queue.
 */
class AssistantSkillConfigStore {
  private static instance: AssistantSkillConfigStore | undefined;
  private configPath: string;
  private cache: Record<string, AssistantSkillConfig> | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(workDir: string) {
    this.configPath = path.join(workDir, 'assistant-skill-configs.json');
  }

  /** Get or create the singleton instance for the given workDir. */
  static getInstance(workDir: string): AssistantSkillConfigStore {
    if (!AssistantSkillConfigStore.instance) {
      AssistantSkillConfigStore.instance = new AssistantSkillConfigStore(workDir);
    }
    return AssistantSkillConfigStore.instance;
  }

  /** Reset singleton (for testing). */
  static resetInstance(): void {
    AssistantSkillConfigStore.instance = undefined;
  }

  /** Load all configs from disk. Returns cached value on subsequent calls. */
  private async loadAll(): Promise<Record<string, AssistantSkillConfig>> {
    if (this.cache) return this.cache;

    if (!existsSync(this.configPath)) {
      this.cache = {};
      return this.cache;
    }

    try {
      const raw = await fs.readFile(this.configPath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.cache = parsed as Record<string, AssistantSkillConfig>;
      } else {
        console.warn('[AssistantSkillConfigStore] Invalid config format, using empty config');
        this.cache = {};
      }
    } catch (error) {
      console.warn('[AssistantSkillConfigStore] Failed to load config, using empty config:', error);
      this.cache = {};
    }

    return this.cache;
  }

  /**
   * Get the skill config for a specific assistant.
   * Returns default `{added:[], blocked:[]}` if no config exists.
   */
  async get(assistantId: string): Promise<AssistantSkillConfig> {
    const all = await this.loadAll();
    return all[assistantId] ?? { added: [], blocked: [] };
  }

  /**
   * Persist the skill config for a specific assistant.
   */
  async update(assistantId: string, config: AssistantSkillConfig): Promise<void> {
    const all = await this.loadAll();
    all[assistantId] = config;

    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const dir = path.dirname(this.configPath);
        if (!existsSync(dir)) {
          await fs.mkdir(dir, { recursive: true });
        }
        await fs.writeFile(this.configPath, JSON.stringify(all, null, 2), 'utf-8');
      } catch (error) {
        console.error('[AssistantSkillConfigStore] Failed to save config:', error);
      }
    });

    await this.writeQueue;
  }
}

/**
 * Initialize the skill IPC bridge.
 * Must be called after initStorage has run so that getSystemDir() returns valid paths.
 */
export function initSkillBridge(): void {
  // skill.get-global-config — Return the full GlobalSkillConfig map
  ipcBridge.skill.getGlobalConfig.provider(async () => {
    const { workDir } = getSystemDir();
    const store = GlobalSkillConfigStore.getInstance(workDir);
    return store.load();
  });

  // skill.set-global-enabled — Toggle a skill's global enabled state
  ipcBridge.skill.setGlobalEnabled.provider(async ({ skillName, enabled }) => {
    const { workDir } = getSystemDir();
    const store = GlobalSkillConfigStore.getInstance(workDir);
    await store.updateSetting(skillName, { enabled, enabledAt: Date.now() });
    return { success: true, msg: `Skill "${skillName}" ${enabled ? 'enabled' : 'disabled'}` };
  });

  // skill.compute-effective — Compute effective skills for an assistant config
  ipcBridge.skill.computeEffective.provider(async ({ assistantConfig }) => {
    const { workDir } = getSystemDir();
    const injector = SkillInjector.getInstance();
    return injector.computeEffectiveSkills(assistantConfig, workDir);
  });

  // skill.repository.list — List all skills in the repository
  ipcBridge.skill.repositoryList.provider(async (filter: SkillFilter | undefined) => {
    const repo = SkillRepository.getInstance();
    return repo.list(filter);
  });

  // skill.repository.get — Get a single skill entry by name
  ipcBridge.skill.repositoryGet.provider(async ({ name }) => {
    const repo = SkillRepository.getInstance();
    return repo.get(name) ?? null;
  });

  // skill.repository.add — Register a skill into the repository
  ipcBridge.skill.repositoryAdd.provider(async ({ skillPath, mode, origin, market, autoEnable: _autoEnable }) => {
    const repo = SkillRepository.getInstance();
    const overrideMeta = origin !== undefined || market !== undefined ? { origin, market } : undefined;
    return repo.add(skillPath, mode, overrideMeta);
  });

  // skill.repository.remove — Remove a skill from the repository
  ipcBridge.skill.repositoryRemove.provider(async ({ name }) => {
    const repo = SkillRepository.getInstance();
    return repo.remove(name);
  });

  // skill.assistant-config.get — Get the per-assistant skill override config
  ipcBridge.skill.assistantConfigGet.provider(async ({ assistantId }) => {
    const { workDir } = getSystemDir();
    const store = AssistantSkillConfigStore.getInstance(workDir);
    return store.get(assistantId);
  });

  // skill.assistant-config.update — Persist the per-assistant skill override config
  ipcBridge.skill.assistantConfigUpdate.provider(async ({ assistantId, config }) => {
    const { workDir } = getSystemDir();
    const store = AssistantSkillConfigStore.getInstance(workDir);
    await store.update(assistantId, config);
    return { success: true, msg: `AssistantSkillConfig for "${assistantId}" updated` };
  });
}
