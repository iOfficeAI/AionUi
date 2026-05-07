import { describe, expect, it } from 'vitest';
import type { TProviderWithModel } from '@/common/config/storage';
import { buildSpawnConfig } from '@/process/agent/aionrs/envBuilder';

const model = {
  platform: 'custom',
  useModel: 'gpt-4o',
  apiKey: 'test-key',
  baseUrl: 'https://api.example.com/v1',
} as TProviderWithModel;

describe('aionrs envBuilder proxy support', () => {
  it('sets standard proxy environment variables when configured', () => {
    const { env } = buildSpawnConfig(model, {
      workspace: '/tmp/workspace',
      proxy: '  http://user:pass@proxy.example.com:8080  ',
    });

    expect(env.HTTP_PROXY).toBe('http://user:pass@proxy.example.com:8080');
    expect(env.HTTPS_PROXY).toBe('http://user:pass@proxy.example.com:8080');
    expect(env.ALL_PROXY).toBe('http://user:pass@proxy.example.com:8080');
    expect(env.http_proxy).toBe('http://user:pass@proxy.example.com:8080');
    expect(env.https_proxy).toBe('http://user:pass@proxy.example.com:8080');
    expect(env.all_proxy).toBe('http://user:pass@proxy.example.com:8080');
  });

  it('does not set proxy environment variables when empty', () => {
    const { env } = buildSpawnConfig(model, {
      workspace: '/tmp/workspace',
      proxy: '   ',
    });

    expect(env.HTTP_PROXY).toBeUndefined();
    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.ALL_PROXY).toBeUndefined();
  });
});
