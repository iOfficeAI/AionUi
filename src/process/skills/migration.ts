/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 1 Migration — Skill System Redesign
 *
 * Runs once on first launch after the skill-system redesign ships.
 * Scans existing skill directories, populates SkillRepository, and creates
 * the initial GlobalSkillConfig from preset defaults.
 *
 * Idempotent: a marker file prevents re-execution on subsequent launches.
 *
 * Design doc reference: docs/design/skill-system-redesign.md § Section 5, Phase 1
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { ASSISTANT_PRESETS } from '@/common/config/presets/assistantPresets';
import type { GlobalSkillConfig } from './types';
import { SkillRepository } from './SkillRepository';
import { GlobalSkillConfigStore } from './GlobalSkillConfigStore';

/** Marker file path — written after successful migration to prevent re-runs. */
const MIGRATION_MARKER_FILENAME = '.skill_repo_v2_migrated';

/**
 * Check whether the Phase 1 migration has already run.
 */
export async function needsPhase1Migration(workDir: string): Promise<boolean> {
  const markerPath = path.join(workDir, MIGRATION_MARKER_FILENAME);
  try {
    await fs.access(markerPath);
    return false; // marker present → already migrated
  } catch {
    return true; // marker absent → migration required
  }
}

/**
 * Run the full Phase 1 migration.
 *
 * Steps:
 *   1. Backup legacy skill data
 *   2. Populate SkillRepository from existing directories
 *   3. Create initial GlobalSkillConfig from ASSISTANT_PRESETS defaults
 *   4. Write marker file
 *
 * On any error, attempts to restore backups and rethrows so initStorage
 * can log the failure without crashing app startup.
 */
export async function runPhase1Migration(
  workDir: string,
  builtinSkillsDir: string,
  userSkillsDir: string,
  configDir: string
): Promise<void> {
  const markerPath = path.join(workDir, MIGRATION_MARKER_FILENAME);

  await backupLegacySkillData(workDir, configDir);

  try {
    // Populate SkillRepository from existing on-disk skills
    const repo = SkillRepository.getInstance();
    await repo.populate(builtinSkillsDir, userSkillsDir);

    // Create GlobalSkillConfig if it does not yet exist
    const store = GlobalSkillConfigStore.getInstance(configDir);
    await createInitialGlobalConfig(store);

    // Write marker to prevent re-running
    await fs.writeFile(markerPath, Date.now().toString(), 'utf-8');

    console.log('[SkillMigration] Phase 1 complete');
  } catch (error) {
    await restoreLegacySkillData(workDir, configDir);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Backup / restore helpers
// ---------------------------------------------------------------------------

function backupDir(workDir: string): string {
  return path.join(workDir, 'backups', 'v1');
}

async function backupLegacySkillData(workDir: string, configDir: string): Promise<void> {
  const bkDir = backupDir(workDir);
  try {
    await fs.mkdir(bkDir, { recursive: true });

    // Back up custom_external_skill_paths.json if present
    const customPathsFile = path.join(configDir, 'custom_external_skill_paths.json');
    if (existsSync(customPathsFile)) {
      await fs.copyFile(customPathsFile, path.join(bkDir, 'custom_external_skill_paths.json'));
    }

    // Back up existing GlobalSkillConfig if present
    const skillsConfigFile = path.join(configDir, 'skills.json');
    if (existsSync(skillsConfigFile)) {
      await fs.copyFile(skillsConfigFile, path.join(bkDir, 'global_skill_config.json'));
    }
  } catch (err) {
    // Backup failure is non-fatal — log and continue
    console.warn('[SkillMigration] Backup step encountered an error (non-fatal):', err);
  }
}

async function restoreLegacySkillData(workDir: string, configDir: string): Promise<void> {
  const bkDir = backupDir(workDir);
  if (!existsSync(bkDir)) return;

  try {
    const backupCustomPaths = path.join(bkDir, 'custom_external_skill_paths.json');
    if (existsSync(backupCustomPaths)) {
      await fs.copyFile(backupCustomPaths, path.join(configDir, 'custom_external_skill_paths.json'));
    }

    const backupSkillsConfig = path.join(bkDir, 'global_skill_config.json');
    if (existsSync(backupSkillsConfig)) {
      await fs.copyFile(backupSkillsConfig, path.join(configDir, 'skills.json'));
    }

    console.log('[SkillMigration] Restored legacy skill data from backup');
  } catch (restoreErr) {
    console.error('[SkillMigration] Restore failed — manual intervention may be needed:', restoreErr);
  }
}

// ---------------------------------------------------------------------------
// Initial GlobalSkillConfig creation
// ---------------------------------------------------------------------------

/**
 * Build the initial GlobalSkillConfig from ASSISTANT_PRESETS defaultEnabledSkills.
 * Idempotent: skips if config already exists.
 */
async function createInitialGlobalConfig(store: GlobalSkillConfigStore): Promise<void> {
  const existing = await store.load();
  if (Object.keys(existing).length > 0) {
    return; // already populated — skip
  }

  const allDefaultSkills = new Set<string>();
  for (const preset of ASSISTANT_PRESETS) {
    for (const skillName of preset.defaultEnabledSkills ?? []) {
      allDefaultSkills.add(skillName);
    }
  }

  const now = Date.now();
  const initialConfig: GlobalSkillConfig = {};
  for (const skillName of allDefaultSkills) {
    initialConfig[skillName] = { enabled: true, enabledAt: now };
  }

  await store.save(initialConfig);
  console.log(`[SkillMigration] Created initial GlobalSkillConfig with ${allDefaultSkills.size} skill(s)`);
}
