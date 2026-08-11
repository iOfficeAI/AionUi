import { describe, expect, it } from 'vitest';
import { buildSpawnConfig } from '@/process/agent/aionrs/envBuilder';
import type { TProviderWithModel } from '@/common/config/storage';

describe('aionrs envBuilder', () => {
  it('preserves the OpenAI-compatible API version after a path prefix', () => {
    const model: TProviderWithModel = {
      id: 'custom-provider',
      name: 'Custom',
      platform: 'custom',
      baseUrl: 'https://opencode.ai/zen/go/v1/',
      apiKey: 'test-key',
      useModel: 'deepseek-v4-pro',
    };

    const { args } = buildSpawnConfig(model, { workspace: '/tmp/aionui-test' });

    expect(args).toEqual(expect.arrayContaining(['--base-url', 'https://opencode.ai/zen/go/v1']));
  });

  it('removes the Anthropic API version that aionrs adds itself', () => {
    const model: TProviderWithModel = {
      id: 'anthropic-provider',
      name: 'Anthropic',
      platform: 'anthropic',
      baseUrl: 'https://anthropic.example.com/proxy/v1/',
      apiKey: 'test-key',
      useModel: 'claude-test',
    };

    const { args } = buildSpawnConfig(model, { workspace: '/tmp/aionui-test' });

    expect(args).toEqual(expect.arrayContaining(['--base-url', 'https://anthropic.example.com/proxy']));
  });

  it('passes ChatGPT gpt-5.6-sol through as the spawned model id', () => {
    const model: TProviderWithModel = {
      id: 'chatgpt-provider',
      name: 'ChatGPT',
      platform: 'chatgpt',
      baseUrl: 'https://chatgpt.com',
      apiKey: '',
      useModel: 'gpt-5.6-sol',
    };

    const { args } = buildSpawnConfig(model, { workspace: '/tmp/aionui-test' });

    expect(args).toEqual(expect.arrayContaining(['--provider', 'chatgpt', '--model', 'gpt-5.6-sol']));
  });
});
