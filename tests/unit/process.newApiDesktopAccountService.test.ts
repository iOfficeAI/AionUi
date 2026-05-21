import { describe, expect, it } from 'vitest';
import { __TEST__ } from '@process/bridge/services/NewApiDesktopAccountService';

describe('NewApiDesktopAccountService managed runtime config rendering', () => {

  it('maps managed-runtime account payload into local account status shape', () => {
    const mapped = __TEST__.fromManagedRuntimeAccountStatus({
      logged_in: true,
      base_url: 'https://api.mxou.cn',
      models: ['mimo-v2.5'],
      updated_at: 123,
      user: {
        id: 2,
        username: 'halo',
        display_name: 'Halo',
        email: 'halo@example.com',
        quota: 10,
        used_quota: 3,
        avatar_letter: 'H',
      },
      managed_provider_id: 'desktop-newapi-managed-provider',
    });

    expect(mapped).toEqual({
      loggedIn: true,
      baseUrl: 'https://api.mxou.cn',
      models: ['mimo-v2.5'],
      updatedAt: 123,
      user: {
        id: '2',
        username: 'halo',
        displayName: 'Halo',
        email: 'halo@example.com',
        quota: 10,
        usedQuota: 3,
        avatarLetter: 'H',
      },
      managedProviderId: 'desktop-newapi-managed-provider',
    });
  });

  it('maps local account status into managed-runtime backend payload shape', () => {
    const payload = __TEST__.toBackendManagedRuntimeAccount({
      loggedIn: true,
      baseUrl: 'https://api.mxou.cn',
      models: ['mimo-v2.5'],
      updatedAt: 123,
      user: {
        id: '2',
        username: 'halo',
        displayName: 'Halo',
        email: 'halo@example.com',
        quota: 10,
        usedQuota: 3,
        avatarLetter: 'H',
      },
      token: 'secret-token',
      cookies: ['a=1'],
      managedProviderId: 'desktop-newapi-managed-provider',
    });

    expect(payload).toEqual({
      logged_in: true,
      base_url: 'https://api.mxou.cn',
      models: ['mimo-v2.5'],
      updated_at: 123,
      user: {
        id: '2',
        username: 'halo',
        display_name: 'Halo',
        email: 'halo@example.com',
        quota: 10,
        used_quota: 3,
        avatar_letter: 'H',
      },
      managed_provider_id: 'desktop-newapi-managed-provider',
    });
  });
  it('persists only non-sensitive account status fields to backend settings', () => {
    const persisted = __TEST__.toPersistedAccountStatus({
      loggedIn: true,
      baseUrl: 'https://api.mxou.cn',
      models: ['mimo-v2.5'],
      updatedAt: 123,
      user: {
        username: 'halo',
        displayName: 'Halo',
      },
      token: 'secret-token',
      cookies: ['a=1'],
      managedProviderId: 'desktop-newapi-managed-provider',
    });

    expect(persisted).toEqual({
      loggedIn: true,
      baseUrl: 'https://api.mxou.cn',
      models: ['mimo-v2.5'],
      updatedAt: 123,
      user: {
        username: 'halo',
        displayName: 'Halo',
      },
      managedProviderId: 'desktop-newapi-managed-provider',
    });
  });

  it('merges persisted account status with local sensitive fields', () => {
    const merged = __TEST__.mergeAccountStatus(
      {
        loggedIn: true,
        baseUrl: 'https://api.mxou.cn',
        models: ['mimo-v2.5'],
        updatedAt: 123,
        user: {
          username: 'halo',
        },
        managedProviderId: 'desktop-newapi-managed-provider',
      },
      {
        loggedIn: false,
        baseUrl: 'https://stale.example.com',
        models: [],
        updatedAt: 1,
        token: 'secret-token',
        cookies: ['a=1'],
      }
    );

    expect(merged).toEqual({
      loggedIn: true,
      baseUrl: 'https://api.mxou.cn',
      models: ['mimo-v2.5'],
      updatedAt: 123,
      user: {
        username: 'halo',
      },
      managedProviderId: 'desktop-newapi-managed-provider',
      token: 'secret-token',
      cookies: ['a=1'],
    });
  });

  it('uses chat_completions for Hermes when provider protocol is openai', () => {
    const profile = __TEST__.buildProviderSyncProfile({
      id: 'desktop-newapi-managed-provider',
      name: 'POUNDING API',
      platform: 'new-api',
      base_url: 'https://api.mxou.cn',
      api_key: 'secret',
      models: ['mimo-v2.5'],
      use_model: 'mimo-v2.5',
      auth_type: undefined,
    } as never);

    expect(profile).not.toBeNull();
    expect(__TEST__.resolveHermesApiMode(profile!)).toBe('chat_completions');
  });

  it('keeps anthropic_messages for Hermes when provider protocol is anthropic', () => {
    const profile = {
      protocol: 'anthropic',
      provider: {
        api_key: 'secret',
      },
      normalizedBaseUrl: 'https://api.anthropic.com',
      normalizedModelId: 'claude-3-5-sonnet',
      managedProviderId: 'pounding-api-desktop-newapi-managed-provider',
    } as never;

    expect(__TEST__.resolveHermesApiMode(profile)).toBe('anthropic_messages');
  });

  it('renders Hermes config with chat_completions for openai-compatible providers', () => {
    const profile = {
      protocol: 'openai',
      provider: {
        api_key: 'secret',
      },
      normalizedBaseUrl: 'https://api.mxou.cn',
      normalizedModelId: 'mimo-v2.5',
      managedProviderId: 'pounding-api-desktop-newapi-managed-provider',
    } as never;

    const rendered = __TEST__.renderHermesManagedConfig(profile);
    expect(rendered).toContain('api_mode: "chat_completions"');
    expect(rendered).not.toContain('anthropic_messages');
  });

  it('keeps OpenClaw on openai-completions and appends /v1 to openai base url', () => {
    const profile = {
      protocol: 'openai',
      provider: {
        api_key: 'secret',
      },
      normalizedBaseUrl: 'https://api.mxou.cn',
      normalizedModelId: 'mimo-v2.5',
      managedProviderId: 'pounding-api-desktop-newapi-managed-provider',
    } as never;

    expect(__TEST__.resolveOpenClawApiProtocol(profile)).toBe('openai-completions');
    expect(__TEST__.resolveOpenClawBaseUrl(profile)).toBe('https://api.mxou.cn/v1');
  });

  it('renders opencode managed config for the currently selected model only', () => {
    const config = __TEST__.buildManagedOpencodeConfig(
      {
        protocol: 'openai',
        provider: {
          id: 'desktop-newapi-managed-provider',
          name: 'POUNDING API',
          api_key: 'secret',
        },
        normalizedBaseUrl: 'https://api.mxou.cn',
        normalizedModelId: 'mimo-v2.5',
        managedProviderId: 'pounding-api-desktop-newapi-managed-provider',
      } as never,
      {}
    );

    expect(config.model).toBe('pounding-api-desktop-newapi-managed-provider/mimo-v2.5');
    expect(config.provider?.['pounding-api-desktop-newapi-managed-provider']?.models).toEqual({
      'mimo-v2.5': { name: 'mimo-v2.5' },
    });
  });

  it('renders openclaw managed config for the currently selected model only', () => {
    const config = __TEST__.buildManagedOpenClawConfig(
      {
        protocol: 'openai',
        provider: {
          id: 'desktop-newapi-managed-provider',
          name: 'POUNDING API',
          api_key: 'secret',
        },
        normalizedBaseUrl: 'https://api.mxou.cn',
        normalizedModelId: 'mimo-v2.5',
        managedProviderId: 'pounding-api-desktop-newapi-managed-provider',
      } as never,
      {}
    );

    expect(
      (config.models as { providers?: Record<string, { models?: Array<{ id: string; name: string }> }> })?.providers?.[
        'pounding-api-desktop-newapi-managed-provider'
      ]?.models
    ).toEqual([{ id: 'mimo-v2.5', name: 'mimo-v2.5' }]);
    expect((config.agents as { defaults?: { model?: { primary?: string } } })?.defaults?.model?.primary).toBe(
      'pounding-api-desktop-newapi-managed-provider/mimo-v2.5'
    );
  });

  it('removes legacy managed openclaw aliases when rewriting current selection', () => {
    const config = __TEST__.buildManagedOpenClawConfig(
      {
        protocol: 'openai',
        provider: {
          id: 'desktop-newapi-managed-provider',
          name: 'POUNDING API',
          api_key: 'secret',
        },
        normalizedBaseUrl: 'https://api.mxou.cn',
        normalizedModelId: 'mimo-v2.5',
        managedProviderId: 'pounding-api-desktop-newapi-managed-provider',
      } as never,
      {
        agents: {
          defaults: {
            models: {
              'aionui-new-api-desktop-newapi-managed-provider/MiniMax-M2.7-highspeed': {
                alias: 'MiniMax-M2.7-highspeed',
              },
              'pounding-api-desktop-newapi-managed-provider/deepseek-v4-pro': {
                alias: 'deepseek-v4-pro',
              },
            },
          },
        },
      }
    );

    expect((config.agents as { defaults?: { models?: Record<string, { alias: string }> } })?.defaults?.models).toEqual({
      'pounding-api-desktop-newapi-managed-provider/mimo-v2.5': {
        alias: 'mimo-v2.5',
      },
    });
  });
});
