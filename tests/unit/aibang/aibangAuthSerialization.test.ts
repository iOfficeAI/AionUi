import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findBuiltinCodexAgent,
  getCodexHome,
  mergeCodexEnvOverrides,
  normalizeMiddlewareUrl,
  removeCodexEnvOverrides,
  serializeCodexConfig,
} from '@/process/services/aibangAuthSerialization';

describe('AIbang auth serialization', () => {
  it('builds an isolated Codex TOML configuration', () => {
    expect(
      serializeCodexConfig({
        middlewareUrl: 'http://127.0.0.1:8787/',
        publicModel: 'gpt-5.6-sol',
        codexHome: '/user-data/aibang/runtime/codex-home',
      })
    ).toBe(`model_provider = "aibang"
model = "gpt-5.6-sol"

[model_providers.aibang]
name = "AIbang"
base_url = "http://127.0.0.1:8787/v1"
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

  it('merges managed environment entries without losing unrelated overrides', () => {
    const merged = mergeCodexEnvOverrides(
      [
        { name: 'HTTPS_PROXY', value: 'http://proxy.test' },
        { name: 'OPENAI_API_KEY', value: 'old' },
      ],
      'jwt'
    );
    expect(merged).toEqual([
      { name: 'HTTPS_PROXY', value: 'http://proxy.test' },
      { name: 'OPENAI_API_KEY', value: 'jwt' },
      { name: 'CODEX_API_KEY', value: 'jwt' },
    ]);
    expect(removeCodexEnvOverrides(merged)).toEqual([{ name: 'HTTPS_PROXY', value: 'http://proxy.test' }]);
  });

  it('builds an isolated Codex home under AIbang user data', () => {
    expect(getCodexHome('/user-data')).toBe(path.join('/user-data', 'aibang', 'runtime', 'codex-home'));
  });

  it('normalizes configured middleware URLs', () => {
    expect(normalizeMiddlewareUrl('http://127.0.0.1:8787///')).toBe('http://127.0.0.1:8787');
    expect(normalizeMiddlewareUrl(undefined)).toBe('http://127.0.0.1:8787');
  });
});
