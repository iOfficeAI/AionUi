import { describe, expect, it } from 'vitest';
import { buildSpawnConfig } from '@/process/agent/aionrs/envBuilder';
import type { TProviderWithModel } from '@/common/config/storage';

describe('aionrs envBuilder', () => {
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
