/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { CreateAssistantRequest } from '@/common/types/agent/assistantTypes';
import { promises as fs } from 'fs';
import path from 'path';
import { getAssistantsDir, type ProcessConfig as ProcessConfigType } from './initStorage';

const BUILTIN_ID_PREFIX = 'builtin-';

/**
 * Legacy filename pattern for custom assistant rule files written by the
 * pre-backend Electron build into `<userData>/config/assistants/`.
 *   - Rules: `<id>.<locale>.md`
 *   - Skills (kept here for completeness, not migrated by this module yet):
 *     `<id>-skills.<locale>.md`
 *
 * We intentionally migrate only rule files: the renderer's "edit assistant"
 * drawer always writes the rule (the prompt) but the skills md was a
 * deprecated freeform extra prompt — there is no UI surface that reads it
 * now that skills are looked up via the skills hub.
 */
const RULE_FILE_RE = /^(.+?)\.([a-zA-Z-]+)\.md$/;

/**
 * The legacy Electron build shipped `'gemini'` as the fallback agent type for
 * every assistant (built-in and user). The current backend ships `'aionrs'` as
 * the built-in default — the internal Gemini engine was removed, and what
 * remains with the name "gemini" is a distinct ACP backend the user must
 * install. Treat the legacy default as "no explicit choice" and promote it to
 * the current default, so users who never touched the agent picker don't find
 * all their assistants pointing at a backend that is no longer there on boot.
 * Users who *explicitly* picked `'codex' / 'claude' / 'qwen' / …` keep their
 * choice (see `collectBuiltinAgentIdOverrides`).
 */
const LEGACY_DEFAULT_PRESET_AGENT_TYPE = 'gemini';
/**
 * Normalise a legacy `presetAgentType` for migration. Absent / non-string /
 * the legacy default → current default. Everything else is preserved verbatim.
 */
function normaliseLegacyAgentId(raw: unknown, agentIdByRuntimeKey: Map<string, string>): string | undefined {
  if (typeof raw !== 'string' || raw.length === 0 || raw === LEGACY_DEFAULT_PRESET_AGENT_TYPE) {
    return undefined;
  }
  return agentIdByRuntimeKey.get(raw);
}

/**
 * Frozen snapshot of legacy built-in assistant ids that shipped without the
 * historical `builtin-` prefix. This migration still needs them so a
 * user-authored assistant whose id accidentally matches one of these slugs is
 * not imported into the user table and later overwritten by the backend's
 * built-in bootstrap. The prefix check handles the common case; this set is
 * only the guard for those older unprefixed ids.
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
export function legacyAssistantToCreateRequest(
  legacy: Record<string, unknown>,
  agentIdByRuntimeKey = new Map<string, string>()
): CreateAssistantRequest {
  const legacyId = typeof legacy.id === 'string' ? legacy.id : '';

  // Rename colliding user-authored ids to preserve data (spec §8.1).
  const id = PRESET_ID_WHITELIST.has(legacyId) ? generateCollisionId() : legacyId;

  const name = typeof legacy.name === 'string' && legacy.name.trim().length > 0 ? legacy.name : 'Untitled';
  const description = typeof legacy.description === 'string' ? legacy.description : undefined;
  const avatar = typeof legacy.avatar === 'string' ? legacy.avatar : undefined;
  const agent_id = normaliseLegacyAgentId(legacy.presetAgentType, agentIdByRuntimeKey);

  return {
    id,
    name,
    description,
    avatar,
    agent_id,
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
type BuiltinAgentIdOverride = { id: string; agent_id: string };

/**
 * Local config file key that records "the legacy → backend assistant migration
 * has already completed once on this machine". Same idempotency rationale as
 * `migration.providersMigrated_v1` (see ELECTRON-1KT): without it, a user-deleted
 * assistant would be silently re-imported on every launch from the still-on-disk
 * legacy `assistants` field (kept on purpose so the user can downgrade).
 */
const ASSISTANTS_MIGRATION_FLAG = 'migration.assistantsMigrated_v1';

type LegacyConfigAccessor = {
  get: (key: string) => Promise<unknown>;
  set?: (key: string, value: unknown) => Promise<unknown>;
};

async function backendSupportsAssistantDefinitions(): Promise<boolean> {
  try {
    const assistants = await ipcBridge.assistants.list.invoke();
    const probeAssistant = assistants[0];
    if (!probeAssistant) return false;

    const detail = await ipcBridge.assistants.get.invoke({ id: probeAssistant.id });
    return Boolean(
      detail && typeof detail === 'object' && 'profile' in detail && 'defaults' in detail && 'preferences' in detail
    );
  } catch (error) {
    console.warn('[AionUi] Failed to probe unified assistant detail support:', error);
    return false;
  }
}

async function markAssistantsMigrationDone(configFile: ConfigFile): Promise<void> {
  const accessor = configFile as unknown as LegacyConfigAccessor;
  if (typeof accessor.set !== 'function') {
    // Older fakes (test doubles) may expose only `get`; persist failure is
    // logged but does not break the migration result — content-aware phases
    // still make a re-run safe.
    return;
  }
  try {
    await accessor.set(ASSISTANTS_MIGRATION_FLAG, true);
  } catch (err) {
    console.warn('[AionUi] failed to persist assistants migration flag', err);
  }
}

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
 * `currentBuiltinAgentIds` is a `Map<builtin-id, agent_id>` sourced
 * from `GET /api/assistants` at migration time, so we stay aligned with
 * whatever manifest the running backend ships (e.g. current is `aionrs`, but
 * a future manifest could pin a specific built-in back to `claude`).
 */
function collectBuiltinAgentIdOverrides(
  legacy: Record<string, unknown>[],
  currentBuiltinAgentIds: Map<string, string>,
  agentIdByRuntimeKey: Map<string, string>
): BuiltinAgentIdOverride[] {
  const overrides: BuiltinAgentIdOverride[] = [];
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
    const requestedAgentId = agentIdByRuntimeKey.get(raw);
    if (!requestedAgentId) {
      continue;
    }
    const current = currentBuiltinAgentIds.get(backendId);
    if (current === undefined) {
      // Built-in id was retired from the manifest; nothing to override.
      continue;
    }
    if (current === requestedAgentId) {
      // User's choice already matches the built-in default.
      continue;
    }

    overrides.push({ id: backendId, agent_id: requestedAgentId });
  }
  return overrides;
}

/**
 * Replay user-picked legacy backend choices onto `assistant_overrides`
 * via `PUT /api/assistants/{id}`. The backend accepts only `agent_id`
 * on built-in rows (see `aionui-assistant/src/service.rs`). 404 is treated as
 * skip for the same reason as {@link applyBuiltinOverrides}: the built-in was
 * retired between versions and the user preference is moot.
 */
async function applyBuiltinAgentIdOverrides(overrides: BuiltinAgentIdOverride[]): Promise<number> {
  if (overrides.length === 0) return 0;
  const results = await Promise.allSettled(
    overrides.map((ov) => ipcBridge.assistants.update.invoke({ id: ov.id, agent_id: ov.agent_id }))
  );
  let failed = 0;
  let skipped = 0;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const reason = r.reason;
      if (isBackendHttpError(reason) && reason.status === 404) {
        skipped += 1;
        console.warn(
          `[AionUi] Skipped agent_id override for retired built-in '${overrides[i].id}' (no longer in backend manifest)`
        );
        return;
      }
      failed += 1;
      console.error(`[AionUi] Failed to apply agent_id override for ${overrides[i].id}:`, reason);
    }
  });
  const applied = overrides.length - failed - skipped;
  if (failed === 0) {
    console.log(`[AionUi] Applied ${applied} builtin agent_id override(s) (skipped ${skipped} retired id(s))`);
  } else {
    console.error(
      `[AionUi] Builtin agent_id override partial: ${failed}/${overrides.length} failed, ${skipped} skipped, ${applied} applied`
    );
  }
  return failed;
}

/**
 * Snapshot of the current built-in `agent_id` defaults, keyed by
 * built-in id (no `builtin-` prefix). Used by Phase 3 to decide whether a
 * legacy user choice differs from the current default and needs overriding.
 * Empty map on error — callers treat that as "no overrides needed" to avoid
 * writing stale choices when we can't see what the backend thinks is current.
 */
async function fetchCurrentBuiltinAgentIds(): Promise<Map<string, string>> {
  try {
    const list = await ipcBridge.assistants.list.invoke();
    const map = new Map<string, string>();
    for (const a of list) {
      if (a.source !== 'builtin') continue;
      map.set(a.id, a.agent_id);
    }
    return map;
  } catch (error) {
    console.error('[AionUi] Failed to fetch current builtin agent_id map:', error);
    return new Map();
  }
}

async function fetchAgentIdByRuntimeKey(): Promise<Map<string, string>> {
  try {
    const agents = await ipcBridge.acpConversation.getManagedAgents.invoke();
    const map = new Map<string, string>();
    for (const agent of Array.isArray(agents) ? agents : []) {
      const record = agent as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id : '';
      if (!id) continue;
      const backend = typeof record.backend === 'string' ? record.backend : undefined;
      const agentType = typeof record.agent_type === 'string' ? record.agent_type : undefined;
      if (backend) {
        map.set(backend, id);
      }
      if (agentType) {
        map.set(agentType, id);
      }
    }
    return map;
  } catch (error) {
    console.error('[AionUi] Failed to fetch agent runtime identity map:', error);
    return new Map();
  }
}

/**
 * Phase 4: upload custom-assistant rule .md files from the legacy on-disk
 * directory to the backend. The pre-backend build wrote these as
 * `<userData>/config/assistants/<id>.<locale>.md`. The new home is
 * `<dataDir>/assistant-rules/<id>.<locale>.md`, owned by the backend, and
 * only the backend's `POST /api/skills/assistant-rule/write` is allowed to
 * touch it.
 *
 * Idempotency follows the sibling-migration pattern (see
 * `configMigration.ts`): every launch re-runs cheaply, but for each rule
 * file we first probe the backend via `readAssistantRule`. If the backend
 * already has non-empty content, we skip the write so the user's
 * post-migration edits are never clobbered. Empty / missing on the backend
 * → upload.
 *
 * Skipped ids:
 *   - Built-in ids (`builtin-*` or whitelisted slug). The backend rejects
 *     writes against built-in ids on purpose, and built-in rule files
 *     ship inside the backend's resource bundle anyway.
 *   - Skill files (`<id>-skills.<locale>.md`) — those are a deprecated
 *     extra prompt with no UI surface left.
 *   - Files whose id is not present in the legacy `assistants` array —
 *     protects against stale .md files referring to assistants the user
 *     has since deleted.
 *
 * Returns the number of failures; 0 means the phase succeeded (no files
 * present is also success). Any failure logs a warning but does not abort
 * the rest of the migration — the next launch retries.
 */
async function uploadLegacyAssistantRules(legacyAssistantIds: Set<string>): Promise<number> {
  const dir = getAssistantsDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      // No legacy assistants dir at all — nothing to upload.
      return 0;
    }
    console.error('[AionUi] Failed to read legacy assistant rules dir:', error);
    return 1;
  }

  const ruleEntries: Array<{ file: string; id: string; locale: string }> = [];
  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    if (file.includes('-skills.')) continue;
    const match = RULE_FILE_RE.exec(file);
    if (!match) continue;
    const id = match[1];
    const locale = match[2];
    if (id.startsWith(BUILTIN_ID_PREFIX) || PRESET_ID_WHITELIST.has(id)) continue;
    if (!legacyAssistantIds.has(id)) continue;
    ruleEntries.push({ file, id, locale });
  }

  if (ruleEntries.length === 0) return 0;

  type Outcome = 'uploaded' | 'skipped';
  const results = await Promise.allSettled(
    ruleEntries.map(async ({ file, id, locale }): Promise<Outcome> => {
      const content = await fs.readFile(path.join(dir, file), 'utf-8');
      if (!content.trim()) return 'skipped';
      // Read-before-write: skip if the backend already has non-empty
      // content for this (id, locale) so the user's post-migration
      // edits are never clobbered. Treat read failures as "no content"
      // so a freshly-imported assistant still receives its legacy rule.
      const existing = await ipcBridge.fs.readAssistantRule.invoke({ assistant_id: id, locale }).catch(() => '');
      if (existing.trim().length > 0) return 'skipped';
      await ipcBridge.fs.writeAssistantRule.invoke({ assistant_id: id, locale, content });
      return 'uploaded';
    })
  );

  let failed = 0;
  let uploaded = 0;
  let skipped = 0;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      failed += 1;
      console.error(
        `[AionUi] Failed to upload legacy rule for '${ruleEntries[i].id}' (${ruleEntries[i].locale}):`,
        r.reason
      );
      return;
    }
    if (r.value === 'uploaded') uploaded += 1;
    else skipped += 1;
  });
  if (failed === 0) {
    if (uploaded > 0 || skipped > 0) {
      console.log(`[AionUi] Legacy rule upload: ${uploaded} uploaded, ${skipped} skipped`);
    }
  } else {
    console.error(`[AionUi] Legacy rule upload partial: ${failed}/${ruleEntries.length} failed`);
  }
  return failed;
}

/**
 * Import legacy `ConfigStorage.get('assistants')` into the backend after the
 * backend is healthy. Four phases:
 *
 *   1. POST /api/assistants/import for user-authored rows (insert-only, so
 *      already-migrated rows are skipped without clobber).
 *   2. PATCH /api/assistants/{id}/state for each legacy built-in that the
 *      user had disabled, so the `enabled=false` preference survives the
 *      migration to the backend's `assistant_overrides` table.
 *   3. PUT /api/assistants/{id} for each legacy built-in whose user-picked
 *      `presetAgentType` differs from the current manifest default — so a
 *      user who explicitly chose `claude`/`codex`/etc. keeps that choice
 *      across the 'gemini' → 'aionrs' default migration.
 *   4. POST /api/skills/assistant-rule/write for each `<userData>/config/
 *      assistants/<id>.<locale>.md` belonging to a custom assistant — but
 *      only when the backend rule for that (id, locale) is currently empty,
 *      so post-migration edits are never overwritten.
 *
 * No completion flag: every launch re-runs the four phases cheaply and
 * each phase is content-aware (insert-only / collect-then-filter against
 * backend state / read-before-write). The legacy `assistants` field is
 * never touched, so downgrading to an older Electron build still works.
 * This matches the sibling-migration pattern in `configMigration.ts`
 * (`migrateConfigStorage`, `migrateProviders`).
 *
 * Returns `true` when all phases complete cleanly. A failure returns
 * `false` so the caller can log the partial state, but next launch
 * naturally retries the remaining work.
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

  // Idempotency guard (ELECTRON-1KT): once the flag is set, never replay
  // legacy assistants. Phase 1 is "insert-only", which means a user-deleted
  // row would be re-imported on every launch — we suppress that here.
  let alreadyMigrated = false;
  try {
    alreadyMigrated = Boolean(await rawConfigFile.get(ASSISTANTS_MIGRATION_FLAG));
  } catch {
    // Treat read errors as "not migrated yet"; we'll set on success.
  }
  if (alreadyMigrated) {
    return true;
  }

  const legacyValue = await rawConfigFile.get('assistants').catch(() => [] as unknown);
  const legacy = (Array.isArray(legacyValue) ? legacyValue : []) as Record<string, unknown>[];
  const supportsAssistantDefinitions = await backendSupportsAssistantDefinitions();
  const agentIdByRuntimeKey = await fetchAgentIdByRuntimeKey();

  const userAssistants = legacy.filter((a) => !isLegacyBuiltin(a));
  const builtinDisabledOverrides = supportsAssistantDefinitions ? [] : collectBuiltinOverrides(legacy);
  // Once the backend exposes unified assistant detail, built-in state and
  // agent overrides already flow through the backend bootstrap / legacy mirror.
  // Replaying stale Electron config on top would clobber newer backend state.
  const currentBuiltinAgentIds = supportsAssistantDefinitions
    ? new Map<string, string>()
    : await fetchCurrentBuiltinAgentIds();
  const builtinAgentIdOverrides = supportsAssistantDefinitions
    ? []
    : collectBuiltinAgentIdOverrides(legacy, currentBuiltinAgentIds, agentIdByRuntimeKey);

  // Phase 4 keys off the *legacy* custom-assistant id (the file name on
  // disk). The collision-rename path in `legacyAssistantToCreateRequest`
  // produces a fresh id for rows whose legacy id clashed with a built-in
  // slug, but those collisions are extremely rare in practice and are
  // not handled here: the rule would be uploaded under the legacy id and
  // would not match the new row. Acceptable trade-off for now.
  const customAssistantIds = new Set<string>(
    legacy
      .filter((a) => !isLegacyBuiltin(a))
      .map((a) => (typeof a.id === 'string' ? a.id : ''))
      .filter((id) => id.length > 0)
  );

  if (
    userAssistants.length === 0 &&
    builtinDisabledOverrides.length === 0 &&
    builtinAgentIdOverrides.length === 0 &&
    customAssistantIds.size === 0
  ) {
    // Nothing to do — no-op success. Flag it so future launches don't even
    // bother reading the legacy field.
    await markAssistantsMigrationDone(configFile);
    return true;
  }

  // Phase 1: import user-authored assistants (if any).
  if (userAssistants.length > 0) {
    try {
      const result = await ipcBridge.assistants.import.invoke({
        assistants: userAssistants.map((assistant) => legacyAssistantToCreateRequest(assistant, agentIdByRuntimeKey)),
      });
      if (result.failed !== 0) {
        console.error(`[AionUi] Assistant migration partial: ${result.failed} failed`, result.errors);
        return false;
      }
      if (result.imported > 0 || result.skipped > 0) {
        console.log(`[AionUi] migrated ${result.imported} assistants (skipped ${result.skipped})`);
      }
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

  // Phase 3: replay agent_id overrides for built-ins whose user picked a
  // non-default legacy backend (e.g. 'codex' / 'claude'). Skipped built-ins
  // and identical-to-default values were already filtered in collect.
  const agentIdOverrideFailures = await applyBuiltinAgentIdOverrides(builtinAgentIdOverrides);
  if (agentIdOverrideFailures > 0) {
    return false;
  }

  // Phase 4: upload legacy custom-assistant rule files.
  const ruleUploadFailures = await uploadLegacyAssistantRules(customAssistantIds);
  if (ruleUploadFailures > 0) {
    return false;
  }

  // All four phases succeeded — set the completion flag so subsequent launches
  // short-circuit and we don't re-import assistants the user deletes later.
  await markAssistantsMigrationDone(configFile);
  return true;
}
