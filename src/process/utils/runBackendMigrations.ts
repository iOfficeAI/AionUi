/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { migrateConfigStorage, migrateProviders } from '@/common/config/configMigration';
import { httpRequest } from '@/common/adapter/httpBridge';
import type { ProcessConfig as ProcessConfigType } from './initStorage';
import { migrateAssistantsToBackend } from './migrateAssistants';

type ConfigFile = typeof ProcessConfigType;
type MigrationStepResult = boolean;

const LEGACY_BACKEND_CLIENT_PREFERENCE_KEYS = [
  'assistants',
  'migration.assistantEnabledFixed',
  'migration.coworkDefaultSkillsAdded',
  'migration.builtinDefaultSkillsAdded_v2',
  'migration.promptsI18nAdded',
  'migration.assistantsSplitCustom',
] as const;

async function cleanupLegacyClientPreferences(): Promise<void> {
  const payload = Object.fromEntries(LEGACY_BACKEND_CLIENT_PREFERENCE_KEYS.map((key): [string, null] => [key, null]));
  await httpRequest<void>('PUT', '/api/settings/client', payload);
}

const CLEANUP_STEPS: Array<{
  name: string;
  run: () => Promise<void>;
}> = [{ name: 'cleanupLegacyClientPreferences', run: async () => cleanupLegacyClientPreferences() }];

const MIGRATION_STEPS: Array<{
  name: string;
  run: (configFile: ConfigFile) => Promise<MigrationStepResult>;
}> = [
  { name: 'migrateConfigStorage', run: async (configFile) => (await migrateConfigStorage(configFile), true) },
  { name: 'migrateProviders', run: async (configFile) => (await migrateProviders(configFile), true) },
  { name: 'migrateAssistantsToBackend', run: async (configFile) => migrateAssistantsToBackend(configFile) },
];

export async function runBackendMigrations(configFile: ConfigFile): Promise<void> {
  let allSucceeded = true;

  await CLEANUP_STEPS.reduce<Promise<void>>(async (previous, step) => {
    await previous;
    try {
      await step.run();
      console.info(`[AionUi] Backend migration step completed: ${step.name}`);
    } catch (error) {
      allSucceeded = false;
      console.error(`[AionUi] Backend migration step failed: ${step.name}`, error);
    }
  }, Promise.resolve());

  const electronConfigImported = await configFile.get('migration.electronConfigImported').catch(() => false);
  if (electronConfigImported === true) {
    console.info('[AionUi] Backend migrations skipped: migration.electronConfigImported already true');
    return;
  }

  await MIGRATION_STEPS.reduce<Promise<void>>(async (previous, step) => {
    await previous;
    try {
      const completed = await step.run(configFile);
      if (!completed) {
        allSucceeded = false;
        console.warn(`[AionUi] Backend migration step incomplete: ${step.name}`);
        return;
      }
      console.info(`[AionUi] Backend migration step completed: ${step.name}`);
    } catch (error) {
      allSucceeded = false;
      console.error(`[AionUi] Backend migration step failed: ${step.name}`, error);
    }
  }, Promise.resolve());

  if (!allSucceeded) {
    return;
  }

  try {
    await configFile.set('migration.electronConfigImported', true);
    console.info('[AionUi] Backend migrations complete: migration.electronConfigImported=true');
  } catch (error) {
    console.error('[AionUi] Failed to mark backend migrations complete:', error);
  }
}
