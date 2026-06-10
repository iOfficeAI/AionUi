/**
 * Resolve the AionCore base URL + bearer token from plugin options and env.
 *
 * Precedence: explicit options > environment variables. When neither is set
 * the plugin loads in no-op mode: it still registers all hooks (so it can
 * never crash the host) but every forwarding call short-circuits.
 */

import type { PluginOptions } from '@opencode-ai/plugin';
import { PLUGIN_VERSION } from './types.js';

export type ResolvedConfig = {
  /** Stripped of any trailing slash. */
  url: string;
  token: string;
};

export type PluginMode = { kind: 'enabled'; config: ResolvedConfig } | { kind: 'disabled'; reason: string };

const stripTrailingSlash = (raw: string): string => raw.replace(/\/+$/, '');

const pickString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Resolve a single field (url or token) from options, then env.
 * Returns `undefined` if neither source yields a non-empty string.
 */
const resolveField = (
  optionsValue: unknown,
  envValue: string | undefined,
  key: 'url' | 'token'
): string | undefined => {
  const fromOptions = pickString(optionsValue);
  if (fromOptions) return fromOptions;
  const fromEnv = pickString(envValue);
  if (fromEnv) return fromEnv;
  return undefined;
};

const envUrl = (): string | undefined => resolveField(undefined, process.env['AIONCORE_URL'], 'url');
const envToken = (): string | undefined => resolveField(undefined, process.env['AIONCORE_TOKEN'], 'token');

/**
 * Resolve the plugin mode from the OpenCode `PluginOptions` bag plus the
 * process environment. The function is pure: it does not log, mutate
 * state, or perform I/O. Callers decide what to do with the result.
 */
export const resolveConfig = (options: PluginOptions | undefined, env: NodeJS.ProcessEnv = process.env): PluginMode => {
  const opts = (options ?? {}) as Record<string, unknown>;
  const urlRaw = resolveField(opts['url'], env['AIONCORE_URL'], 'url');
  const tokenRaw = resolveField(opts['token'], env['AIONCORE_TOKEN'], 'token');

  if (!urlRaw && !tokenRaw) {
    return {
      kind: 'disabled',
      reason: 'AionCore URL and token are not set; chisl-opencode-plugin loaded in no-op mode.',
    };
  }
  if (!urlRaw) {
    return {
      kind: 'disabled',
      reason: 'AionCore URL is missing (set AIONCORE_URL or pass `url` in plugin options).',
    };
  }
  if (!tokenRaw) {
    return {
      kind: 'disabled',
      reason: 'AionCore token is missing (set AIONCORE_TOKEN or pass `token` in plugin options).',
    };
  }

  return {
    kind: 'enabled',
    config: {
      url: stripTrailingSlash(urlRaw),
      token: tokenRaw,
    },
  };
};

/**
 * Build the `HelloRequest` body sent to AionCore on connect / reconnect.
 * Exported so tests can verify the exact payload shape.
 */
export const buildHelloBody = (input: {
  opencodeVersion: string | undefined;
  hooks: string[];
  project: { directory: string; worktree: string };
}): import('./types.js').HelloRequest => {
  const body: import('./types.js').HelloRequest = {
    protocolVersion: 1,
    pluginVersion: PLUGIN_VERSION,
    hooks: input.hooks,
    project: input.project,
  };
  if (input.opencodeVersion) body.opencodeVersion = input.opencodeVersion;
  return body;
};

export { envUrl, envToken };
