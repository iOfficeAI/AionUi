/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';
import type { AcpModelInfo } from '@/common/types/acpTypes';
import type { TProviderWithModel } from '@/common/config/storage';
import { buildClaudeRuntimeProviderEnv, type ProviderSyncProfile } from '@process/agent/modelSync/providerSyncProfile';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type CcSwitchPaths = {
  settingsPath: string;
  databasePath: string;
  claudeSettingsPath: string;
};

type CcSwitchSettings = {
  currentProviderClaude?: string;
};

type ClaudeProviderSettingsConfig = {
  model?: string;
  env?: Record<string, unknown>;
};

type ClaudeSettings = {
  model?: string;
  env?: Record<string, unknown>;
  hooks?: unknown;
  statusLine?: unknown;
  [key: string]: unknown;
};

type CcSwitchProviderRow = {
  settings_config?: string | null;
};

type CcSwitchModelPricingRow = {
  model_id?: string;
  display_name?: string | null;
};

export type ClaudeProviderEnv = Record<string, string>;

const CLAUDE_MODEL_SLOT_IDS = ['default', 'opus', 'haiku'] as const;

type ClaudeModelSlotId = (typeof CLAUDE_MODEL_SLOT_IDS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseJsonObject<T extends Record<string, unknown>>(content: string): T | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function uniqueModelIds(modelIds: Array<string | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const modelId of modelIds) {
    if (!modelId || seen.has(modelId)) continue;
    seen.add(modelId);
    result.push(modelId);
  }

  return result;
}

export function getCcSwitchPaths(homeDir = os.homedir()): CcSwitchPaths {
  const baseDir = path.join(homeDir, '.cc-switch');
  return {
    settingsPath: path.join(baseDir, 'settings.json'),
    databasePath: path.join(baseDir, 'cc-switch.db'),
    claudeSettingsPath: path.join(homeDir, '.claude', 'settings.json'),
  };
}

function normalizeClaudeModelSlot(value: unknown): ClaudeModelSlotId | null {
  if (!isNonEmptyString(value)) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'sonnet') return 'default';
  return (CLAUDE_MODEL_SLOT_IDS as readonly string[]).includes(normalized) ? (normalized as ClaudeModelSlotId) : null;
}

function readClaudeSelectedModelSlot(claudeSettingsPath: string): ClaudeModelSlotId | null {
  if (!fs.existsSync(claudeSettingsPath)) return null;
  const settings = parseJsonObject<ClaudeSettings>(fs.readFileSync(claudeSettingsPath, 'utf-8'));
  return normalizeClaudeModelSlot(settings?.model);
}

function readNativeClaudeSettings(claudeSettingsPath: string): ClaudeSettings | null {
  if (!fs.existsSync(claudeSettingsPath)) return null;
  return parseJsonObject<ClaudeSettings>(fs.readFileSync(claudeSettingsPath, 'utf-8'));
}

function buildClaudeModelLabelsFromEnv(env: ClaudeProviderEnv): Map<string, string> {
  const labels = new Map<string, string>();
  for (const key of [
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_MODEL',
  ]) {
    const modelId = env[key];
    if (!isNonEmptyString(modelId) || labels.has(modelId)) continue;
    labels.set(modelId, modelId);
  }
  return labels;
}

function buildClaudeSettingsConfigFromNativeSettings(settings: ClaudeSettings | null): ClaudeProviderSettingsConfig | null {
  if (!settings) return null;
  return {
    model: normalizeClaudeModelSlot(settings.model) ?? 'default',
    env: isRecord(settings.env) ? settings.env : {},
  };
}

export function buildClaudeModelInfoFromCcSwitchConfig(
  settingsConfig: ClaudeProviderSettingsConfig | null | undefined,
  modelLabels: ReadonlyMap<string, string> = new Map(),
  activeSlot?: string | null,
  sourceDetail: 'cc-switch' | 'claude-settings' = 'cc-switch'
): AcpModelInfo | null {
  if (!settingsConfig) return null;

  const env = isRecord(settingsConfig.env) ? settingsConfig.env : {};
  const defaultModelId =
    (isNonEmptyString(env.ANTHROPIC_DEFAULT_SONNET_MODEL) ? env.ANTHROPIC_DEFAULT_SONNET_MODEL : null) ||
    (isNonEmptyString(env.ANTHROPIC_MODEL) ? env.ANTHROPIC_MODEL : null);
  const opusModelId = isNonEmptyString(env.ANTHROPIC_DEFAULT_OPUS_MODEL) ? env.ANTHROPIC_DEFAULT_OPUS_MODEL : null;
  const haikuModelId = isNonEmptyString(env.ANTHROPIC_DEFAULT_HAIKU_MODEL) ? env.ANTHROPIC_DEFAULT_HAIKU_MODEL : null;

  const availableModels = uniqueModelIds([defaultModelId, opusModelId, haikuModelId]).flatMap((modelId) => {
    const slotId =
      modelId === defaultModelId
        ? 'default'
        : modelId === opusModelId
          ? 'opus'
          : modelId === haikuModelId
            ? 'haiku'
            : null;
    if (!slotId) return [];
    return [
      {
        id: slotId,
        label: modelLabels.get(modelId) || modelId,
      },
    ];
  });

  if (availableModels.length === 0) return null;

  const preferredSlot = normalizeClaudeModelSlot(activeSlot) ?? normalizeClaudeModelSlot(settingsConfig.model);
  const currentModelId = availableModels.find((model) => model.id === preferredSlot)?.id || availableModels[0].id;
  const currentModelLabel = availableModels.find((model) => model.id === currentModelId)?.label || currentModelId;
  return {
    currentModelId,
    currentModelLabel,
    availableModels,
    canSwitch: availableModels.length > 1,
    source: 'models',
    sourceDetail,
  };
}

function readCcSwitchSettings(settingsPath: string): CcSwitchSettings | null {
  if (!fs.existsSync(settingsPath)) return null;
  return parseJsonObject<CcSwitchSettings>(fs.readFileSync(settingsPath, 'utf-8'));
}

function normalizeProviderEnv(env: unknown): ClaudeProviderEnv {
  if (!isRecord(env)) return {};

  return Object.fromEntries(
    Object.entries(env).flatMap(([key, value]) => (isNonEmptyString(value) ? [[key, value]] : []))
  );
}

function readModelLabels(db: Database.Database): Map<string, string> {
  const rows = db.prepare('SELECT model_id, display_name FROM model_pricing').all() as CcSwitchModelPricingRow[];
  const labels = new Map<string, string>();

  for (const row of rows) {
    if (!isNonEmptyString(row.model_id)) continue;
    labels.set(row.model_id, isNonEmptyString(row.display_name) ? row.display_name : row.model_id);
  }

  return labels;
}

function readClaudeModelInfoFromNativeSettings(claudeSettingsPath: string): AcpModelInfo | null {
  const settings = readNativeClaudeSettings(claudeSettingsPath);
  const settingsConfig = buildClaudeSettingsConfigFromNativeSettings(settings);
  return buildClaudeModelInfoFromCcSwitchConfig(
    settingsConfig,
    buildClaudeModelLabelsFromEnv(normalizeProviderEnv(settings?.env)),
    readClaudeSelectedModelSlot(claudeSettingsPath),
    'claude-settings'
  );
}

export function readClaudeModelInfoFromCcSwitch(paths?: Partial<CcSwitchPaths>): AcpModelInfo | null {
  const resolvedPaths = {
    ...getCcSwitchPaths(),
    ...paths,
  };
  const settings = readCcSwitchSettings(resolvedPaths.settingsPath);
  const currentProviderId = settings?.currentProviderClaude;

  if (!isNonEmptyString(currentProviderId) || !fs.existsSync(resolvedPaths.databasePath)) {
    return readClaudeModelInfoFromNativeSettings(resolvedPaths.claudeSettingsPath);
  }

  let db: Database.Database | null = null;
  try {
    db = new BetterSqlite3(resolvedPaths.databasePath, { readonly: true, fileMustExist: true });
    const provider = db.prepare('SELECT settings_config FROM providers WHERE id = ? LIMIT 1').get(currentProviderId) as
      | CcSwitchProviderRow
      | undefined;

    if (!isNonEmptyString(provider?.settings_config)) {
      return readClaudeModelInfoFromNativeSettings(resolvedPaths.claudeSettingsPath);
    }

    const settingsConfig = parseJsonObject<ClaudeProviderSettingsConfig>(provider.settings_config);
    return (
      buildClaudeModelInfoFromCcSwitchConfig(
        settingsConfig,
        readModelLabels(db),
        readClaudeSelectedModelSlot(resolvedPaths.claudeSettingsPath),
        'cc-switch'
      ) ?? readClaudeModelInfoFromNativeSettings(resolvedPaths.claudeSettingsPath)
    );
  } catch {
    return readClaudeModelInfoFromNativeSettings(resolvedPaths.claudeSettingsPath);
  } finally {
    db?.close();
  }
}

function readClaudeProviderEnvFromNativeSettings(claudeSettingsPath: string): ClaudeProviderEnv {
  return normalizeProviderEnv(readNativeClaudeSettings(claudeSettingsPath)?.env);
}

export function readClaudeProviderEnvFromCcSwitch(paths?: Partial<CcSwitchPaths>): ClaudeProviderEnv {
  const resolvedPaths = {
    ...getCcSwitchPaths(),
    ...paths,
  };
  const settings = readCcSwitchSettings(resolvedPaths.settingsPath);
  const currentProviderId = settings?.currentProviderClaude;

  if (!isNonEmptyString(currentProviderId) || !fs.existsSync(resolvedPaths.databasePath)) {
    return readClaudeProviderEnvFromNativeSettings(resolvedPaths.claudeSettingsPath);
  }

  let db: Database.Database | null = null;
  try {
    db = new BetterSqlite3(resolvedPaths.databasePath, { readonly: true, fileMustExist: true });
    const provider = db.prepare('SELECT settings_config FROM providers WHERE id = ? LIMIT 1').get(currentProviderId) as
      | CcSwitchProviderRow
      | undefined;

    if (!isNonEmptyString(provider?.settings_config)) {
      return readClaudeProviderEnvFromNativeSettings(resolvedPaths.claudeSettingsPath);
    }

    const settingsConfig = parseJsonObject<ClaudeProviderSettingsConfig>(provider.settings_config);
    const env = normalizeProviderEnv(settingsConfig?.env);
    return Object.keys(env).length > 0 ? env : readClaudeProviderEnvFromNativeSettings(resolvedPaths.claudeSettingsPath);
  } catch {
    return readClaudeProviderEnvFromNativeSettings(resolvedPaths.claudeSettingsPath);
  } finally {
    db?.close();
  }
}

export function writeClaudeSettingsForProviderSync(
  provider: TProviderWithModel,
  profile: ProviderSyncProfile,
  paths?: Partial<CcSwitchPaths>
): void {
  const resolvedPaths = {
    ...getCcSwitchPaths(),
    ...paths,
  };
  const settingsPath = resolvedPaths.claudeSettingsPath;
  const currentSettings = readNativeClaudeSettings(settingsPath) ?? {};
  const currentEnv = normalizeProviderEnv(currentSettings.env);
  const nextEnv: ClaudeProviderEnv = {
    ...currentEnv,
    ...buildClaudeRuntimeProviderEnv({
      ...profile,
      provider,
    }),
  };

  const nextSettings: ClaudeSettings = {
    ...currentSettings,
    model: 'default',
    env: nextEnv,
  };

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  try {
    fs.chmodSync(settingsPath, 0o600);
  } catch {
    // Ignore chmod failures on unsupported filesystems.
  }
}
