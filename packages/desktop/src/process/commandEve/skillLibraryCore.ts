/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { resolveCommandEveRuntimeBootstrapPaths } from './runtimeBootstrapCore';

export const COMMAND_EVE_SKILL_LIBRARY_BRIDGE_VERSION = 'command-eve-skill-library/v0';

export type CommandEveSkillLibraryStatus = 'ready' | 'blocked' | 'failed';

export type CommandEveSkillLibraryState = 'executable' | 'prompt_label' | 'gated' | 'disabled';

export type CommandEveSkillLibraryCard = {
  id: string;
  name: string;
  source: string;
  state: CommandEveSkillLibraryState;
  executable: boolean;
};

export type CommandEveSkillLibraryModel = {
  schema_version: 'command-eve-skill-library/v0';
  generated_at: string;
  read_only: true;
  source: {
    runtime_reconciliation_path: string;
    capability_pack_path?: string;
    managed_skill_dir?: string;
  };
  summary: Record<CommandEveSkillLibraryState, number>;
  skills: CommandEveSkillLibraryCard[];
  connector_ids: string[];
  blocked_external_mcp_transports: string[];
  kanban: {
    dispatch_in_gateway: false;
    auto_decompose: false;
  };
  warnings: string[];
};

export type CommandEveSkillLibraryBridgeResult = {
  version: typeof COMMAND_EVE_SKILL_LIBRARY_BRIDGE_VERSION;
  status: CommandEveSkillLibraryStatus;
  ok: boolean;
  reason_code?: string;
  message?: string;
  model?: CommandEveSkillLibraryModel;
  source: {
    runtime_reconciliation_path?: string;
    capability_pack_path?: string;
    generated_by: 'command-eve-skill-library-core';
  };
};

export type CommandEveSkillLibraryOptions = {
  userDataPath?: string;
  runtimeReconciliationPath?: string;
  capabilityPackPath?: string;
  env?: NodeJS.ProcessEnv;
};

type JsonRecord = Record<string, unknown>;

type CapabilitySkill = {
  id: string;
  name: string;
  source: string;
};

const COMMAND_EVE_RUNTIME_RECONCILIATION_FILE = 'command-eve-runtime-reconciliation.json';
const COMMAND_EVE_CAPABILITIES_FILE = 'command-eve-capabilities.json';
const SKILL_STATES: CommandEveSkillLibraryState[] = ['executable', 'prompt_label', 'gated', 'disabled'];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return undefined;
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

function emptySummary(): Record<CommandEveSkillLibraryState, number> {
  return {
    executable: 0,
    prompt_label: 0,
    gated: 0,
    disabled: 0,
  };
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(?:Bearer|Token|API[_ -]?Key|secret|password)\s+[:=]?\s*[A-Za-z0-9._~+/=-]{8,}\b/gi, '[redacted]')
    .replace(/\b(?:sk|pk|ghp|gho|glpat|xox[baprs]|hf|or)-[A-Za-z0-9._-]{10,}\b/g, '[redacted]');
}

export function resolveSkillLibrarySource(options: CommandEveSkillLibraryOptions = {}): {
  runtime_reconciliation_path?: string;
  capability_pack_path?: string;
} {
  const env = options.env ?? process.env;
  const runtimeFromUserData = options.userDataPath
    ? resolveCommandEveRuntimeBootstrapPaths(options.userDataPath).runtimeReconciliation
    : undefined;
  const runtimeReconciliationPath = firstNonEmpty(
    options.runtimeReconciliationPath,
    env.COMMAND_EVE_RUNTIME_RECONCILIATION_PATH,
    runtimeFromUserData
  );
  const capabilityPackPath = firstNonEmpty(
    options.capabilityPackPath,
    env.COMMAND_EVE_CAPABILITY_PACK_PATH,
    runtimeReconciliationPath
      ? path.join(path.dirname(runtimeReconciliationPath), COMMAND_EVE_CAPABILITIES_FILE)
      : undefined
  );
  return {
    runtime_reconciliation_path: runtimeReconciliationPath,
    capability_pack_path: capabilityPackPath,
  };
}

function normalizeCapabilitySkills(raw: unknown): Map<string, CapabilitySkill> {
  if (!isRecord(raw) || !Array.isArray(raw.skills)) return new Map();
  const skills = new Map<string, CapabilitySkill>();
  for (const entry of raw.skills) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.id).trim();
    if (!id) continue;
    skills.set(id, {
      id,
      name: asString(entry.name).trim() || id,
      source: asString(entry.source).trim(),
    });
  }
  return skills;
}

function makeSkillCard(
  id: string,
  state: CommandEveSkillLibraryState,
  capabilitySkills: Map<string, CapabilitySkill>
): CommandEveSkillLibraryCard {
  const capability = capabilitySkills.get(id);
  return {
    id,
    name: capability?.name || id,
    source: capability?.source || '',
    state,
    executable: state === 'executable',
  };
}

function appendUniqueSkillCards(
  cards: CommandEveSkillLibraryCard[],
  ids: string[],
  state: CommandEveSkillLibraryState,
  capabilitySkills: Map<string, CapabilitySkill>,
  seen: Set<string>
): void {
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    cards.push(makeSkillCard(id, state, capabilitySkills));
  }
}

function blockedResult(
  reasonCode: string,
  message: string,
  source: CommandEveSkillLibraryBridgeResult['source']
): CommandEveSkillLibraryBridgeResult {
  return {
    version: COMMAND_EVE_SKILL_LIBRARY_BRIDGE_VERSION,
    ok: false,
    status: 'blocked',
    reason_code: reasonCode,
    message,
    source,
  };
}

export function buildSkillLibrary(options: CommandEveSkillLibraryOptions = {}): CommandEveSkillLibraryBridgeResult {
  const source = resolveSkillLibrarySource(options);
  if (!source.runtime_reconciliation_path) {
    return blockedResult(
      'RUNTIME_RECONCILIATION_SOURCE_MISSING',
      'Command EVE runtime reconciliation path is missing.',
      {
        generated_by: 'command-eve-skill-library-core',
      }
    );
  }
  if (!fs.existsSync(source.runtime_reconciliation_path)) {
    return blockedResult('RUNTIME_RECONCILIATION_MISSING', 'Command EVE runtime reconciliation file is missing.', {
      runtime_reconciliation_path: source.runtime_reconciliation_path,
      capability_pack_path: source.capability_pack_path,
      generated_by: 'command-eve-skill-library-core',
    });
  }

  try {
    const reconciliation = readJsonFile(source.runtime_reconciliation_path);
    if (!isRecord(reconciliation) || reconciliation.version !== 'command-eve-runtime-reconciliation/v0') {
      return {
        version: COMMAND_EVE_SKILL_LIBRARY_BRIDGE_VERSION,
        ok: false,
        status: 'failed',
        reason_code: 'RUNTIME_RECONCILIATION_SCHEMA_MISMATCH',
        message: 'Command EVE runtime reconciliation schema is unsupported.',
        source: {
          runtime_reconciliation_path: source.runtime_reconciliation_path,
          capability_pack_path: source.capability_pack_path,
          generated_by: 'command-eve-skill-library-core',
        },
      };
    }

    const capabilitySkills =
      source.capability_pack_path && fs.existsSync(source.capability_pack_path)
        ? normalizeCapabilitySkills(readJsonFile(source.capability_pack_path))
        : new Map<string, CapabilitySkill>();
    const hermesConfig = isRecord(reconciliation.hermes_config) ? reconciliation.hermes_config : {};
    const cards: CommandEveSkillLibraryCard[] = [];
    const seen = new Set<string>();

    appendUniqueSkillCards(
      cards,
      asStringArray(reconciliation.executable_skill_ids),
      'executable',
      capabilitySkills,
      seen
    );
    appendUniqueSkillCards(
      cards,
      asStringArray(reconciliation.prompt_label_skill_ids),
      'prompt_label',
      capabilitySkills,
      seen
    );
    appendUniqueSkillCards(cards, asStringArray(reconciliation.gated_skill_ids), 'gated', capabilitySkills, seen);
    appendUniqueSkillCards(cards, asStringArray(hermesConfig.disabled_skills), 'disabled', capabilitySkills, seen);

    const summary = emptySummary();
    for (const card of cards) {
      summary[card.state] += 1;
    }

    return {
      version: COMMAND_EVE_SKILL_LIBRARY_BRIDGE_VERSION,
      ok: true,
      status: 'ready',
      model: {
        schema_version: 'command-eve-skill-library/v0',
        generated_at: new Date().toISOString(),
        read_only: true,
        source: {
          runtime_reconciliation_path: source.runtime_reconciliation_path,
          capability_pack_path: source.capability_pack_path,
          managed_skill_dir: asString(reconciliation.managed_skill_dir) || undefined,
        },
        summary,
        skills: cards,
        connector_ids: asStringArray(reconciliation.connector_ids),
        blocked_external_mcp_transports: asStringArray(reconciliation.blocked_external_mcp_transports),
        kanban: {
          dispatch_in_gateway: false,
          auto_decompose: false,
        },
        warnings: asStringArray(reconciliation.warnings).map(redactSensitiveText),
      },
      source: {
        runtime_reconciliation_path: source.runtime_reconciliation_path,
        capability_pack_path: source.capability_pack_path,
        generated_by: 'command-eve-skill-library-core',
      },
    };
  } catch (error) {
    return {
      version: COMMAND_EVE_SKILL_LIBRARY_BRIDGE_VERSION,
      ok: false,
      status: 'failed',
      reason_code: 'SKILL_LIBRARY_BUILD_FAILED',
      message: error instanceof Error ? error.message : 'Command EVE skill library could not be built.',
      source: {
        runtime_reconciliation_path: source.runtime_reconciliation_path,
        capability_pack_path: source.capability_pack_path,
        generated_by: 'command-eve-skill-library-core',
      },
    };
  }
}
