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
 * backend manifest at
 * `aionui-backend/crates/aionui-app/assets/builtin-assistants/preset-id-whitelist.json`
 * — add/remove ids in the same PR. Drift means a user-authored assistant
 * whose id accidentally matches a built-in slug will be imported into the
 * user table and then silently overwritten the next time the backend ships
 * a matching built-in. The legacy `builtin-` prefix check handles the common
 * case; this whitelist is the guard for unprefixed ids.
 */
const PRESET_ID_WHITELIST = new Set<string>([
  'word-creator',
  'ppt-creator',
  'excel-creator',
  'morph-ppt',
  'morph-ppt-3d',
  'pitch-deck-creator',
  'dashboard-creator',
  'academic-paper',
  'financial-model-creator',
  'star-office-helper',
  'openclaw-setup',
  'cowork',
  'game-3d',
  'ui-ux-pro-max',
  'planning-with-files',
  'human-3-coach',
  'social-job-publisher',
  'moltbook',
  'beautiful-mermaid',
  'story-roleplay',
]);

function isLegacyBuiltin(a: Record<string, unknown>): boolean {
  const id = typeof a.id === 'string' ? a.id : '';
  return id.startsWith(BUILTIN_ID_PREFIX) || PRESET_ID_WHITELIST.has(id);
}

function generateCollisionId(): string {
  const ms = Date.now();
  const hex = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0');
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
 *
 * Exported so the mapper can be unit-tested in isolation. Legacy input keeps
 * its historical camelCase shape; output matches the backend snake_case wire
 * contract.
 */
export function legacyAssistantToCreateRequest(legacy: Record<string, unknown>): CreateAssistantRequest {
  const legacyId = typeof legacy.id === 'string' ? legacy.id : '';

  // Rename colliding user-authored ids to preserve data (spec §8.1).
  const id = PRESET_ID_WHITELIST.has(legacyId) ? generateCollisionId() : legacyId;

  const name = typeof legacy.name === 'string' && legacy.name.trim().length > 0 ? legacy.name : 'Untitled';
  const description = typeof legacy.description === 'string' ? legacy.description : undefined;
  const avatar = typeof legacy.avatar === 'string' ? legacy.avatar : undefined;
  const preset_agent_type = typeof legacy.presetAgentType === 'string' ? legacy.presetAgentType : 'gemini';

  return {
    id,
    name,
    description,
    avatar,
    preset_agent_type,
    enabled_skills: asStringArray(legacy.enabledSkills),
    custom_skill_names: asStringArray(legacy.customSkillNames),
    disabled_builtin_skills: asStringArray(legacy.disabledBuiltinSkills),
    prompts: asStringArray(legacy.prompts),
    models: asStringArray(legacy.models),
    name_i18n: asStringRecord(legacy.nameI18n),
    description_i18n: asStringRecord(legacy.descriptionI18n),
    prompts_i18n: asStringArrayRecord(legacy.promptsI18n),
  };
}

type ConfigFile = typeof ProcessConfigType;

type BuiltinOverride = { id: string; enabled: false };

/**
 * Collect user-set `enabled=false` overrides on legacy built-in rows so we can
 * replay them against the backend's `assistant_overrides` table post-import.
 *
 * Legacy frontend ids carry a `builtin-` prefix (e.g. `builtin-word-creator`)
 * but the backend manifest uses bare slugs (`word-creator`). Strip the prefix
 * before emitting; leave unprefixed whitelist hits as-is.
 */
function collectBuiltinOverrides(legacy: Record<string, unknown>[]): BuiltinOverride[] {
  const overrides: BuiltinOverride[] = [];
  for (const row of legacy) {
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id) continue;
    const isBuiltin = id.startsWith(BUILTIN_ID_PREFIX) || PRESET_ID_WHITELIST.has(id);
    if (!isBuiltin) continue;
    if (row.enabled !== false) continue;
    const backendId = id.startsWith(BUILTIN_ID_PREFIX) ? id.slice(BUILTIN_ID_PREFIX.length) : id;
    overrides.push({ id: backendId, enabled: false });
  }
  return overrides;
}

/**
 * Replay disabled-state overrides onto the backend's `assistant_overrides`
 * table via PATCH /api/assistants/{id}/state. Returns the count of failures
 * so the caller can keep the migration flag false and retry on next launch.
 * Runs in parallel because each upsert is independent and the set is small
 * (single-digit count in practice).
 */
async function applyBuiltinOverrides(overrides: BuiltinOverride[]): Promise<number> {
  if (overrides.length === 0) return 0;
  const results = await Promise.allSettled(
    overrides.map((ov) => ipcBridge.assistants.setState.invoke({ id: ov.id, enabled: ov.enabled }))
  );
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      failed += 1;
      console.error(`[AionUi] Failed to apply builtin override for ${overrides[i].id}:`, r.reason);
    }
  });
  if (failed === 0) {
    console.log(`[AionUi] Applied ${overrides.length} builtin disabled-state override(s)`);
  } else {
    console.error(`[AionUi] Builtin override partial: ${failed}/${overrides.length} failed`);
  }
  return failed;
}

/**
 * One-shot import of legacy `ConfigStorage.get('assistants')` into the backend
 * after the backend is healthy. Two phases:
 *
 *   1. POST /api/assistants/import for user-authored rows (insert-only, so
 *      retries are idempotent).
 *   2. PATCH /api/assistants/{id}/state for each legacy built-in that the
 *      user had disabled, so the `enabled=false` preference survives the
 *      migration to the backend's `assistant_overrides` table.
 *
 * Flag `migration.electronConfigImported` only flips true when BOTH phases
 * complete cleanly (or when there is nothing to do). Any failure keeps the
 * flag false so the next launch retries.
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
  const builtinOverrides = collectBuiltinOverrides(legacy);

  // Nothing to do at all — flag flips true immediately.
  if (userAssistants.length === 0 && builtinOverrides.length === 0) {
    await configFile.set('migration.electronConfigImported', true);
    return;
  }

  // Phase 1: import user-authored assistants (if any).
  if (userAssistants.length > 0) {
    try {
      const result = await ipcBridge.assistants.import.invoke({
        assistants: userAssistants.map(legacyAssistantToCreateRequest),
      });
      if (result.failed !== 0) {
        console.error(`[AionUi] Assistant migration partial: ${result.failed} failed`, result.errors);
        // Keep flag false; next launch retries. Insert-only on backend so
        // already-imported rows will skip rather than clobber.
        return;
      }
      console.log(`[AionUi] Migrated ${result.imported} assistants (skipped ${result.skipped})`);
    } catch (error) {
      console.error('[AionUi] Assistant migration failed:', error);
      return;
    }
  }

  // Phase 2: replay disabled-state overrides for built-ins.
  const overrideFailures = await applyBuiltinOverrides(builtinOverrides);
  if (overrideFailures > 0) {
    // Partial override failure — retry on next launch. setState is an upsert
    // on the backend side, so replaying is safe.
    return;
  }

  await configFile.set('migration.electronConfigImported', true);
}
