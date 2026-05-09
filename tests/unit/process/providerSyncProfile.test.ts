import { describe, expect, it } from 'vitest';
import type { TProviderWithModel } from '@/common/config/storage';
import {
  buildClaudeRuntimeProviderEnv,
  buildProviderSyncProfile,
  resolveHermesApiMode,
  resolveOpenClawApiProtocol,
  resolveOpencodeBaseUrl,
  resolveOpencodeNpmPackage,
} from '@/process/agent/modelSync/providerSyncProfile';

function createProvider(overrides: Partial<TProviderWithModel> = {}): TProviderWithModel {
  return {
    id: 'provider-id',
    name: 'MXOU',
    platform: 'openai',
    enabled: true,
    apiKey: 'sk-test',
    baseUrl: 'https://api.mxou.cn',
    model: ['deepseek-v4-flash'],
    useModel: 'deepseek-v4-flash',
    ...overrides,
  } as TProviderWithModel;
}

describe('providerSyncProfile', () => {
  it('builds Claude runtime env with both auth token fields for anthropic-compatible providers', () => {
    const profile = buildProviderSyncProfile(
      createProvider({
        platform: 'claude',
      })
    );

    expect(profile).not.toBeNull();
    expect(buildClaudeRuntimeProviderEnv(profile!)).toEqual({
      ANTHROPIC_BASE_URL: 'https://api.mxou.cn',
      ANTHROPIC_MODEL: 'deepseek-v4-flash',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-flash',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-flash',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-flash',
      ANTHROPIC_AUTH_TOKEN: 'sk-test',
      ANTHROPIC_API_KEY: 'sk-test',
    });
  });

  it('maps anthropic providers to hermes anthropic_messages mode', () => {
    const profile = buildProviderSyncProfile(createProvider({ platform: 'anthropic' }));
    expect(resolveHermesApiMode(profile!)).toBe('anthropic_messages');
  });

  it('keeps ordinary openai providers on the OpenClaw completions protocol', () => {
    const profile = buildProviderSyncProfile(createProvider({ platform: 'openai' }));
    expect(resolveOpenClawApiProtocol(profile!)).toBe('openai-completions');
  });

  it('uses anthropic takeover for new-api OpenClaw/Hermes but OpenAI-compatible settings for OpenCode', () => {
    const profile = buildProviderSyncProfile(
      createProvider({
        platform: 'new-api',
        modelProtocols: { 'deepseek-v4-flash': 'openai' },
      })
    );

    expect(resolveOpenClawApiProtocol(profile!)).toBe('anthropic-messages');
    expect(resolveHermesApiMode(profile!)).toBe('anthropic_messages');
    expect(resolveOpencodeNpmPackage(profile!)).toBe('@ai-sdk/openai-compatible');
    expect(resolveOpencodeBaseUrl(profile!)).toBe('https://api.mxou.cn/v1');
  });

  it('maps gemini providers to hermes chat_completions mode', () => {
    const profile = buildProviderSyncProfile(createProvider({ platform: 'gemini' }));
    expect(resolveHermesApiMode(profile!)).toBe('chat_completions');
  });
});
