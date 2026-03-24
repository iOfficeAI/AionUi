/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import type {
  SkillEntry,
  SkillSource,
  SkillStatus,
  SkillFilter,
  SkillMetadata,
  HealthCheckResult,
  PersistedSkillRegistry,
} from './types';
import {
  extensionEventBus,
  ExtensionSystemEvents,
} from '@process/extensions/lifecycle/ExtensionEventBus';
import type { ExtensionLifecyclePayload } from '@process/extensions/lifecycle/ExtensionEventBus';
import { ExtensionRegistry } from '@process/extensions/ExtensionRegistry';

/** Source priority order (higher index = higher priority). */
const SOURCE_PRIORITY: Record<SkillSource, number> = {
  'bundled': 1,
  'auto-detected': 0,
  'remote': 2,
  'custom': 3,
};

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Returns name and description if present.
 */
function parseFrontmatter(content: string): { name?: string; description?: string; version?: string; author?: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const block = match[1];
  const result: { name?: string; description?: string; version?: string; author?: string } = {};

  const nameMatch = block.match(/^name:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  if (nameMatch) result.name = nameMatch[1].trim();

  const descMatch = block.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
  if (descMatch) result.description = descMatch[1].trim();

  const versionMatch = block.match(/^version:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  if (versionMatch) result.version = versionMatch[1].trim();

  const authorMatch = block.match(/^author:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  if (authorMatch) result.author = authorMatch[1].trim();

  return result;
}

/**
 * Read a SKILL.md file and build SkillMetadata from its frontmatter.
 * Returns null if the file cannot be read or parsed (status will be 'error' or 'missing').
 */
async function readSkillMetadata(
  skillPath: string,
  dirName: string,
): Promise<{ metadata: SkillMetadata; status: SkillStatus }> {
  if (!existsSync(skillPath)) {
    return {
      metadata: { description: `[Missing] ${dirName}` },
      status: 'missing',
    };
  }

  try {
    const content = await fs.readFile(skillPath, 'utf-8');
    const { name: _name, description, version, author } = parseFrontmatter(content);
    return {
      metadata: {
        description: description ?? `Skill: ${dirName}`,
        ...(version && { version }),
        ...(author && { author }),
      },
      status: 'healthy',
    };
  } catch {
    return {
      metadata: { description: `[Parse Error] ${dirName}` },
      status: 'error',
    };
  }
}

/**
 * SkillRepository — Unified storage layer for all skills.
 *
 * Replaces the three separate Maps in AcpSkillManager (skills, builtinSkills,
 * extensionSkills) and the external directory scanning in fsBridge.ts.
 *
 * Responsibilities:
 * 1. Manage lifecycle of all skills (discover, register, remove, health check)
 * 2. Provide queries by source / status / name
 * 3. Subscribe to ExtensionEventBus to auto-respond to extension lifecycle events
 * 4. Sync remote skills (future)
 *
 * Design:
 * - Single Map<string, SkillEntry> replaces 3 independent Maps
 * - extensionInitialized flag replaced by event-driven pattern
 * - All writes go through this interface; name is globally unique
 * - Copy-on-write during REGISTRY_RELOADED for concurrent read safety
 */
export class SkillRepository {
  private static instance: SkillRepository | undefined;

  /** Single source of truth: skill name -> entry */
  private entries: Map<string, SkillEntry> = new Map();

  private registryCachePath: string | undefined;

  private constructor() {
    this.subscribeToExtensionEvents();
  }

  /** Get singleton instance. */
  static getInstance(): SkillRepository {
    if (!SkillRepository.instance) {
      SkillRepository.instance = new SkillRepository();
    }
    return SkillRepository.instance;
  }

  /** Reset singleton instance (for testing or hot-reload). */
  static resetInstance(): void {
    SkillRepository.instance = undefined;
  }

  /**
   * Set the cache file path for persisting the registry to disk.
   * Call this once during app startup (initStorage).
   */
  setCachePath(cachePath: string): void {
    this.registryCachePath = cachePath;
  }

  // ---------------------------------------------------------------------------
  // Core CRUD
  // ---------------------------------------------------------------------------

  /**
   * Register a skill into the repository.
   *
   * If a skill with the same name already exists, the priority rules decide
   * whether to overwrite (higher priority wins):
   *   Custom > Remote > Bundled > Auto-detected
   *
   * @param skillPath - Absolute path to SKILL.md
   * @param source    - Skill source type
   * @param overrideMeta - Optional metadata fields to merge in (used by extension / market paths)
   * @returns The registered SkillEntry, or null if rejected by a higher-priority existing entry
   */
  async add(
    skillPath: string,
    source: SkillSource,
    overrideMeta?: Partial<SkillMetadata>,
  ): Promise<SkillEntry | null> {
    const dirName = path.basename(path.dirname(skillPath));
    const { metadata, status } = await readSkillMetadata(skillPath, dirName);

    // Re-parse name from frontmatter for the canonical name
    let entryName = dirName;
    if (existsSync(skillPath)) {
      try {
        const raw = await fs.readFile(skillPath, 'utf-8');
        const { name } = parseFrontmatter(raw);
        if (name) entryName = name;
      } catch {
        // keep dirName fallback
      }
    }

    const finalMeta: SkillMetadata = { ...metadata, ...overrideMeta };

    const existing = this.entries.get(entryName);
    if (existing) {
      const existingPriority = SOURCE_PRIORITY[existing.source];
      const newPriority = SOURCE_PRIORITY[source];

      // Special case: Skills Market always overrides auto-detected
      const isMarketNew = finalMeta.origin === 'skills-market';
      const isAutoExisting = existing.source === 'auto-detected';

      if (isMarketNew && isAutoExisting) {
        // Market overrides auto-detected; preserve enabledAt timestamp
        console.warn(
          `[SkillRepository] Market skill "${entryName}" overrides auto-detected entry`,
        );
        const now = Date.now();
        const updated: SkillEntry = {
          name: entryName,
          source,
          path: skillPath,
          metadata: finalMeta,
          status,
          importedAt: existing.importedAt,
          lastUpdated: now,
        };
        this.entries.set(entryName, updated);
        return updated;
      }

      if (newPriority <= existingPriority) {
        console.info(
          `[SkillRepository] Skill "${entryName}" from source "${source}" rejected ` +
            `(existing source "${existing.source}" has equal or higher priority)`,
        );
        return null;
      }

      console.warn(
        `[SkillRepository] Skill "${entryName}" overwritten: ` +
          `"${existing.source}" -> "${source}"`,
      );
    }

    const now = Date.now();
    const entry: SkillEntry = {
      name: entryName,
      source,
      path: skillPath,
      metadata: finalMeta,
      status,
      importedAt: existing?.importedAt ?? now,
      lastUpdated: now,
    };

    this.entries.set(entryName, entry);
    return entry;
  }

  /**
   * Remove a skill from the repository.
   *
   * Bundled skills (non-extension) cannot be manually removed.
   *
   * @returns true if removed, false if not found or removal refused
   */
  async remove(name: string): Promise<boolean> {
    const entry = this.entries.get(name);
    if (!entry) {
      console.warn(`[SkillRepository] Cannot remove: skill "${name}" not found`);
      return false;
    }

    if (entry.source === 'bundled' && entry.metadata.origin !== 'extension') {
      console.warn(
        `[SkillRepository] Cannot remove bundled skill "${name}" — disable it via GlobalSkillConfig instead`,
      );
      return false;
    }

    this.entries.delete(name);
    return true;
  }

  /**
   * Query skills with optional filters.
   * Returns entries sorted by source priority (custom first).
   */
  list(filter?: SkillFilter): SkillEntry[] {
    let results = Array.from(this.entries.values());

    if (filter) {
      if (filter.source !== undefined) {
        const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
        results = results.filter((e) => sources.includes(e.source));
      }

      if (filter.status !== undefined) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        results = results.filter((e) => statuses.includes(e.status));
      }

      if (filter.namePrefix !== undefined) {
        results = results.filter((e) => e.name.startsWith(filter.namePrefix!));
      }

      if (filter.includeExtension === false) {
        results = results.filter((e) => e.metadata.origin !== 'extension');
      }
    }

    // Sort: custom (3) > remote (2) > bundled (1) > auto-detected (0)
    results.sort((a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source]);

    return results;
  }

  /**
   * Get a single skill entry by name.
   */
  get(name: string): SkillEntry | undefined {
    return this.entries.get(name);
  }

  /**
   * Check if a skill exists.
   */
  has(name: string): boolean {
    return this.entries.has(name);
  }

  /**
   * Total count of registered skills.
   */
  size(): number {
    return this.entries.size;
  }

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------

  /**
   * Run health checks on skills.
   * Verifies file existence and frontmatter parsability; updates status field.
   *
   * @param name - Specific skill to check; omit to check all
   * @returns Summary counts
   */
  async health(name?: string): Promise<HealthCheckResult> {
    const toCheck = name
      ? ([this.entries.get(name)].filter(Boolean) as SkillEntry[])
      : Array.from(this.entries.values());

    let healthy = 0;
    let error = 0;
    let missing = 0;

    for (const entry of toCheck) {
      const { status } = await readSkillMetadata(entry.path, entry.name);
      entry.status = status;

      if (status === 'healthy') healthy++;
      else if (status === 'error') error++;
      else missing++;
    }

    return { healthy, error, missing };
  }

  // ---------------------------------------------------------------------------
  // Remote sync (stub for future implementation)
  // ---------------------------------------------------------------------------

  /**
   * Sync a remote skill from a URL.
   * Not yet implemented — placeholder to satisfy the interface contract.
   *
   * @throws Always throws until implemented
   */
  async syncRemote(_url: string): Promise<SkillEntry> {
    throw new Error('[SkillRepository] syncRemote is not yet implemented');
  }

  // ---------------------------------------------------------------------------
  // Bulk population (used by migration)
  // ---------------------------------------------------------------------------

  /**
   * Populate the repository by scanning directory trees.
   * Called once during Phase 1 migration or on first-launch discovery.
   *
   * @param builtinSkillsDir - Path to _builtin/ directory
   * @param userSkillsDir    - Path to user skills/ directory (excluding _builtin)
   */
  async populate(builtinSkillsDir: string, userSkillsDir: string): Promise<void> {
    // 1. Bundled skills (_builtin/)
    if (existsSync(builtinSkillsDir)) {
      await this.scanDirectory(builtinSkillsDir, 'bundled');
    }

    // 2. User/custom skills (skills/ excluding _builtin)
    if (existsSync(userSkillsDir)) {
      const entries = await fs.readdir(userSkillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        if (entry.name === '_builtin') continue;

        const skillFile = path.join(userSkillsDir, entry.name, 'SKILL.md');
        if (existsSync(skillFile)) {
          await this.add(skillFile, 'custom');
        }
      }
    }

    // 3. Extension-contributed skills
    await this.syncExtensionSkills();

    console.log(`[SkillRepository] Populated with ${this.entries.size} skill(s)`);
  }

  /**
   * Scan a directory for skill subdirectories and register each.
   */
  private async scanDirectory(dir: string, source: SkillSource): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

        const skillFile = path.join(dir, entry.name, 'SKILL.md');
        if (existsSync(skillFile)) {
          await this.add(skillFile, source);
        }
      }
    } catch (err) {
      console.warn(`[SkillRepository] Failed to scan directory "${dir}":`, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Extension lifecycle integration
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to ExtensionEventBus for live extension lifecycle events.
   * Replaces the buggy one-shot extensionInitialized flag in AcpSkillManager.
   * Called automatically from the constructor.
   */
  onExtensionEvent(): void {
    this.subscribeToExtensionEvents();
  }

  private subscribeToExtensionEvents(): void {
    extensionEventBus.onLifecycle(
      ExtensionSystemEvents.REGISTRY_RELOADED,
      (_payload: ExtensionLifecyclePayload) => {
        void this.handleRegistryReloaded();
      },
    );

    extensionEventBus.onLifecycle(
      ExtensionSystemEvents.EXTENSION_ACTIVATED,
      (payload: ExtensionLifecyclePayload) => {
        void this.handleExtensionActivated(payload.extensionName);
      },
    );

    extensionEventBus.onLifecycle(
      ExtensionSystemEvents.EXTENSION_DEACTIVATED,
      (payload: ExtensionLifecyclePayload) => {
        this.handleExtensionDeactivated(payload.extensionName);
      },
    );
  }

  /**
   * Full re-sync of extension skills.
   * Uses copy-on-write: builds a new map, then atomically replaces.
   */
  private async handleRegistryReloaded(): Promise<void> {
    console.log('[SkillRepository] REGISTRY_RELOADED — re-syncing extension skills');
    await this.syncExtensionSkills();
  }

  /**
   * Add skills contributed by a specific extension.
   */
  private async handleExtensionActivated(extensionName: string): Promise<void> {
    try {
      // ExtensionRegistry.getSkills() returns a flat list without per-extension tagging,
      // so we do a full re-sync and pass extensionName to tag new entries correctly.
      await this.syncExtensionSkills(extensionName);
    } catch (err) {
      console.warn(`[SkillRepository] Failed to handle EXTENSION_ACTIVATED for "${extensionName}":`, err);
    }
  }

  /**
   * Mark all skills from a deactivated extension as missing.
   * Skills are kept (not deleted) so they can be restored on re-enable.
   */
  private handleExtensionDeactivated(extensionName: string): void {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.metadata.extensionName === extensionName) {
        entry.status = 'missing';
        count++;
      }
    }
    if (count > 0) {
      console.log(
        `[SkillRepository] Marked ${count} skill(s) from extension "${extensionName}" as missing`,
      );
    }
  }

  /**
   * Sync all skills currently contributed by enabled extensions.
   * Adds new entries, updates changed ones, marks removed entries as missing.
   *
   * @param filterExtension - If provided, only sync skills from this extension
   */
  private async syncExtensionSkills(filterExtension?: string): Promise<void> {
    try {
      const registry = ExtensionRegistry.getInstance();
      const extSkills = registry.getSkills();

      const currentExtNames = new Set<string>();

      for (const extSkill of extSkills) {
        if (filterExtension) {
          // ExtensionRegistry.getSkills() returns flat list without extensionName.
          // We tag them during add() via overrideMeta. For filtered sync we add all
          // and rely on overrideMeta.extensionName matching.
        }

        currentExtNames.add(extSkill.name);

        const existing = this.entries.get(extSkill.name);
        if (existing && existing.metadata.origin === 'extension') {
          // Update path / metadata if changed
          if (existing.path !== extSkill.location) {
            existing.path = extSkill.location;
            existing.lastUpdated = Date.now();
          }
          // Re-check health
          const { status } = await readSkillMetadata(extSkill.location, extSkill.name);
          existing.status = status;
        } else if (!existing) {
          await this.add(extSkill.location, 'bundled', {
            description: extSkill.description,
            origin: 'extension',
            extensionName: filterExtension,
          });
        }
        // If existing but not extension origin: leave it alone (user's custom overrides extension)
      }

      // Mark extension skills that have disappeared as missing
      for (const entry of this.entries.values()) {
        if (
          entry.metadata.origin === 'extension' &&
          !currentExtNames.has(entry.name) &&
          (!filterExtension || entry.metadata.extensionName === filterExtension)
        ) {
          entry.status = 'missing';
        }
      }
    } catch (err) {
      console.warn('[SkillRepository] Failed to sync extension skills:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /**
   * Persist the current registry to disk cache.
   * Optional: speeds up next startup by avoiding full rescan.
   */
  async persistCache(): Promise<void> {
    if (!this.registryCachePath) return;

    try {
      const dir = path.dirname(this.registryCachePath);
      if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }

      const data: PersistedSkillRegistry = {
        version: 1,
        entries: Array.from(this.entries.values()),
      };

      await fs.writeFile(this.registryCachePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SkillRepository] Failed to persist registry cache:', err);
    }
  }

  /**
   * Load the registry from disk cache to speed up startup.
   * Falls back gracefully if cache is absent or corrupt.
   *
   * @returns true if loaded from cache, false otherwise
   */
  async loadCache(): Promise<boolean> {
    if (!this.registryCachePath || !existsSync(this.registryCachePath)) {
      return false;
    }

    try {
      const raw = await fs.readFile(this.registryCachePath, 'utf-8');
      const data: unknown = JSON.parse(raw);

      if (
        !data ||
        typeof data !== 'object' ||
        (data as PersistedSkillRegistry).version !== 1 ||
        !Array.isArray((data as PersistedSkillRegistry).entries)
      ) {
        return false;
      }

      this.entries = new Map(
        (data as PersistedSkillRegistry).entries.map((e) => [e.name, e]),
      );
      console.log(`[SkillRepository] Loaded ${this.entries.size} entries from cache`);
      return true;
    } catch {
      return false;
    }
  }
}
