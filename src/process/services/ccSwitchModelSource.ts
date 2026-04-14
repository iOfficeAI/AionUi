/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';
import type { AcpModelInfo } from '@/common/types/acpTypes';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type CcSwitchPaths = {
  settingsPath: string;
  databasePath: string;
};

type CcSwitchSettings = {
  currentProviderClaude?: string;
};

type ClaudeProviderSettingsConfig = {
  model?: string;
  env?: Record<string, unknown>;
};

type CcSwitchProviderRow = {
  settings_config?: string | null;
};

type CcSwitchModelPricingRow = {
  model_id?: string;
  display_name?: string | null;
};

const CLAUDE_MODEL_ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const;

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
  };
}

export function buildClaudeModelInfoFromCcSwitchConfig(
  settingsConfig: ClaudeProviderSettingsConfig | null | undefined,
  modelLabels: ReadonlyMap<string, string> = new Map()
): AcpModelInfo | null {
  if (!settingsConfig) return null;

  const env = isRecord(settingsConfig.env) ? settingsConfig.env : {};
  const configuredModel = isNonEmptyString(env.ANTHROPIC_MODEL) ? env.ANTHROPIC_MODEL : null;
  const fallbackModel = isNonEmptyString(settingsConfig.model) ? settingsConfig.model : null;

  const orderedModelIds = uniqueModelIds([
    configuredModel,
    fallbackModel,
    ...CLAUDE_MODEL_ENV_KEYS.map((key) => (isNonEmptyString(env[key]) ? env[key] : null)),
  ]);

  if (orderedModelIds.length === 0) return null;

  const currentModelId = orderedModelIds[0];
  return {
    currentModelId,
    currentModelLabel: modelLabels.get(currentModelId) || currentModelId,
    availableModels: orderedModelIds.map((modelId) => ({
      id: modelId,
      label: modelLabels.get(modelId) || modelId,
    })),
    canSwitch: false,
    source: 'models',
    sourceDetail: 'cc-switch',
  };
}

function readCcSwitchSettings(settingsPath: string): CcSwitchSettings | null {
  if (!fs.existsSync(settingsPath)) return null;
  return parseJsonObject<CcSwitchSettings>(fs.readFileSync(settingsPath, 'utf-8'));
}

function readModelLabels(db: Database.Database): Map<string, string> {
  const rows = db
    .prepare('SELECT model_id, display_name FROM model_pricing')
    .all() as CcSwitchModelPricingRow[];
  const labels = new Map<string, string>();

  for (const row of rows) {
    if (!isNonEmptyString(row.model_id)) continue;
    labels.set(row.model_id, isNonEmptyString(row.display_name) ? row.display_name : row.model_id);
  }

  return labels;
}

export function readClaudeModelInfoFromCcSwitch(paths?: Partial<CcSwitchPaths>): AcpModelInfo | null {
  const resolvedPaths = {
    ...getCcSwitchPaths(),
    ...paths,
  };
  const settings = readCcSwitchSettings(resolvedPaths.settingsPath);
  const currentProviderId = settings?.currentProviderClaude;

  if (!isNonEmptyString(currentProviderId) || !fs.existsSync(resolvedPaths.databasePath)) {
    return null;
  }

  let db: Database.Database | null = null;
  try {
    db = new BetterSqlite3(resolvedPaths.databasePath, { readonly: true, fileMustExist: true });
    const provider = db
      .prepare('SELECT settings_config FROM providers WHERE id = ? LIMIT 1')
      .get(currentProviderId) as CcSwitchProviderRow | undefined;

    if (!isNonEmptyString(provider?.settings_config)) {
      return null;
    }

    const settingsConfig = parseJsonObject<ClaudeProviderSettingsConfig>(provider.settings_config);
    return buildClaudeModelInfoFromCcSwitchConfig(settingsConfig, readModelLabels(db));
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
