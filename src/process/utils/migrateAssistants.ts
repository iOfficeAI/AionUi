/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { CreateAssistantRequest } from '@/common/types/assistantTypes';
import type { ProcessConfig as ProcessConfigType } from './initStorage';

const BUILTIN_ID_PREFIX = 'builtin-';

/**
 * Frozen snapshot of built-in assistant ids. Must stay in sync with the
 * backend manifest at `crates/aionui-app/assets/builtin-assistants/assistants.json`
 * (and the `preset-id-whitelist.json` fixture shipped alongside it).
 *
 * Drift here means a user-authored assistant whose id accidentally matches a
 * built-in slug will be imported into the user table and then silently
 * overwritten the next time the backend ships a matching built-in. The legacy
 * `builtin-` prefix check below catches the vast majority of cases; this
 * whitelist is the belt-and-suspenders guard for unprefixed ids.
 *
 * TODO(T3b.3): Populate from the final assistants.json manifest once T1b
 * (backend-dev) lands. Tracked in coordinator follow-up; safe to land empty
 * because every legacy built-in id in the frontend catalog used the
 * `builtin-` prefix.
 */
const PRESET_ID_WHITELIST = new Set<string>([]);

function isLegacyBuiltin(a: Record<string, unknown>): boolean {
  const id = typeof a.id === 'string' ? a.id : '';
  return id.startsWith(BUILTIN_ID_PREFIX) || PRESET_ID_WHITELIST.has(id);
}

function generateCollisionId(): string {
  const ms = Date.now();
  const hex = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `custom-migrated-${ms}-${hex}`;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function asStringArrayRecord(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      const arr = v.filter((x): x is string => typeof x === 'string');
      if (arr.length > 0) out[k] = arr;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const arr = value.filter((x): x is string => typeof x === 'string');
  return arr.length > 0 ? arr : undefined;
}

/**
 * Adapt a legacy `AcpBackendConfig`-shaped row from the Electron config file
 * into the backend `CreateAssistantRequest` contract. Drops CLI-specific
 * fields (cliCommand, defaultCliPath, acpArgs, env) and the redundant
 * isPreset/isBuiltin flags.
 */
function toBackendShape(legacy: Record<string, unknown>): CreateAssistantRequest {
  const legacyId = typeof legacy.id === 'string' ? legacy.id : '';

  // Rename colliding user-authored ids to preserve data (spec §8.1).
  const id = PRESET_ID_WHITELIST.has(legacyId) ? generateCollisionId() : legacyId;

  const name = typeof legacy.name === 'string' && legacy.name.trim().length > 0 ? legacy.name : 'Untitled';
  const description = typeof legacy.description === 'string' ? legacy.description : undefined;
  const avatar = typeof legacy.avatar === 'string' ? legacy.avatar : undefined;
  const presetAgentType =
    typeof legacy.presetAgentType === 'string' ? legacy.presetAgentType : 'gemini';

  return {
    id,
    name,
    description,
    avatar,
    presetAgentType,
    enabledSkills: asStringArray(legacy.enabledSkills),
    customSkillNames: asStringArray(legacy.customSkillNames),
    disabledBuiltinSkills: asStringArray(legacy.disabledBuiltinSkills),
    prompts: asStringArray(legacy.prompts),
    models: asStringArray(legacy.models),
    nameI18n: asStringRecord(legacy.nameI18n),
    descriptionI18n: asStringRecord(legacy.descriptionI18n),
    promptsI18n: asStringArrayRecord(legacy.promptsI18n),
  };
}

type ConfigFile = typeof ProcessConfigType;

/**
 * One-shot import of legacy `ConfigStorage.get('assistants')` into the backend
 * after the backend is healthy. Idempotent: the backend's import endpoint is
 * insert-only (skips on conflict), so retries never clobber post-migration
 * edits. Flag `migration.electronConfigImported` is only set when the run
 * fully succeeds.
 *
 * Honors `AIONUI_SKIP_ELECTRON_MIGRATION=1` so E2E fixtures can seed via
 * `POST /api/assistants/import` directly.
 */
export async function migrateAssistantsToBackend(configFile: ConfigFile): Promise<void> {
  if (process.env.AIONUI_SKIP_ELECTRON_MIGRATION === '1') {
    console.log('[AionUi] Assistant migration skipped (env flag set)');
    return;
  }

  const imported = await configFile.get('migration.electronConfigImported').catch(() => false);
  if (imported) return;

  // The legacy `assistants` key was removed from IConfigStorageRefer in T3a,
  // but the file on disk may still carry it. Read defensively.
  const rawConfigFile = configFile as unknown as {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<unknown>;
  };
  const legacyValue = await rawConfigFile.get('assistants').catch(() => [] as unknown);
  const legacy = (Array.isArray(legacyValue) ? legacyValue : []) as Record<string, unknown>[];

  const userAssistants = legacy.filter((a) => !isLegacyBuiltin(a));
  if (userAssistants.length === 0) {
    await configFile.set('migration.electronConfigImported', true);
    return;
  }

  try {
    const result = await ipcBridge.assistants.import.invoke({
      assistants: userAssistants.map(toBackendShape),
    });
    if (result.failed === 0) {
      await configFile.set('migration.electronConfigImported', true);
      console.log(
        `[AionUi] Migrated ${result.imported} assistants (skipped ${result.skipped})`,
      );
    } else {
      console.error(
        `[AionUi] Assistant migration partial: ${result.failed} failed`,
        result.errors,
      );
      // Flag stays false so the next launch retries. Imports are insert-only
      // on the backend, so already-imported rows skip rather than clobber.
    }
  } catch (error) {
    console.error('[AionUi] Assistant migration failed:', error);
  }
}
