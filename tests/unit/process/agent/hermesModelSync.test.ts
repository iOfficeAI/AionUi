/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveProcessProviderModelFromIntent } = vi.hoisted(() => ({
  resolveProcessProviderModelFromIntent: vi.fn(),
}));

vi.mock('../../../../src/process/agent/modelSync/defaultModelIntent', () => ({
  resolveProcessProviderModelFromIntent,
}));

import {
  hermesModelSyncAdapter,
  writeHermesConfigForProviderSync,
} from '../../../../src/process/agent/modelSync/hermesModelSync';

describe('hermesModelSync', () => {
  let tempDir: string;
  let configPath: string;
  let envPath: string;
  const originalConfigDir = process.env.HERMES_CONFIG_DIR;
  const originalConfigPath = process.env.HERMES_CONFIG_PATH;
  const originalEnvPath = process.env.HERMES_ENV_PATH;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-hermes-'));
    configPath = path.join(tempDir, 'config.yaml');
    envPath = path.join(tempDir, '.env');
    process.env.HERMES_CONFIG_DIR = tempDir;
    process.env.HERMES_CONFIG_PATH = configPath;
    process.env.HERMES_ENV_PATH = envPath;
    resolveProcessProviderModelFromIntent.mockReset();
  });

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.HERMES_CONFIG_DIR;
    else process.env.HERMES_CONFIG_DIR = originalConfigDir;
    if (originalConfigPath === undefined) delete process.env.HERMES_CONFIG_PATH;
    else process.env.HERMES_CONFIG_PATH = originalConfigPath;
    if (originalEnvPath === undefined) delete process.env.HERMES_ENV_PATH;
    else process.env.HERMES_ENV_PATH = originalEnvPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function readConfig(): Record<string, unknown> {
    return YAML.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  }

  it('writes a managed Hermes provider block and api key env block', () => {
    fs.writeFileSync(configPath, 'display:\n  skin: cyberpunk\n', 'utf8');
    fs.writeFileSync(envPath, 'KEEP_ME="1"\n', 'utf8');

    writeHermesConfigForProviderSync({
      provider: {
        id: 'provider-1',
        platform: 'openai',
        name: 'Proxy',
        baseUrl: 'https://proxy.example.com/v1',
        apiKey: 'sk-test',
        useModel: 'gpt-4.1',
      },
      protocol: 'openai',
      normalizedBaseUrl: 'https://proxy.example.com/v1',
      normalizedModelId: 'gpt-4.1',
      managedProviderId: 'aionui-proxy-provider-1',
    });

    const config = readConfig();
    const env = fs.readFileSync(envPath, 'utf8');
    const customProviders = config.custom_providers as Array<Record<string, unknown>>;
    const model = config.model as Record<string, unknown>;

    expect(config.display).toEqual({ skin: 'cyberpunk' });
    expect(customProviders).toHaveLength(1);
    expect(customProviders[0]).toMatchObject({
      name: 'aionui-proxy-provider-1',
      base_url: 'https://proxy.example.com/v1',
      key_env: 'AIONUI_HERMES_API_KEY',
      api_mode: 'chat_completions',
    });
    expect(model).toMatchObject({
      default: 'gpt-4.1',
      provider: 'custom',
      base_url: 'https://proxy.example.com/v1',
      api_key: '${AIONUI_HERMES_API_KEY}',
      api_mode: 'chat_completions',
    });

    expect(env).toContain('KEEP_ME="1"');
    expect(env).toContain('# >>> AionUI managed Hermes API keys >>>');
    expect(env).toContain('AIONUI_HERMES_API_KEY="sk-test"');
  });

  it('merges the managed provider into existing config without duplicating custom_providers roots', () => {
    fs.writeFileSync(
      configPath,
      [
        'display:',
        '  skin: cyberpunk',
        'custom_providers:',
        '  - name: keep-provider',
        '    base_url: https://keep.example.com/v1',
        '    key_env: KEEP_KEY',
        '    api_mode: chat_completions',
        '    models:',
        '      keep-model: {}',
        '# >>> AionUI managed custom provider sync >>>',
        'custom_providers:',
        '  - name: old-provider',
        '# <<< AionUI managed custom provider sync <<<',
        '',
      ].join('\n'),
      'utf8'
    );

    writeHermesConfigForProviderSync({
      provider: {
        id: 'provider-2',
        platform: 'anthropic',
        name: 'Proxy',
        baseUrl: 'https://proxy.example.com/anthropic',
        apiKey: 'sk-next',
        useModel: 'claude-sonnet-4',
      },
      protocol: 'anthropic',
      normalizedBaseUrl: 'https://proxy.example.com/anthropic',
      normalizedModelId: 'claude-sonnet-4',
      managedProviderId: 'aionui-proxy-provider-2',
    });

    const config = readConfig();
    const customProviders = config.custom_providers as Array<Record<string, unknown>>;

    expect(config.display).toEqual({ skin: 'cyberpunk' });
    expect(customProviders).toHaveLength(2);
    expect(customProviders.map((entry) => entry.name)).toEqual(['keep-provider', 'aionui-proxy-provider-2']);
  });

  it('uses anthropic_messages for new-api openai-compatible providers', async () => {
    resolveProcessProviderModelFromIntent.mockResolvedValue({
      id: 'provider-1',
      platform: 'new-api',
      name: 'MXOU',
      baseUrl: 'https://api.mxou.cn',
      apiKey: 'sk-test',
      modelProtocols: {
        'MiniMax-M2.7-highspeed': 'openai',
      },
      useModel: 'MiniMax-M2.7-highspeed',
    });

    await hermesModelSyncAdapter.sync({
      providerId: 'provider-1',
      modelId: 'MiniMax-M2.7-highspeed',
      updatedAt: 1,
    });

    const config = readConfig();
    const customProviders = config.custom_providers as Array<Record<string, unknown>>;
    expect(customProviders[0]?.api_mode).toBe('anthropic_messages');
  });

  it('syncs Hermes config for a supported provider intent', async () => {
    resolveProcessProviderModelFromIntent.mockResolvedValue({
      id: 'provider-1',
      platform: 'openai',
      name: 'Proxy',
      baseUrl: 'https://proxy.example.com/v1',
      apiKey: 'sk-test',
      useModel: 'gpt-4.1',
    });

    const result = await hermesModelSyncAdapter.sync({
      providerId: 'provider-1',
      modelId: 'gpt-4.1',
      updatedAt: 1,
    });

    expect(result).toMatchObject({
      backend: 'hermes',
      supported: true,
      appliedModelId: expect.stringContaining(':gpt-4.1'),
    });
    const config = readConfig();
    expect((config.model as Record<string, unknown>)?.default).toBe('gpt-4.1');
    expect(fs.readFileSync(envPath, 'utf8')).toContain('AIONUI_HERMES_API_KEY="sk-test"');
  });
});
