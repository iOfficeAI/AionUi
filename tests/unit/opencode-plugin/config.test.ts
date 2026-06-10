/**
 * Tests for `resolveConfig`: option precedence over env, missing
 * config -> disabled mode.
 */
import { describe, it, expect } from 'vitest';
import { resolveConfig, buildHelloBody } from '../../../packages/opencode-plugin/src/config.js';
import { PLUGIN_VERSION } from '../../../packages/opencode-plugin/src/types.js';

const emptyEnv = (): NodeJS.ProcessEnv => ({});

describe('resolveConfig', () => {
  it('returns enabled mode when both url and token are passed via options', () => {
    const mode = resolveConfig({ url: 'https://a.example.com/', token: 'tok_1' }, emptyEnv());
    expect(mode.kind).toBe('enabled');
    if (mode.kind === 'enabled') {
      expect(mode.config.url).toBe('https://a.example.com'); // trailing slash stripped
      expect(mode.config.token).toBe('tok_1');
    }
  });

  it('options take precedence over env vars', () => {
    const env: NodeJS.ProcessEnv = { AIONCORE_URL: 'https://env.example.com', AIONCORE_TOKEN: 'env_tok' };
    const mode = resolveConfig({ url: 'https://opt.example.com', token: 'opt_tok' }, env);
    expect(mode.kind).toBe('enabled');
    if (mode.kind === 'enabled') {
      expect(mode.config.url).toBe('https://opt.example.com');
      expect(mode.config.token).toBe('opt_tok');
    }
  });

  it('falls back to env vars when options are absent', () => {
    const env: NodeJS.ProcessEnv = { AIONCORE_URL: 'https://env.example.com', AIONCORE_TOKEN: 'env_tok' };
    const mode = resolveConfig(undefined, env);
    expect(mode.kind).toBe('enabled');
    if (mode.kind === 'enabled') {
      expect(mode.config.url).toBe('https://env.example.com');
      expect(mode.config.token).toBe('env_tok');
    }
  });

  it('strips trailing slashes from the url', () => {
    const mode = resolveConfig({ url: 'https://a.example.com///', token: 'tok' }, emptyEnv());
    expect(mode.kind).toBe('enabled');
    if (mode.kind === 'enabled') expect(mode.config.url).toBe('https://a.example.com');
  });

  it('returns disabled mode when both url and token are missing', () => {
    const mode = resolveConfig(undefined, emptyEnv());
    expect(mode.kind).toBe('disabled');
  });

  it('returns disabled mode when only the token is present', () => {
    const mode = resolveConfig({ token: 'tok' }, emptyEnv());
    expect(mode.kind).toBe('disabled');
  });

  it('returns disabled mode when only the url is present', () => {
    const mode = resolveConfig({ url: 'https://a.example.com' }, emptyEnv());
    expect(mode.kind).toBe('disabled');
  });

  it('ignores empty / whitespace strings from options and env', () => {
    const env: NodeJS.ProcessEnv = { AIONCORE_URL: '  ', AIONCORE_TOKEN: '' };
    const mode = resolveConfig({ url: '', token: '   ' }, env);
    expect(mode.kind).toBe('disabled');
  });

  it('ignores non-string option values', () => {
    const mode = resolveConfig({ url: 42, token: null }, emptyEnv());
    expect(mode.kind).toBe('disabled');
  });
});

describe('buildHelloBody', () => {
  it('emits protocol version 1, plugin version, declared hooks and project info', () => {
    const body = buildHelloBody({
      opencodeVersion: '1.2.3',
      hooks: ['event', 'tool.execute.before'],
      project: { directory: '/proj', worktree: '/wt' },
    });
    expect(body.protocolVersion).toBe(1);
    expect(body.pluginVersion).toBe(PLUGIN_VERSION);
    expect(body.opencodeVersion).toBe('1.2.3');
    expect(body.hooks).toEqual(['event', 'tool.execute.before']);
    expect(body.project).toEqual({ directory: '/proj', worktree: '/wt' });
  });

  it('omits opencodeVersion when undefined', () => {
    const body = buildHelloBody({
      opencodeVersion: undefined,
      hooks: [],
      project: { directory: '/p', worktree: '/w' },
    });
    expect(body).not.toHaveProperty('opencodeVersion');
  });
});
