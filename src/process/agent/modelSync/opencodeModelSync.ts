/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import type { DefaultModelIntent } from '@/common/config/storage';
import { resolveProcessProviderModelFromIntent } from './defaultModelIntent';
import { buildProviderSyncProfile, resolveOpencodeBaseUrl, resolveOpencodeNpmPackage } from './providerSyncProfile';
import type { BackendModelSyncAdapter, BackendModelSyncResult } from './types';
import { parseOpencodeConfig, resolveOpencodeConfigPath } from '@process/services/mcpServices/agents/OpencodeMcpAgent';

type OpencodeModelDefinition = {
  name: string;
};

type OpencodeProviderEntry = {
  npm: string;
  name?: string;
  options?: {
    baseURL?: string;
    apiKey?: string;
    headers?: Record<string, string>;
  };
  models?: Record<string, OpencodeModelDefinition>;
};

type OpencodeProviderConfig = {
  $schema?: string;
  model?: string;
  small_model?: string;
  provider?: Record<string, OpencodeProviderEntry>;
  [key: string]: unknown;
};

const OPENCODE_SCHEMA_URL = 'https://opencode.ai/config.json';

function readOpencodeProviderConfig(configPath: string): OpencodeProviderConfig {
  if (!fs.existsSync(configPath)) {
    return { $schema: OPENCODE_SCHEMA_URL };
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = parseOpencodeConfig(raw) as OpencodeProviderConfig;
  return {
    ...parsed,
    $schema: typeof parsed.$schema === 'string' ? parsed.$schema : OPENCODE_SCHEMA_URL,
  };
}

function writeOpencodeProviderConfig(configPath: string, config: OpencodeProviderConfig): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });

  try {
    fs.chmodSync(configPath, 0o600);
  } catch {
    // ignore chmod failure on unsupported filesystems
  }
}

export function writeOpencodeConfigForProviderSync(update: {
  providerId: string;
  providerName: string;
  npm: '@ai-sdk/openai-compatible' | '@ai-sdk/anthropic' | '@ai-sdk/google';
  baseUrl: string;
  apiKey: string;
  modelId: string;
}): { configPath: string; config: OpencodeProviderConfig } {
  const configPath = resolveOpencodeConfigPath();
  const currentConfig = readOpencodeProviderConfig(configPath);
  const nextProvider = {
    ...(currentConfig.provider ?? {}),
    [update.providerId]: {
      ...(currentConfig.provider?.[update.providerId] ?? {}),
      npm: update.npm,
      name: update.providerName,
      options: {
        ...(currentConfig.provider?.[update.providerId]?.options ?? {}),
        baseURL: update.baseUrl,
        apiKey: update.apiKey,
      },
      models: {
        ...(currentConfig.provider?.[update.providerId]?.models ?? {}),
        [update.modelId]: {
          name: update.modelId,
        },
      },
    },
  };

  const nextConfig: OpencodeProviderConfig = {
    ...currentConfig,
    $schema: currentConfig.$schema || OPENCODE_SCHEMA_URL,
    model: `${update.providerId}/${update.modelId}`,
    provider: nextProvider,
  };

  writeOpencodeProviderConfig(configPath, nextConfig);
  return { configPath, config: nextConfig };
}

export const opencodeModelSyncAdapter: BackendModelSyncAdapter = {
  backend: 'opencode',
  async supports(intent: DefaultModelIntent): Promise<boolean> {
    const provider = await resolveProcessProviderModelFromIntent(intent);
    return provider ? buildProviderSyncProfile(provider) !== null : false;
  },
  async sync(intent: DefaultModelIntent): Promise<BackendModelSyncResult> {
    const provider = await resolveProcessProviderModelFromIntent(intent);
    const profile = provider ? buildProviderSyncProfile(provider) : null;

    if (!provider || !profile) {
      return {
        backend: 'opencode',
        supported: false,
        state: 'unsupported',
        reason: 'OpenCode native sync requires a provider with baseUrl, apiKey, and a concrete model id',
      };
    }

    try {
      writeOpencodeConfigForProviderSync({
        providerId: profile.managedProviderId,
        providerName: provider.name || profile.managedProviderId,
        npm: resolveOpencodeNpmPackage(profile),
        baseUrl: resolveOpencodeBaseUrl(profile),
        apiKey: profile.provider.apiKey,
        modelId: profile.normalizedModelId,
      });
      return {
        backend: 'opencode',
        supported: true,
        state: 'prepared',
        appliedModelId: `${profile.managedProviderId}:${profile.normalizedModelId}`,
      };
    } catch (error) {
      return {
        backend: 'opencode',
        supported: false,
        state: 'degraded',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
