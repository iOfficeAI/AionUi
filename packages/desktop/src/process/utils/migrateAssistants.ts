/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { CreateAssistantRequest } from '@/common/types/agent/assistantTypes';
import type { ProcessConfig as ProcessConfigType } from './initStorage';

const BUILTIN_ID_PREFIX = 'builtin-';

/**
 * The legacy Electron build shipped `'gemini'` as the fallback agent type for
 * every assistant (built-in and user). The current backend ships `'aionrs'` as
 * the built-in default — the internal Gemini engine was removed, and what
 * remains with the name "gemini" is a distinct ACP backend the user must
 * install. Treat the legacy default as "no explicit choice" and promote it to
 * the current default, so users who never touched the agent picker don't find
 * all their assistants pointing at a backend that is no longer there on boot.
 * Users who *explicitly* picked `'codex' / 'claude' / 'qwen' / …` keep their
 * choice (see `collectBuiltinPresetAgentTypeOverrides`).
 */
const LEGACY_DEFAULT_PRESET_AGENT_TYPE = 'gemini';
const CURRENT_DEFAULT_PRESET_AGENT_TYPE = 'aionrs';

/**
 * Normalise a legacy `presetAgentType` for migration. Absent / non-string /
 * the legacy default → current default. Everything else is preserved verbatim.
 */
function normalisePresetAgentType(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw === LEGACY_DEFAULT_PRESET_AGENT_TYPE) {
    return CURRENT_DEFAULT_PRESET_AGENT_TYPE;
  }
  return raw;
}

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
  'word-form-creator',
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
 * Adapt a legacy assistant row from the Electron config file (previously
 * typed as the legacy `AcpBackendConfig` shape) into the backend `CreateAssistantRequest`
 * contract. Drops CLI-specific fields (cliCommand, defaultCliPath, acpArgs,
 * env) and the redundant isPreset/isBuiltin flags.
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
  const preset_agent_type = normalisePresetAgentType(legacy.presetAgentType);

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
type BuiltinAgentTypeOverride = { id: string; preset_agent_type: string };

type LegacyConfigAccessor = {
  get: (key: string) => Promise<unknown>;
  remove?: (key: string) => Promise<unknown>;
};

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
 *
 * 404 is treated as "skip, not failure" — the legacy row references a built-in
 * id that the current backend manifest no longer ships (e.g. `pdf-to-ppt`,
 * `pptx-generator` were retired). The user's disabled preference is moot
 * because the assistant itself is gone. Counting these as failures would keep
 * the overall migration flag false and trap the user in an endless retry loop
 * on every launch.
 */
async function applyBuiltinOverrides(overrides: BuiltinOverride[]): Promise<number> {
  if (overrides.length === 0) return 0;
  const results = await Promise.allSettled(
    overrides.map((ov) => ipcBridge.assistants.setState.invoke({ id: ov.id, enabled: ov.enabled }))
  );
  let failed = 0;
  let skipped = 0;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const reason = r.reason;
      if (isBackendHttpError(reason) && reason.status === 404) {
        skipped += 1;
        console.warn(
          `[AionUi] Skipped override for retired built-in '${overrides[i].id}' (no longer in backend manifest)`
        );
        return;
      }
      failed += 1;
      console.error(`[AionUi] Failed to apply builtin override for ${overrides[i].id}:`, reason);
    }
  });
  const applied = overrides.length - failed - skipped;
  if (failed === 0) {
    console.log(`[AionUi] Applied ${applied} builtin disabled-state override(s) (skipped ${skipped} retired id(s))`);
  } else {
    console.error(
      `[AionUi] Builtin override partial: ${failed}/${overrides.length} failed, ${skipped} skipped, ${applied} applied`
    );
  }
  return failed;
}

/**
 * Collect `presetAgentType` overrides the user set on legacy built-ins, after
 * comparing against the live backend manifest. Skip a row when:
 *
 *   - The legacy value is absent / the legacy default (`gemini`) — handled by
 *     the backend's own default, no override needed.
 *   - The legacy value equals the current built-in default — writing an
 *     identical override would add a no-op row to `assistant_overrides`.
 *   - The id is no longer in the backend manifest — the PUT would 404; we
 *     filter here so the apply step doesn't have to.
 *
 * `currentBuiltinAgentTypes` is a `Map<builtin-id, preset_agent_type>` sourced
 * from `GET /api/assistants` at migration time, so we stay aligned with
 * whatever manifest the running backend ships (e.g. current is `aionrs`, but
 * a future manifest could pin a specific built-in back to `claude`).
 */
function collectBuiltinPresetAgentTypeOverrides(
  legacy: Record<string, unknown>[],
  currentBuiltinAgentTypes: Map<string, string>
): BuiltinAgentTypeOverride[] {
  const overrides: BuiltinAgentTypeOverride[] = [];
  for (const row of legacy) {
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id) continue;
    const isBuiltin = id.startsWith(BUILTIN_ID_PREFIX) || PRESET_ID_WHITELIST.has(id);
    if (!isBuiltin) continue;

    const raw = row.presetAgentType;
    if (typeof raw !== 'string' || raw.length === 0 || raw === LEGACY_DEFAULT_PRESET_AGENT_TYPE) {
      // Legacy default / missing — no explicit user choice to preserve.
      continue;
    }

    const backendId = id.startsWith(BUILTIN_ID_PREFIX) ? id.slice(BUILTIN_ID_PREFIX.length) : id;
    const current = currentBuiltinAgentTypes.get(backendId);
    if (current === undefined) {
      // Built-in id was retired from the manifest; nothing to override.
      continue;
    }
    if (current === raw) {
      // User's choice already matches the built-in default.
      continue;
    }

    overrides.push({ id: backendId, preset_agent_type: raw });
  }
  return overrides;
}

/**
 * Replay user-picked `preset_agent_type` choices onto `assistant_overrides`
 * via `PUT /api/assistants/{id}`. The backend accepts only `preset_agent_type`
 * on built-in rows (see `aionui-assistant/src/service.rs`). 404 is treated as
 * skip for the same reason as {@link applyBuiltinOverrides}: the built-in was
 * retired between versions and the user preference is moot.
 */
async function applyBuiltinPresetAgentTypeOverrides(overrides: BuiltinAgentTypeOverride[]): Promise<number> {
  if (overrides.length === 0) return 0;
  const results = await Promise.allSettled(
    overrides.map((ov) => ipcBridge.assistants.update.invoke({ id: ov.id, preset_agent_type: ov.preset_agent_type }))
  );
  let failed = 0;
  let skipped = 0;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const reason = r.reason;
      if (isBackendHttpError(reason) && reason.status === 404) {
        skipped += 1;
        console.warn(
          `[AionUi] Skipped preset_agent_type override for retired built-in '${overrides[i].id}' (no longer in backend manifest)`
        );
        return;
      }
      failed += 1;
      console.error(`[AionUi] Failed to apply preset_agent_type override for ${overrides[i].id}:`, reason);
    }
  });
  const applied = overrides.length - failed - skipped;
  if (failed === 0) {
    console.log(`[AionUi] Applied ${applied} builtin preset_agent_type override(s) (skipped ${skipped} retired id(s))`);
  } else {
    console.error(
      `[AionUi] Builtin preset_agent_type override partial: ${failed}/${overrides.length} failed, ${skipped} skipped, ${applied} applied`
    );
  }
  return failed;
}

/**
 * Snapshot of the current built-in `preset_agent_type` defaults, keyed by
 * built-in id (no `builtin-` prefix). Used by Phase 3 to decide whether a
 * legacy user choice differs from the current default and needs overriding.
 * Empty map on error — callers treat that as "no overrides needed" to avoid
 * writing stale choices when we can't see what the backend thinks is current.
 */
async function fetchCurrentBuiltinAgentTypes(): Promise<Map<string, string>> {
  try {
    const list = await ipcBridge.assistants.list.invoke();
    const map = new Map<string, string>();
    for (const a of list) {
      if (a.source !== 'builtin') continue;
      map.set(a.id, a.preset_agent_type);
    }
    return map;
  } catch (error) {
    console.error('[AionUi] Failed to fetch current builtin preset_agent_type map:', error);
    return new Map();
  }
}

async function finalizeAssistantMigration(configFile: ConfigFile): Promise<boolean> {
  const rawConfigFile = configFile as unknown as LegacyConfigAccessor;
  try {
    if (typeof rawConfigFile.remove === 'function') {
      await rawConfigFile.remove('assistants');
    }
    return true;
  } catch (error) {
    console.error('[AionUi] Failed to finalize assistant migration:', error);
    return false;
  }
}

/**
 * One-shot import of legacy `ConfigStorage.get('assistants')` into the backend
 * after the backend is healthy. Three phases:
 *
 *   1. POST /api/assistants/import for user-authored rows (insert-only, so
 *      retries are idempotent).
 *   2. PATCH /api/assistants/{id}/state for each legacy built-in that the
 *      user had disabled, so the `enabled=false` preference survives the
 *      migration to the backend's `assistant_overrides` table.
 *   3. PUT /api/assistants/{id} for each legacy built-in whose user-picked
 *      `presetAgentType` differs from the current manifest default — so a
 *      user who explicitly chose `claude`/`codex`/etc. keeps that choice
 *      across the 'gemini' → 'aionrs' default migration.
 *
 * Returns `true` only when all phases complete cleanly (or when there is
 * nothing to do). The caller owns the overall Electron-config migration flag;
 * any failure returns `false` so the caller can keep that flag unset and retry
 * on the next launch.
 *
 * Honors `AIONUI_SKIP_ELECTRON_MIGRATION=1` so E2E fixtures can seed via
 * `POST /api/assistants/import` directly.
 */
export async function migrateAssistantsToBackend(configFile: ConfigFile): Promise<boolean> {
  if (process.env.AIONUI_SKIP_ELECTRON_MIGRATION === '1') {
    console.log('[AionUi] Assistant migration skipped (env flag set)');
    return false;
  }

  const rawConfigFile = configFile as unknown as LegacyConfigAccessor;
  const legacyValue = await rawConfigFile.get('assistants').catch(() => [] as unknown);
  const legacy = (Array.isArray(legacyValue) ? legacyValue : []) as Record<string, unknown>[];

  const userAssistants = legacy.filter((a) => !isLegacyBuiltin(a));
  const builtinDisabledOverrides = collectBuiltinOverrides(legacy);
  // Phase 3's payload needs the live backend default for each built-in to
  // decide "did the user actually pick something different?". Fetch once,
  // pass down. An empty map from a failed GET leaves Phase 3 as a no-op
  // (safe default) but does not trip the overall migration flag.
  const currentBuiltinAgentTypes = await fetchCurrentBuiltinAgentTypes();
  const builtinAgentTypeOverrides = collectBuiltinPresetAgentTypeOverrides(legacy, currentBuiltinAgentTypes);

  // Nothing to do at all — flag flips true immediately.
  if (userAssistants.length === 0 && builtinDisabledOverrides.length === 0 && builtinAgentTypeOverrides.length === 0) {
    return finalizeAssistantMigration(configFile);
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
        return false;
      }
      console.log(`[AionUi] migrated ${result.imported} assistants (skipped ${result.skipped})`);
    } catch (error) {
      console.error('[AionUi] Assistant migration failed:', error);
      return false;
    }
  }

  // Phase 2: replay disabled-state overrides for built-ins.
  const disabledOverrideFailures = await applyBuiltinOverrides(builtinDisabledOverrides);
  if (disabledOverrideFailures > 0) {
    // Partial override failure — retry on next launch. setState is an upsert
    // on the backend side, so replaying is safe.
    return false;
  }

  // Phase 3: replay preset_agent_type overrides for built-ins whose user
  // picked a non-default backend (e.g. 'codex' / 'claude'). Skipped built-ins
  // and identical-to-default values were already filtered in collect.
  const agentTypeOverrideFailures = await applyBuiltinPresetAgentTypeOverrides(builtinAgentTypeOverrides);
  if (agentTypeOverrideFailures > 0) {
    return false;
  }

  return finalizeAssistantMigration(configFile);
}
