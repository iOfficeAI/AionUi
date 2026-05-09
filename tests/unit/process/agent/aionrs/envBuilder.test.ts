import { describe, expect, it } from 'vitest';

import type { TProviderWithModel } from '../../../../../src/common/config/storage';
import { buildSpawnConfig } from '../../../../../src/process/agent/aionrs/envBuilder';

function makeProvider(overrides: Partial<TProviderWithModel>): TProviderWithModel {
  return {
    id: 'provider-id',
    name: 'Provider',
    platform: 'custom',
    baseUrl: '',
    apiKey: '',
    useModel: 'test-model',
    ...overrides,
  };
}

describe('buildSpawnConfig', () => {
  it('uses a single OpenAI key when multiple keys are configured', () => {
    const result = buildSpawnConfig(
      makeProvider({
        name: 'OpenRouter',
        platform: 'custom',
        baseUrl: 'https://openrouter.ai/api/v1',
        useModel: 'openai/gpt-4.1-mini',
        apiKey: 'sk-first\nsk-second',
      }),
      {
        workspace: '/tmp/workspace',
      }
    );

    expect(result.env.OPENAI_API_KEY).toBeTruthy();
    expect(result.env.OPENAI_API_KEY).not.toContain('\n');
    expect(['sk-first', 'sk-second']).toContain(result.env.OPENAI_API_KEY);
  });

  it('keeps single-key configs unchanged', () => {
    const result = buildSpawnConfig(
      makeProvider({
        name: 'Anthropic',
        platform: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        useModel: 'claude-sonnet-4-20250514',
        apiKey: 'sk-ant-only',
      }),
      {
        workspace: '/tmp/workspace',
      }
    );

    expect(result.env.ANTHROPIC_API_KEY).toBe('sk-ant-only');
  });
});
