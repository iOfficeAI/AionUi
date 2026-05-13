/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import type { DefaultModelIntent } from '@/common/config/storage';
import { resolveProcessProviderModelFromIntent } from './defaultModelIntent';
import { buildProviderSyncProfile, resolveHermesApiMode, type ProviderSyncProfile } from './providerSyncProfile';
import type { BackendModelSyncAdapter, BackendModelSyncResult } from './types';

const CONFIG_START_MARKER = '# >>> AionUI managed custom provider sync >>>';
const CONFIG_END_MARKER = '# <<< AionUI managed custom provider sync <<<';
const ENV_START_MARKER = '# >>> AionUI managed Hermes API keys >>>';
const ENV_END_MARKER = '# <<< AionUI managed Hermes API keys <<<';
const MANAGED_KEY_ENV = 'AIONUI_HERMES_API_KEY';

function resolveHermesDir(): string {
  const override = process.env.HERMES_CONFIG_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), '.hermes');
}

function resolveHermesConfigPath(): string {
  const override = process.env.HERMES_CONFIG_PATH?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(resolveHermesDir(), 'config.yaml');
}

function resolveHermesEnvPath(): string {
  const override = process.env.HERMES_ENV_PATH?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(resolveHermesDir(), '.env');
}

function replaceManagedBlock(content: string, startMarker: string, endMarker: string, block: string): string {
  const normalized = content.length > 0 ? content : '';
  const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, 'g');
  const stripped = normalized.replace(pattern, '').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '');
  const withGap = stripped.trimEnd();
  return `${withGap ? `${withGap}\n\n` : ''}${block}`;
}

function stripManagedConfigBlock(content: string): string {
  const escapedStart = CONFIG_START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = CONFIG_END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, 'g'), '').trim();
}

function buildManagedHermesProvider(profile: ProviderSyncProfile): Record<string, unknown> {
  return {
    name: profile.managedProviderId,
    base_url: profile.normalizedBaseUrl,
    key_env: MANAGED_KEY_ENV,
    api_mode: resolveHermesApiMode(profile),
    models: {
      [profile.normalizedModelId]: {},
    },
  };
}

function readHermesConfigFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = stripManagedConfigBlock(fs.readFileSync(filePath, 'utf8'));
  if (!raw) {
    return {};
  }

  const parsed = YAML.parse(raw, { uniqueKeys: false });
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

function writeHermesConfigFile(filePath: string, profile: ProviderSyncProfile): void {
  const root = readHermesConfigFile(filePath);
  const existingProviders = Array.isArray(root.custom_providers)
    ? root.custom_providers.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    : [];

  root.custom_providers = [
    ...existingProviders.filter((entry) => {
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      return !name.startsWith('aionui-') && name !== profile.managedProviderId;
    }),
    buildManagedHermesProvider(profile),
  ];

  const model = root.model && typeof root.model === 'object' && !Array.isArray(root.model)
    ? { ...(root.model as Record<string, unknown>) }
    : {};
  model.default = profile.normalizedModelId;
  model.provider = 'custom';
  model.base_url = profile.normalizedBaseUrl;
  model.api_key = `\${${MANAGED_KEY_ENV}}`;
  model.api_mode = resolveHermesApiMode(profile);
  root.model = model;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next = YAML.stringify(root, {
    defaultStringType: 'QUOTE_DOUBLE',
    lineWidth: 0,
  });
  fs.writeFileSync(filePath, next.endsWith('\n') ? next : `${next}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // ignore chmod failure on unsupported filesystems
  }
}

function renderHermesEnvBlock(apiKey: string): string {
  return [ENV_START_MARKER, `${MANAGED_KEY_ENV}=${JSON.stringify(apiKey)}`, ENV_END_MARKER, ''].join('\n');
}

function writeManagedFile(filePath: string, startMarker: string, endMarker: string, block: string): void {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const next = replaceManagedBlock(current, startMarker, endMarker, block);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next.endsWith('\n') ? next : `${next}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // ignore chmod failure on unsupported filesystems
  }
}

export function writeHermesConfigForProviderSync(profile: ProviderSyncProfile): void {
  writeHermesConfigFile(resolveHermesConfigPath(), profile);
  writeManagedFile(resolveHermesEnvPath(), ENV_START_MARKER, ENV_END_MARKER, renderHermesEnvBlock(profile.provider.apiKey));
}

export const hermesModelSyncAdapter: BackendModelSyncAdapter = {
  backend: 'hermes',
  async supports(intent: DefaultModelIntent): Promise<boolean> {
    const provider = await resolveProcessProviderModelFromIntent(intent);
    return provider ? buildProviderSyncProfile(provider) !== null : false;
  },
  async sync(intent: DefaultModelIntent): Promise<BackendModelSyncResult> {
    const provider = await resolveProcessProviderModelFromIntent(intent);
    const profile = provider ? buildProviderSyncProfile(provider) : null;

    if (!provider || !profile) {
      return {
        backend: 'hermes',
        supported: false,
        state: 'unsupported',
        reason: 'Hermes native sync requires a provider with baseUrl, apiKey, and a concrete model id',
      };
    }

    try {
      writeHermesConfigForProviderSync(profile);
      return {
        backend: 'hermes',
        supported: true,
        state: 'prepared',
        appliedModelId: `custom:${profile.managedProviderId}:${profile.normalizedModelId}`,
      };
    } catch (error) {
      return {
        backend: 'hermes',
        supported: false,
        state: 'degraded',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
