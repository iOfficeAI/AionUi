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

import { openClawModelSyncAdapter } from '../../../../src/process/agent/modelSync/openclawModelSync';
import {
  setOpenClawDefaultModel,
  setOpenClawManagedProviderModel,
} from '../../../../src/process/agent/openclaw/openclawConfig';

describe('openClawModelSync', () => {
  let tempDir: string;
  let configPath: string;
  const originalConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const originalStateDir = process.env.OPENCLAW_STATE_DIR;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-openclaw-'));
    configPath = path.join(tempDir, 'openclaw.json');
    process.env.OPENCLAW_CONFIG_PATH = configPath;
    process.env.OPENCLAW_STATE_DIR = tempDir;
    resolveProcessProviderModelFromIntent.mockReset();
  });

  afterEach(() => {
    if (originalConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;
    }

    if (originalStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = originalStateDir;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes the legacy default model into openclaw.json while preserving other config', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        gateway: { port: 18789 },
        agents: { defaults: { workspace: '/tmp/workspace' } },
      })
    );

    const result = setOpenClawDefaultModel('anthropic/claude-sonnet-4');
    const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      gateway?: { port?: number };
      agents?: { defaults?: { workspace?: string; model?: string } };
    };

    expect(result.configPath).toBe(configPath);
    expect(savedConfig.gateway?.port).toBe(18789);
    expect(savedConfig.agents?.defaults?.workspace).toBe('/tmp/workspace');
    expect(savedConfig.agents?.defaults?.model).toBe('anthropic/claude-sonnet-4');
  });

  it('writes a managed provider config and object-form default model', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        gateway: { port: 18789 },
        models: { providers: { existing: { baseUrl: 'https://existing.example.com' } } },
      })
    );

    const result = setOpenClawManagedProviderModel({
      providerId: 'aionui-provider-1',
      baseUrl: 'https://proxy.example.com/v1',
      apiKey: 'sk-test',
      api: 'openai-completions',
      modelId: 'gpt-4.1',
      modelName: 'gpt-4.1',
      authHeader: true,
    });
    const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      agents?: { defaults?: { model?: { primary?: string } } };
      models?: { mode?: string; providers?: Record<string, Record<string, unknown>> };
    };

    expect(result.configPath).toBe(configPath);
    expect(savedConfig.agents?.defaults?.model).toEqual({ primary: 'aionui-provider-1/gpt-4.1' });
    expect(savedConfig.models?.mode).toBe('merge');
    expect(savedConfig.models?.providers?.existing?.baseUrl).toBe('https://existing.example.com');
    expect(savedConfig.models?.providers?.['aionui-provider-1']).toEqual({
      baseUrl: 'https://proxy.example.com/v1',
      apiKey: 'sk-test',
      auth: 'api-key',
      api: 'openai-completions',
      headers: {},
      authHeader: true,
      models: [{ id: 'gpt-4.1', name: 'gpt-4.1' }],
    });
  });

  it('prefers anthropic-compatible transport for new-api openai-compatible providers', async () => {
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

    await openClawModelSyncAdapter.sync({
      providerId: 'provider-1',
      modelId: 'MiniMax-M2.7-highspeed',
      updatedAt: 1,
    });

    const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      models?: { providers?: Record<string, Record<string, unknown>> };
    };
    const providerKey = Object.keys(savedConfig.models?.providers ?? {}).find((key) => key.startsWith('aionui-')) ?? '';

    expect(savedConfig.models?.providers?.[providerKey]).toMatchObject({
      api: 'anthropic-messages',
      authHeader: false,
    });
  });

  it('syncs a supported provider model intent into OpenClaw config without auth gating', async () => {
    resolveProcessProviderModelFromIntent.mockResolvedValue({
      id: 'provider-1',
      platform: 'anthropic',
      name: 'Anthropic',
      baseUrl: 'https://proxy.example.com/anthropic',
      apiKey: 'sk-test',
      useModel: 'claude-sonnet-4',
    });

    const result = await openClawModelSyncAdapter.sync({
      providerId: 'provider-1',
      modelId: 'claude-sonnet-4',
      updatedAt: 1,
    });

    const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      agents?: { defaults?: { model?: { primary?: string } } };
      models?: { providers?: Record<string, Record<string, unknown>> };
    };
    const providerKey = Object.keys(savedConfig.models?.providers ?? {}).find((key) => key.startsWith('aionui-'));

    expect(result.backend).toBe('openclaw-gateway');
    expect(result.supported).toBe(true);
    expect(result.appliedModelId).toBe(`${providerKey}/claude-sonnet-4`);
    expect(savedConfig.agents?.defaults?.model).toEqual({ primary: `${providerKey}/claude-sonnet-4` });
    expect(savedConfig.models?.providers?.[providerKey ?? '']).toMatchObject({
      baseUrl: 'https://proxy.example.com/anthropic',
      apiKey: 'sk-test',
      auth: 'api-key',
      api: 'anthropic-messages',
      models: [{ id: 'claude-sonnet-4', name: 'claude-sonnet-4' }],
    });
  });

  it('rejects incomplete provider intents without writing config', async () => {
    resolveProcessProviderModelFromIntent.mockResolvedValue({
      id: 'provider-2',
      platform: 'new-api',
      name: 'Proxy',
      baseUrl: '',
      apiKey: 'sk-test',
      useModel: 'gpt-4.1',
    });

    const result = await openClawModelSyncAdapter.sync({
      providerId: 'provider-2',
      modelId: 'gpt-4.1',
      updatedAt: 1,
    });

    expect(result.supported).toBe(false);
    expect(fs.existsSync(configPath)).toBe(false);
  });
});
