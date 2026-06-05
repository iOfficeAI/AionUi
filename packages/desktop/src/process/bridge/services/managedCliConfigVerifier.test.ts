/**
 * @license
 * Copyright 2025 POUNDING
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { verifyConfigByTarget } from '@/process/bridge/services/managedCliConfigVerifier';

describe('managedCliConfigVerifier', () => {
  it('verifies Claude settings structurally', () => {
    const result = verifyConfigByTarget(
      'claude',
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.mxou.cn',
          ANTHROPIC_API_KEY: 'sk-test',
        },
        model: 'default',
      }),
      undefined,
      'https://api.mxou.cn'
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts Claude cc-switch model env overrides when base URL and key are present', () => {
    const result = verifyConfigByTarget(
      'claude',
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.mxou.cn',
          ANTHROPIC_API_KEY: 'sk-test',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-max',
        },
      }),
      undefined,
      'https://api.mxou.cn'
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('verifies Hermes config with yaml plus env file', () => {
    const result = verifyConfigByTarget(
      'hermes',
      [
        'custom_providers:',
        '  - name: "pounding"',
        '    base_url: "https://api.mxou.cn"',
        '    key_env: "AIONUI_HERMES_API_KEY"',
        '    api_mode: "chat_completions"',
        'model:',
        '  default: "MiniMax-M2.7-highspeed"',
        '  provider: "custom"',
        '  base_url: "https://api.mxou.cn"',
        '  api_mode: "chat_completions"',
      ].join('\n'),
      'AIONUI_HERMES_API_KEY="sk-test"\n',
      'https://api.mxou.cn'
    );

    expect(result.ok).toBe(true);
  });

  it('verifies OpenCode config structurally', () => {
    const result = verifyConfigByTarget(
      'opencode',
      JSON.stringify({
        provider: {
          'pounding-new-api': {
            npm: '@ai-sdk/openai-compatible',
            options: {
              baseURL: 'https://api.mxou.cn',
              apiKey: 'sk-test',
            },
          },
        },
      }),
      undefined,
      'https://api.mxou.cn'
    );

    expect(result.ok).toBe(true);
  });

  it('accepts normalized OpenCode base URLs with /v1 suffix', () => {
    const result = verifyConfigByTarget(
      'opencode',
      JSON.stringify({
        provider: {
          pounding: {
            npm: '@ai-sdk/openai-compatible',
            options: {
              baseURL: 'https://api.mxou.cn/v1',
              apiKey: 'sk-test',
            },
          },
        },
      }),
      undefined,
      'https://api.mxou.cn'
    );

    expect(result.ok).toBe(true);
  });

  it('verifies OpenClaw config structurally', () => {
    const result = verifyConfigByTarget(
      'openclaw',
      JSON.stringify({
        models: {
          providers: {
            'pounding-new-api': {
              baseUrl: 'https://api.mxou.cn',
              apiKey: 'sk-test',
              api: 'openai-completions',
            },
          },
        },
      }),
      undefined,
      'https://api.mxou.cn'
    );

    expect(result.ok).toBe(true);
  });

  it('accepts normalized OpenClaw base URLs with /v1 suffix', () => {
    const result = verifyConfigByTarget(
      'openclaw',
      JSON.stringify({
        models: {
          providers: {
            pounding: {
              baseUrl: 'https://api.mxou.cn/v1',
              apiKey: 'sk-test',
              api: 'openai-completions',
            },
          },
        },
      }),
      undefined,
      'https://api.mxou.cn'
    );

    expect(result.ok).toBe(true);
  });
});
