/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WatchedImportBridge — Background service that monitors CLI skill directories
 * and auto-imports discovered skills into SkillRepository.
 *
 * Watched directories (skipped silently if absent or inaccessible):
 *   - ~/.agents/skills
 *   - ~/.gemini/skills
 *   - ~/.claude/skills
 *   - ~/.config/opencode/skills
 *   - ~/.opencode/skills
 *
 * On startup: scans each directory and calls SkillRepository.add() for every
 * SKILL.md found, using source 'auto-detected'.
 *
 * On file change: debounces 1000ms per directory, then re-scans and imports
 * any new skills. Deleted skills are marked with status 'missing'.
 *
 * The cache directory (~/.config/aionui-skills/cache/) is never watched.
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';
import { SkillRepository } from './SkillRepository';

/** The debounce delay in milliseconds before re-scanning a changed directory. */
const DEBOUNCE_MS = 1000;

/**
 * Resolve CLI skill directories relative to the user's home directory.
 * The cache directory is explicitly excluded here to prevent accidental watching.
 */
function getCliSkillDirs(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.agents', 'skills'),
    path.join(home, '.gemini', 'skills'),
    path.join(home, '.claude', 'skills'),
    path.join(home, '.config', 'opencode', 'skills'),
    path.join(home, '.opencode', 'skills'),
  ];
}

/**
 * WatchedImportBridge — monitors CLI skill directories and auto-imports
 * discovered skills into SkillRepository with source 'auto-detected'.
 */
export class WatchedImportBridge {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start watching all known CLI skill directories.
   *
   * For each directory:
   * 1. Perform an initial scan and import any skills found.
   * 2. Start an fs.watch watcher; debounce re-scans on change events.
   *
   * Directories that do not exist or are inaccessible are skipped silently.
   */
  async start(): Promise<void> {
    const dirs = getCliSkillDirs();

    for (const dir of dirs) {
      // Initial scan — import skills already present
      await this.scanAndImport(dir);

      // Skip watching if the directory does not exist
      if (!fs.existsSync(dir)) {
        continue;
      }

      // Skip if already watching this path
      if (this.watchers.has(dir)) {
        continue;
      }

      try {
        const watcher = fs.watch(dir, (_eventType) => {
          this.scheduleScan(dir);
        });

        watcher.on('error', (err) => {
          console.warn(`[WatchedImportBridge] Watcher error on "${dir}":`, err);
          this.watchers.delete(dir);
        });

        this.watchers.set(dir, watcher);
      } catch (err) {
        console.warn(`[WatchedImportBridge] Cannot watch "${dir}":`, err);
      }
    }
  }

  /**
   * Stop all active directory watchers and cancel pending debounce timers.
   */
  stop(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const watcher of this.watchers.values()) {
      try {
        watcher.close();
      } catch {
        // Ignore close errors
      }
    }
    this.watchers.clear();
  }

  /**
   * Get list of watched paths with their current accessibility status.
   *
   * @returns Array of path + accessible pairs for all candidate directories.
   */
  getWatchedPaths(): Array<{ path: string; accessible: boolean }> {
    const dirs = getCliSkillDirs();
    return dirs.map((dir) => ({
      path: dir,
      accessible: this.watchers.has(dir),
    }));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Schedule a debounced re-scan for a directory.
   * Resets the timer if one is already pending for the same directory.
   */
  private scheduleScan(dir: string): void {
    const existing = this.debounceTimers.get(dir);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(dir);
      void this.scanAndImport(dir);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(dir, timer);
  }

  /**
   * Scan a directory for skill subdirectories and import each into the repository.
   *
   * - Skips directories that don't exist (no error).
   * - Logs a warning and skips on permission errors.
   * - Skips subdirectories that do not contain a SKILL.md file.
   * - Marks existing 'auto-detected' entries that no longer have a SKILL.md as 'missing'.
   */
  private async scanAndImport(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      console.warn(`[WatchedImportBridge] Cannot read directory "${dir}":`, err);
      return;
    }

    const repo = SkillRepository.getInstance();
    const foundSkillNames = new Set<string>();

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }

      const skillFile = path.join(dir, entry.name, 'SKILL.md');

      if (!fs.existsSync(skillFile)) {
        // Not a skill directory — skip silently
        continue;
      }

      foundSkillNames.add(entry.name);

      try {
        await repo.add(skillFile, 'auto-detected');
      } catch (err) {
        console.warn(`[WatchedImportBridge] Failed to import skill "${entry.name}" from "${dir}":`, err);
      }
    }

    // Mark previously-imported skills from this directory as 'missing' if
    // their SKILL.md no longer exists on disk.
    const allAutoDetected = repo.list({ source: 'auto-detected' });
    for (const skillEntry of allAutoDetected) {
      if (
        path.dirname(path.dirname(skillEntry.path)) === dir &&
        !foundSkillNames.has(path.basename(path.dirname(skillEntry.path)))
      ) {
        skillEntry.status = 'missing';
      }
    }
  }
}
