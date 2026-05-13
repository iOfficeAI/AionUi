/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenClaw Config Reader
 *
 * Reads OpenClaw configuration from ~/.openclaw/openclaw.json
 * to get gateway auth settings.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Config file paths
const DEFAULT_STATE_DIR = path.join(os.homedir(), '.openclaw');
const CONFIG_FILENAME = 'openclaw.json';
const LEGACY_CONFIG_FILENAMES = ['clawdbot.json', 'moltbot.json', 'moldbot.json'];

interface OpenClawGatewayAuth {
  mode?: 'none' | 'token' | 'password';
  token?: string;
  password?: string;
}

interface OpenClawGatewayConfig {
  port?: number;
  auth?: OpenClawGatewayAuth;
}

type OpenClawConfiguredModel =
  | string
  | {
      primary?: string;
      fallbacks?: string[];
    };

type OpenClawProviderModel = {
  id: string;
  name?: string;
  input?: string[];
};

type OpenClawProviderConfig = {
  baseUrl?: string;
  apiKey?: string;
  auth?: 'api-key';
  api?: string;
  headers?: Record<string, string>;
  authHeader?: boolean;
  models?: OpenClawProviderModel[];
};

interface OpenClawConfig {
  gateway?: OpenClawGatewayConfig;
  agents?: {
    defaults?: {
      model?: OpenClawConfiguredModel;
      workspace?: string;
    };
  };
  models?: {
    mode?: 'merge' | 'replace';
    providers?: Record<string, OpenClawProviderConfig>;
  };
}

export type OpenClawManagedProviderUpdate = {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  api: string;
  modelId: string;
  modelName: string;
  authHeader?: boolean;
};

/**
 * Resolve the state directory (default: ~/.openclaw)
 */
function resolveStateDir(): string {
  const override = process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim();
  if (override) {
    return resolveUserPath(override);
  }

  const newDir = DEFAULT_STATE_DIR;
  const legacyDirs = ['.clawdbot', '.moltbot', '.moldbot'].map((dir) => path.join(os.homedir(), dir));

  if (fs.existsSync(newDir)) {
    return newDir;
  }

  const existingLegacy = legacyDirs.find((dir) => {
    try {
      return fs.existsSync(dir);
    } catch {
      return false;
    }
  });

  if (existingLegacy) {
    return existingLegacy;
  }

  return newDir;
}

/**
 * Resolve user path (expand ~ to home directory)
 */
function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith('~')) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, os.homedir());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
}

/**
 * Find the config file path
 */
function findConfigPath(): string | null {
  const override = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (override) {
    return resolveUserPath(override);
  }

  const stateDir = resolveStateDir();
  const candidates = [CONFIG_FILENAME, ...LEGACY_CONFIG_FILENAMES].map((name) => path.join(stateDir, name));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function readOpenClawConfigFromPath(configPath: string): OpenClawConfig | null {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    try {
      return JSON.parse(content) as OpenClawConfig;
    } catch {
      const cleanContent = content.replace(/"(?:[^"\\]|\\.)*"|\/\/.*$|\/\*[\s\S]*?\*\//gm, (match) =>
        match.startsWith('"') ? match : ''
      );
      return JSON.parse(cleanContent) as OpenClawConfig;
    }
  } catch (error) {
    console.warn('[OpenClawConfig] Failed to read config:', error);
    return null;
  }
}

/**
 * Read OpenClaw config from file
 */
export function readOpenClawConfig(): OpenClawConfig | null {
  const configPath = findConfigPath();
  if (!configPath) {
    return null;
  }

  return readOpenClawConfigFromPath(configPath);
}

export function getOpenClawConfigPath(): string {
  return findConfigPath() ?? path.join(resolveStateDir(), CONFIG_FILENAME);
}

function writeOpenClawConfig(configPath: string, config: OpenClawConfig): { configPath: string; config: OpenClawConfig } {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

  try {
    fs.chmodSync(configPath, 0o600);
  } catch {
    // Ignore permission normalization failures on unsupported filesystems.
  }

  return { configPath, config };
}

export function setOpenClawDefaultModel(model: string): { configPath: string; config: OpenClawConfig } {
  const configPath = getOpenClawConfigPath();
  const currentConfig = readOpenClawConfigFromPath(configPath) ?? {};
  const nextConfig: OpenClawConfig = {
    ...currentConfig,
    agents: {
      ...currentConfig.agents,
      defaults: {
        ...currentConfig.agents?.defaults,
        model,
      },
    },
  };

  return writeOpenClawConfig(configPath, nextConfig);
}

export function setOpenClawManagedProviderModel(update: OpenClawManagedProviderUpdate): {
  configPath: string;
  config: OpenClawConfig;
} {
  const configPath = getOpenClawConfigPath();
  const currentConfig = readOpenClawConfigFromPath(configPath) ?? {};
  const nextProviders = {
    ...(currentConfig.models?.providers ?? {}),
    [update.providerId]: {
      ...(currentConfig.models?.providers?.[update.providerId] ?? {}),
      baseUrl: update.baseUrl,
      apiKey: update.apiKey,
      auth: 'api-key' as const,
      api: update.api,
      headers: currentConfig.models?.providers?.[update.providerId]?.headers ?? {},
      authHeader: update.authHeader,
      models: [
        {
          id: update.modelId,
          name: update.modelName,
        },
      ],
    },
  };

  const nextConfig: OpenClawConfig = {
    ...currentConfig,
    agents: {
      ...currentConfig.agents,
      defaults: {
        ...currentConfig.agents?.defaults,
        model: {
          primary: `${update.providerId}/${update.modelId}`,
        },
      },
    },
    models: {
      ...currentConfig.models,
      mode: 'merge',
      providers: nextProviders,
    },
  };

  return writeOpenClawConfig(configPath, nextConfig);
}

/**
 * Get gateway auth settings from config
 */
export function getGatewayAuthFromConfig(): OpenClawGatewayAuth | null {
  const config = readOpenClawConfig();
  return config?.gateway?.auth ?? null;
}

/**
 * Get gateway auth token from config
 */
export function getGatewayAuthToken(): string | null {
  const auth = getGatewayAuthFromConfig();
  if (auth?.mode === 'token' && auth.token) {
    return auth.token;
  }
  return null;
}

/**
 * Get gateway auth password from config
 */
export function getGatewayAuthPassword(): string | null {
  const auth = getGatewayAuthFromConfig();
  if (auth?.mode === 'password' && auth.password) {
    return auth.password;
  }
  return null;
}

/**
 * Get gateway port from config
 */
export function getGatewayPort(): number {
  const config = readOpenClawConfig();
  const port = config?.gateway?.port;
  if (typeof port === 'number' && Number.isFinite(port) && port > 0) {
    return port;
  }
  return 18789;
}
