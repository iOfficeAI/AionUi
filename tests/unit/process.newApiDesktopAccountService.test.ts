import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AuthType } from '@office-ai/aioncli-core';
import { afterEach, describe, expect, it } from 'vitest';
import { __TEST__ } from '@process/bridge/services/NewApiDesktopAccountService';
import { sanitizeManagedRuntimeModelValue } from '@/common/types/agent/managedRuntimeCli';

describe('NewApiDesktopAccountService managed runtime config rendering', () => {
  const cleanupTargets = new Set<string>();

  afterEach(() => {
    for (const target of cleanupTargets) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    cleanupTargets.clear();
    delete process.env.OPENCLAW_CONFIG_PATH;
    delete process.env.OPENCODE_CONFIG;
    delete process.env.HOME;
  });

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

  it('filters managed Claude selectable models to anthropic-compatible entries only', () => {
    const provider = {
      id: 'desktop-newapi-managed-provider',
      name: 'POUNDING API',
      platform: 'new-api',
      base_url: 'https://api.mxou.cn',
      api_key: 'secret',
      models: ['MiniMax-M2.7-highspeed', 'claude-sonnet-4-20250514', 'mimo-v2.5'],
      model_protocols: {
        'MiniMax-M2.7-highspeed': 'openai',
        'claude-sonnet-4-20250514': 'anthropic',
        'mimo-v2.5': 'openai',
      },
      model_enabled: {
        'MiniMax-M2.7-highspeed': true,
        'claude-sonnet-4-20250514': true,
        'mimo-v2.5': true,
      },
    } as never;

    expect(__TEST__.getManagedCliSelectableModels(provider, 'claude')).toEqual(['claude-sonnet-4-20250514']);
    expect(__TEST__.getManagedCliSelectableModels(provider, 'opencode')).toEqual([
      'MiniMax-M2.7-highspeed',
      'claude-sonnet-4-20250514',
      'mimo-v2.5',
    ]);
  });

  it('merges recovered runtime snapshot models with existing managed status models', () => {
    expect(
      __TEST__.mergeManagedRuntimeModelSets(
        ['MiniMax-M2.7-highspeed', 'mimo-v2.5'],
        ['mimo-v2.5', 'claude-sonnet-4-20250514']
      )
    ).toEqual(['MiniMax-M2.7-highspeed', 'mimo-v2.5', 'claude-sonnet-4-20250514']);
  });

  it('does not collapse managed runtime status to Claude-compatible models only during self-heal', () => {
    const provider = {
      id: 'desktop-newapi-managed-provider',
      name: 'POUNDING API',
      platform: 'new-api',
      base_url: 'https://api.mxou.cn',
      api_key: 'secret',
      models: ['MiniMax-M2.7-highspeed', 'claude-sonnet-4-20250514', 'mimo-v2.5'],
      model_protocols: {
        'MiniMax-M2.7-highspeed': 'openai',
        'claude-sonnet-4-20250514': 'anthropic',
        'mimo-v2.5': 'openai',
      },
      model_enabled: {
        'MiniMax-M2.7-highspeed': true,
        'claude-sonnet-4-20250514': true,
        'mimo-v2.5': true,
      },
    } as never;

    expect(__TEST__.mergeManagedRuntimeModelSets([], provider.models)).toEqual([
      'MiniMax-M2.7-highspeed',
      'claude-sonnet-4-20250514',
      'mimo-v2.5',
    ]);
    expect(__TEST__.getManagedCliSelectableModels(provider, 'claude')).toEqual(['claude-sonnet-4-20250514']);
  });

  it('sanitizes ANSI-polluted managed runtime model values before syncing prefs', () => {
    expect(
      __TEST__.mergeManagedRuntimeModelSets(
        ['Set model to claude-opus-4-7[1m]', '\u001b[1mclaude-sonnet-4-20250514\u001b[0m'],
        ['claude-opus-4-7', 'mimo-v2.5']
      )
    ).toEqual(['claude-opus-4-7', 'claude-sonnet-4-20250514', 'mimo-v2.5']);
  });

  it('strips set-model prefixes and ansi fragments from managed runtime model strings', () => {
    expect(sanitizeManagedRuntimeModelValue('\u001b[1mclaude-sonnet-4-20250514\u001b[0m')).toBe(
      'claude-sonnet-4-20250514'
    );
    expect(sanitizeManagedRuntimeModelValue('Set model to claude-opus-4-7[1m]')).toBe('claude-opus-4-7');
  });

  it('writes Claude managed config in cc-switch style and recovers from it', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pounding-cc-switch-test-'));
    cleanupTargets.add(tempDir);
    process.env.HOME = tempDir;

    __TEST__.writeClaudeSettingsForProviderSync({
      id: 'desktop-newapi-managed-provider',
      name: 'POUNDING API',
      platform: 'new-api',
      base_url: 'https://api.mxou.cn',
      api_key: 'secret-claude',
      models: ['claude-sonnet-4-20250514'],
      use_model: 'claude-sonnet-4-20250514',
      auth_type: AuthType.USE_ANTHROPIC,
    } as never);

    const ccSettings = __TEST__.readCcSwitchSettings();
    expect(ccSettings.currentProviderClaude).toBe('pounding-new-api-desktop-newapi-managed-provider');

    const claudeSettingsPath = path.join(tempDir, '.claude', 'settings.json');
    expect(fs.existsSync(claudeSettingsPath)).toBe(true);
    const claudeSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
    expect(claudeSettings.model).toBe('default');
    expect(claudeSettings.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-20250514');
    expect(claudeSettings.env?.ANTHROPIC_API_KEY).toBe('secret-claude');

    expect(__TEST__.recoverManagedRuntimeSnapshotFromClaudeSettings()).toEqual({
      token: 'secret-claude',
      baseUrl: 'https://api.mxou.cn',
      models: ['claude-sonnet-4-20250514'],
    });
  });

  it('respects cc-switch claudeConfigDir override when writing and recovering Claude settings', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pounding-cc-switch-override-'));
    cleanupTargets.add(tempDir);
    process.env.HOME = tempDir;

    const ccSwitchDir = path.join(tempDir, '.cc-switch');
    fs.mkdirSync(ccSwitchDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccSwitchDir, 'settings.json'),
      JSON.stringify({ claudeConfigDir: path.join(tempDir, 'custom-claude') }, null, 2) + '\n'
    );

    __TEST__.writeClaudeSettingsForProviderSync({
      id: 'desktop-newapi-managed-provider',
      name: 'POUNDING API',
      platform: 'new-api',
      base_url: 'https://api.mxou.cn',
      api_key: 'secret-claude',
      models: ['claude-sonnet-4-20250514'],
      use_model: 'claude-sonnet-4-20250514',
      auth_type: AuthType.USE_ANTHROPIC,
    } as never);

    const customClaudeSettingsPath = path.join(tempDir, 'custom-claude', 'settings.json');
    expect(fs.existsSync(customClaudeSettingsPath)).toBe(true);
    const customSettings = JSON.parse(fs.readFileSync(customClaudeSettingsPath, 'utf8'));
    expect(customSettings.model).toBe('default');
    expect(customSettings.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-20250514');

    expect(__TEST__.recoverManagedRuntimeSnapshotFromClaudeSettings()).toEqual({
      token: 'secret-claude',
      baseUrl: 'https://api.mxou.cn',
      models: ['claude-sonnet-4-20250514'],
    });
  });

  it('clears managed cc-switch provider state without throwing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pounding-cc-switch-clear-'));
    cleanupTargets.add(tempDir);
    process.env.HOME = tempDir;

    __TEST__.writeClaudeSettingsForProviderSync({
      id: 'desktop-newapi-managed-provider',
      name: 'POUNDING API',
      platform: 'new-api',
      base_url: 'https://api.mxou.cn',
      api_key: 'secret-claude',
      models: ['claude-sonnet-4-20250514'],
      use_model: 'claude-sonnet-4-20250514',
      auth_type: AuthType.USE_ANTHROPIC,
    } as never);

    __TEST__.clearClaudeSettingsForProviderSync();

    expect(__TEST__.readCcSwitchSettings().currentProviderClaude).toBeUndefined();
    expect(__TEST__.recoverManagedRuntimeSnapshotFromClaudeSettings()).toBeUndefined();
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

  it('recovers managed runtime snapshot from openclaw config', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pounding-openclaw-test-'));
    cleanupTargets.add(tempDir);
    const configPath = path.join(tempDir, 'openclaw.json');
    process.env.OPENCLAW_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          models: {
            providers: {
              'pounding-api-desktop-newapi-managed-provider': {
                baseUrl: 'https://api.mxou.cn/v1',
                apiKey: 'secret-openclaw',
                models: [{ id: 'mimo-v2.5', name: 'mimo-v2.5' }],
              },
            },
          },
        },
        null,
        2
      )
    );

    expect(__TEST__.recoverManagedRuntimeSnapshotFromConfigs()).toEqual({
      token: 'secret-openclaw',
      baseUrl: 'https://api.mxou.cn/v1',
      models: ['mimo-v2.5'],
      managedProviderId: 'pounding-api-desktop-newapi-managed-provider',
    });
  });

  it('deletes openclaw config entirely when only managed runtime state remains', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pounding-openclaw-cleanup-'));
    cleanupTargets.add(tempDir);
    const configPath = path.join(tempDir, 'openclaw.json');
    process.env.OPENCLAW_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          models: {
            providers: {
              'pounding-api-desktop-newapi-managed-provider': {
                baseUrl: 'https://api.mxou.cn/v1',
                apiKey: 'secret-openclaw',
                models: [{ id: 'mimo-v2.5', name: 'mimo-v2.5' }],
              },
            },
          },
          agents: {
            defaults: {
              model: {
                primary: 'pounding-api-desktop-newapi-managed-provider/mimo-v2.5',
              },
              models: {
                'pounding-api-desktop-newapi-managed-provider/mimo-v2.5': {
                  alias: 'mimo-v2.5',
                },
              },
            },
          },
        },
        null,
        2
      )
    );

    __TEST__.clearOpenClawManagedProviderModel('pounding-api-desktop-newapi-managed-provider');

    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('marks incomplete managed runtime status for self-heal', () => {
    expect(
      __TEST__.shouldSelfHealManagedRuntimeStatus({
        loggedIn: false,
        baseUrl: 'https://api.mxou.cn',
        models: ['mimo-v2.5'],
        updatedAt: 1,
        managedProviderId: 'desktop-newapi-managed-provider',
      })
    ).toBe(true);

    expect(
      __TEST__.shouldSelfHealManagedRuntimeStatus({
        loggedIn: true,
        baseUrl: 'https://api.mxou.cn',
        models: [],
        updatedAt: 1,
        managedProviderId: 'desktop-newapi-managed-provider',
      })
    ).toBe(true);

    expect(
      __TEST__.shouldSelfHealManagedRuntimeStatus({
        loggedIn: true,
        baseUrl: 'https://api.mxou.cn',
        models: ['mimo-v2.5'],
        updatedAt: 1,
      })
    ).toBe(true);

    expect(
      __TEST__.shouldSelfHealManagedRuntimeStatus({
        loggedIn: true,
        baseUrl: 'https://api.mxou.cn',
        models: ['mimo-v2.5'],
        updatedAt: 1,
        managedProviderId: 'desktop-newapi-managed-provider',
      })
    ).toBe(false);
  });

  it('persists recovered managed runtime status', () => {
    expect(
      __TEST__.shouldSelfHealManagedRuntimeStatus({
        loggedIn: true,
        baseUrl: 'https://api.mxou.cn',
        models: ['mimo-v2.5'],
        updatedAt: 1,
      })
    ).toBe(true);
  });
});
