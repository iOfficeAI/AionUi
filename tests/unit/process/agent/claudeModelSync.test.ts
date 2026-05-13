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

import { claudeModelSyncAdapter } from '../../../../src/process/agent/modelSync/claudeModelSync';

describe('claudeModelSync', () => {
  let tempDir: string;
  let settingsPath: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-claude-'));
    settingsPath = path.join(tempDir, '.claude', 'settings.json');
    process.env.HOME = tempDir;
    resolveProcessProviderModelFromIntent.mockReset();
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('syncs an OpenAI-compatible provider into Claude settings takeover env', async () => {
    resolveProcessProviderModelFromIntent.mockResolvedValue({
      id: 'provider-1',
      platform: 'new-api',
      name: 'New API',
      baseUrl: 'https://api.mxou.cn',
      apiKey: 'sk-test',
      model: ['MiniMax-M2.7-highspeed'],
      modelProtocols: {
        'MiniMax-M2.7-highspeed': 'openai',
      },
      useModel: 'MiniMax-M2.7-highspeed',
    });

    const result = await claudeModelSyncAdapter.sync({
      providerId: 'provider-1',
      modelId: 'MiniMax-M2.7-highspeed',
      updatedAt: 1,
    });

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      model?: string;
      env?: Record<string, string>;
    };

    expect(result).toMatchObject({
      backend: 'claude',
      supported: true,
      state: 'prepared',
      appliedModelId: 'default:MiniMax-M2.7-highspeed',
    });
    expect(settings.model).toBe('default');
    expect(settings.env).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://api.mxou.cn',
      ANTHROPIC_MODEL: 'MiniMax-M2.7-highspeed',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'MiniMax-M2.7-highspeed',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'MiniMax-M2.7-highspeed',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'MiniMax-M2.7-highspeed',
      ANTHROPIC_AUTH_TOKEN: 'sk-test',
      ANTHROPIC_API_KEY: 'sk-test',
    });
  });
});
