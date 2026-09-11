import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildBundledCodexPath,
  buildScopedApiTokenRequest,
  findBuiltinCodexAgent,
  getCodexHome,
  normalizeNewApiUrl,
  removeCodexEnvOverrides,
  resolveScopedApiTokenExpiresAt,
  serializeCodexConfig,
} from '@/process/services/aibangAuthSerialization';

describe('AIbang auth serialization', () => {
  it('builds an isolated Codex TOML configuration', () => {
    expect(
      serializeCodexConfig({
        newApiUrl: 'http://127.0.0.1:5000/',
        publicModel: 'gpt-5.6-sol',
        codexHome: '/user-data/aibang/runtime/codex-home',
      })
    ).toBe(`model_provider = "aibang"
model = "gpt-5.6-sol"

[model_providers.aibang]
name = "AIbang"
base_url = "http://127.0.0.1:5000/v1"
wire_api = "responses"
requires_openai_auth = true
`);
  });

  it('selects only the built-in ACP Codex agent', () => {
    const selected = findBuiltinCodexAgent([
      { id: 'system', backend: 'codex', agent_type: 'acp', agent_source: 'internal' },
      { id: 'custom', backend: 'codex', agent_type: 'acp', agent_source: 'custom' },
      { id: 'builtin', backend: 'codex', agent_type: 'acp', agent_source: 'builtin' },
    ]);
    expect(selected?.id).toBe('builtin');
  });

  it('removes managed environment entries without losing unrelated overrides', () => {
    expect(
      removeCodexEnvOverrides([
        { name: 'HTTPS_PROXY', value: 'http://proxy.test' },
        { name: 'CODEX_HOME', value: '/managed/home' },
        { name: 'OPENAI_API_KEY', value: 'jwt' },
        { name: 'CODEX_API_KEY', value: 'jwt' },
      ])
    ).toEqual([{ name: 'HTTPS_PROXY', value: 'http://proxy.test' }]);
  });

  it('builds an isolated Codex home under AIbang user data', () => {
    expect(getCodexHome('/user-data')).toBe(path.join('/user-data', 'aibang', 'runtime', 'codex-home'));
  });

  it('builds the platform-specific bundled Codex executable path', () => {
    expect(buildBundledCodexPath('/resources', 'darwin', 'arm64')).toBe(
      path.join(
        '/resources',
        'bundled-aioncore',
        'darwin-arm64',
        'managed-resources/cli/codex/0.149.1/darwin-arm64/vendor/aarch64-apple-darwin/bin/codex'
      )
    );
  });

  it('normalizes configured new-api URLs', () => {
    expect(normalizeNewApiUrl('http://127.0.0.1:5000///')).toBe('http://127.0.0.1:5000');
    expect(normalizeNewApiUrl(undefined)).toBe('http://127.0.0.1:5000');
  });

  it('uses the shorter of the dashboard session and API token lifetime', () => {
    expect(resolveScopedApiTokenExpiresAt(1_000, 100_000, 10)).toBe(100_000);
    expect(resolveScopedApiTokenExpiresAt(1_000, 1_000_000, 10)).toBe(601_000);
  });

  it('builds a short-lived, model-scoped, quota-limited token request', () => {
    expect(
      buildScopedApiTokenRequest({
        name: 'AIbang Desktop session',
        model: 'gpt-5.6-sol',
        expiresAt: 1_761_000_000_000,
        quota: 500_000,
      })
    ).toEqual({
      name: 'AIbang Desktop session',
      expired_time: 1_761_000_000,
      remain_quota: 500_000,
      unlimited_quota: false,
      model_limits_enabled: true,
      model_limits: 'gpt-5.6-sol',
      group: '',
    });
  });

  it('rejects model lists for scoped API token requests', () => {
    expect(() =>
      buildScopedApiTokenRequest({
        name: 'AIbang Desktop session',
        model: 'gpt-5.6-sol,gpt-5.6-terra',
        expiresAt: 1_761_000_000_000,
        quota: 500_000,
      })
    ).toThrow(/single model identifier/);
  });
});
