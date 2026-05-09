/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveProcessProviderModelFromIntent } = vi.hoisted(() => ({
  resolveProcessProviderModelFromIntent: vi.fn(),
}));

vi.mock('../../../../src/process/agent/modelSync/defaultModelIntent', () => ({
  resolveProcessProviderModelFromIntent,
}));

import {
  opencodeModelSyncAdapter,
  writeOpencodeConfigForProviderSync,
} from '../../../../src/process/agent/modelSync/opencodeModelSync';

describe('opencodeModelSync', () => {
  let tempDir: string;
  let configPath: string;
  const originalOpencodeConfig = process.env.OPENCODE_CONFIG;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-opencode-'));
    configPath = path.join(tempDir, 'opencode.json');
    process.env.OPENCODE_CONFIG = configPath;
    resolveProcessProviderModelFromIntent.mockReset();
  });

  afterEach(() => {
    if (originalOpencodeConfig === undefined) delete process.env.OPENCODE_CONFIG;
    else process.env.OPENCODE_CONFIG = originalOpencodeConfig;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes a managed OpenCode provider while preserving unrelated config', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        plugin: ['keep-plugin'],
      })
    );

    const result = writeOpencodeConfigForProviderSync({
      providerId: 'aionui-provider-1',
      providerName: 'MXOU',
      npm: '@ai-sdk/anthropic',
      baseUrl: 'https://api.mxou.cn',
      apiKey: 'sk-test',
      modelId: 'MiniMax-M2.7-highspeed',
    });

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      plugin?: string[];
      provider?: Record<string, unknown>;
    };

    expect(result.configPath).toBe(configPath);
    expect(saved.plugin).toEqual(['keep-plugin']);
    expect(saved.model).toBe('aionui-provider-1/MiniMax-M2.7-highspeed');
    expect(saved.provider?.['aionui-provider-1']).toEqual({
      npm: '@ai-sdk/anthropic',
      name: 'MXOU',
      options: {
        baseURL: 'https://api.mxou.cn',
        apiKey: 'sk-test',
      },
      models: {
        'MiniMax-M2.7-highspeed': {
          name: 'MiniMax-M2.7-highspeed',
        },
      },
    });
  });

  it('uses OpenAI-compatible provider settings for new-api providers', async () => {
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

    await opencodeModelSyncAdapter.sync({
      providerId: 'provider-1',
      modelId: 'MiniMax-M2.7-highspeed',
      updatedAt: 1,
    });

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      provider?: Record<string, { npm?: string }>;
    };
    const providerKey = Object.keys(saved.provider ?? {}).find((key) => key.startsWith('aionui-')) ?? '';
    expect(saved.provider?.[providerKey]?.npm).toBe('@ai-sdk/openai-compatible');
    expect(saved.provider?.[providerKey]?.options?.baseURL).toBe('https://api.mxou.cn/v1');
  });

  it('syncs a supported provider intent into OpenCode config', async () => {
    resolveProcessProviderModelFromIntent.mockResolvedValue({
      id: 'provider-2',
      platform: 'openai',
      name: 'Proxy',
      baseUrl: 'https://proxy.example.com/v1',
      apiKey: 'sk-openai',
      useModel: 'gpt-4.1',
    });

    const result = await opencodeModelSyncAdapter.sync({
      providerId: 'provider-2',
      modelId: 'gpt-4.1',
      updatedAt: 1,
    });

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      provider?: Record<string, { npm?: string; options?: Record<string, string> }>;
    };
    const providerKey = Object.keys(saved.provider ?? {}).find((key) => key.startsWith('aionui-')) ?? '';

    expect(result).toMatchObject({
      backend: 'opencode',
      supported: true,
      state: 'prepared',
      appliedModelId: `${providerKey}:gpt-4.1`,
    });
    expect(saved.provider?.[providerKey]).toMatchObject({
      npm: '@ai-sdk/openai-compatible',
      options: {
        baseURL: 'https://proxy.example.com/v1',
        apiKey: 'sk-openai',
      },
    });
  });

  it('rejects incomplete provider intents without writing config', async () => {
    resolveProcessProviderModelFromIntent.mockResolvedValue({
      id: 'provider-3',
      platform: 'openai',
      name: 'Broken',
      baseUrl: '',
      apiKey: 'sk-test',
      useModel: 'gpt-4.1',
    });

    const result = await opencodeModelSyncAdapter.sync({
      providerId: 'provider-3',
      modelId: 'gpt-4.1',
      updatedAt: 1,
    });

    expect(result.supported).toBe(false);
    expect(fs.existsSync(configPath)).toBe(false);
  });
});
