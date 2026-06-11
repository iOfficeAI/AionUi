/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Redact-on-read CLI introspection — presence-only projection of the agnostic
 * agent + MCP config read.
 *
 * WHY (Company.OS WO 2026-06-10-wo-agnostic-runtime-assignment §0, §5
 * guardrail 1, §6): `getAvailableAgents` / `getAgentMcpConfigs` return the raw
 * env vars, headers and tokens each installed CLI is wired to — and live
 * plaintext Honcho Bearer tokens really do sit in `~/.codex/config.toml`. The
 * agnostic-read feature would AMPLIFY that leak if it pulled those values into
 * UI state, reports, or persistence. This module is the redaction boundary: it
 * takes the RAW shapes and returns presence-only projections where every
 * secret-bearing value is mapped to `{ present, plaintext_secret_detected? }`
 * — the value itself is NEVER copied into the output.
 *
 * These are PURE functions: no IPC, no fs, no electron. They map data only, so
 * they are trivially unit-testable and safe to call from either process.
 */

import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import type { IMcpServer } from '@/common/config/storage';

// ---------------------------------------------------------------------------
// Presence-only output shapes
// ---------------------------------------------------------------------------

/**
 * Presence-only projection of a single secret-bearing value (an env var value
 * or a header value). The raw value is intentionally absent.
 *
 * - `present`: the key existed with a non-empty value.
 * - `is_env_ref`: the value is a `${VAR}` / `$VAR` indirection (a reference to
 *   an environment variable), i.e. NOT an inline literal secret.
 * - `plaintext_secret_detected`: an inline, token-shaped literal was found
 *   (the leak we want the UI to surface as a red remediation chip).
 */
export interface RedactedValuePresence {
  present: boolean;
  is_env_ref?: boolean;
  plaintext_secret_detected?: boolean;
}

/** Presence-only projection of one MCP server's secret-bearing surface. */
export interface RedactedMcpServer {
  id: string;
  name: string;
  transport_type: string;
  /** Presence map keyed by env var NAME (never its value). */
  env: Record<string, RedactedValuePresence>;
  /** Presence map keyed by header NAME (never its value). */
  headers: Record<string, RedactedValuePresence>;
  /** True iff ANY env/header value is an inline plaintext token. */
  has_plaintext_secret: boolean;
}

/** Presence-only projection of one detected agent/CLI. */
export interface RedactedAgentIntrospection {
  id: string;
  name: string;
  backend?: string;
  available: boolean;
  /** Presence map keyed by env var NAME (never its value). */
  env: Record<string, RedactedValuePresence>;
  /** True iff ANY env value on the agent is an inline plaintext token. */
  has_plaintext_secret: boolean;
}

/** Presence-only projection of one `getAgentMcpConfigs` source group. */
export interface RedactedAgentMcpConfig {
  source: string;
  servers: RedactedMcpServer[];
  /** True iff ANY server in this source carries an inline plaintext token. */
  has_plaintext_secret: boolean;
}

/**
 * RAW input shape of one `getAgentMcpConfigs` result group, mirroring
 * `ipcBridge.mcpService.getAgentMcpConfigs`. Servers are `IMcpServer` plus the
 * importable annotations the agnostic read adds.
 */
export interface RawAgentMcpConfig {
  source: string;
  servers: Array<IMcpServer & { importable?: boolean; import_skip_reason?: string }>;
}

// ---------------------------------------------------------------------------
// Token-shape detection
// ---------------------------------------------------------------------------

/**
 * A value that indirects to an environment variable rather than embedding a
 * literal. Matches `${VAR}`, `$VAR`, and `%VAR%`. Such a value is a reference,
 * never an inline secret.
 */
const ENV_REF_PATTERN = /^\s*(\$\{[A-Z0-9_]+\}|\$[A-Z0-9_]+|%[A-Z0-9_]+%)\s*$/i;

/**
 * Known secret prefixes. Anything carrying one of these is treated as an inline
 * literal secret regardless of length.
 */
const SECRET_PREFIX_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/, // OpenAI / Anthropic-style secret keys
  /\bghp_[A-Za-z0-9]{20,}/, // GitHub personal access token
  /\bgho_[A-Za-z0-9]{20,}/, // GitHub OAuth token
  /\bxox[baprs]-[A-Za-z0-9-]{8,}/, // Slack tokens (xoxb-/xoxp-/xoxa-/xoxr-/xoxs-)
  /\bBearer\s+[A-Za-z0-9._-]{12,}/i, // inline Bearer authorization header value
  /\bAIza[A-Za-z0-9_-]{20,}/, // Google API key
];

/** A long, opaque, high-entropy-ish string with no whitespace looks like a token. */
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9._\-+/=]{32,}$/;

/**
 * True iff `value` looks like an INLINE plaintext secret. A `${VAR}`-style
 * environment reference is explicitly NOT a secret (it is the safe form).
 *
 * Pure and value-shape-based: it inspects the shape, never logs or stores it.
 */
export function detectPlaintextSecret(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  // An environment-variable reference is the SAFE form, never a leak.
  if (isEnvRef(trimmed)) {
    return false;
  }
  for (const pattern of SECRET_PREFIX_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  // Long opaque single-token strings (no spaces) read as a secret.
  if (!/\s/.test(trimmed) && OPAQUE_TOKEN_PATTERN.test(trimmed)) {
    return true;
  }
  return false;
}

/** True iff `value` is a `${VAR}` / `$VAR` / `%VAR%` environment reference. */
export function isEnvRef(value: string): boolean {
  return typeof value === 'string' && ENV_REF_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Redaction projections
// ---------------------------------------------------------------------------

/**
 * Project a single value into its presence-only descriptor. The raw value is
 * never returned — only flags derived from its shape.
 */
function redactValue(value: unknown): RedactedValuePresence {
  if (typeof value !== 'string' || value.length === 0) {
    return { present: false };
  }
  const envRef = isEnvRef(value);
  const presence: RedactedValuePresence = { present: true };
  if (envRef) {
    presence.is_env_ref = true;
  } else if (detectPlaintextSecret(value)) {
    presence.plaintext_secret_detected = true;
  }
  return presence;
}

/** Project a `Record<string, string>` (env or headers) into a presence map. */
function redactRecord(record: Record<string, string> | undefined): {
  map: Record<string, RedactedValuePresence>;
  hasPlaintextSecret: boolean;
} {
  const map: Record<string, RedactedValuePresence> = {};
  let hasPlaintextSecret = false;
  if (record && typeof record === 'object') {
    for (const key of Object.keys(record)) {
      const presence = redactValue(record[key]);
      map[key] = presence;
      if (presence.plaintext_secret_detected) {
        hasPlaintextSecret = true;
      }
    }
  }
  return { map, hasPlaintextSecret };
}

/**
 * Redact one MCP server (`IMcpServer`) to presence-only. Reads only the env and
 * headers off its transport — the secret-bearing surfaces — and never copies a
 * value into the output.
 */
export function redactMcpServerConfig(server: IMcpServer): RedactedMcpServer {
  const transport = server.transport ?? ({ type: 'unknown' } as { type: string });
  const transportType = typeof transport.type === 'string' ? transport.type : 'unknown';

  const envSource = (transport as { env?: Record<string, string> }).env;
  const headerSource = (transport as { headers?: Record<string, string> }).headers;

  const envResult = redactRecord(envSource);
  const headerResult = redactRecord(headerSource);

  return {
    id: server.id,
    name: server.name,
    transport_type: transportType,
    env: envResult.map,
    headers: headerResult.map,
    has_plaintext_secret: envResult.hasPlaintextSecret || headerResult.hasPlaintextSecret,
  };
}

/**
 * Redact one detected agent (`AgentMetadata`) to presence-only. Reads only the
 * agent's `env` entries; everything else on the agent is non-secret metadata
 * the caller can pass through directly.
 */
export function redactAgentMetadata(agent: AgentMetadata): RedactedAgentIntrospection {
  const map: Record<string, RedactedValuePresence> = {};
  let hasPlaintextSecret = false;
  if (Array.isArray(agent.env)) {
    for (const entry of agent.env) {
      if (!entry || typeof entry.name !== 'string') {
        continue;
      }
      const presence = redactValue(entry.value);
      map[entry.name] = presence;
      if (presence.plaintext_secret_detected) {
        hasPlaintextSecret = true;
      }
    }
  }
  return {
    id: agent.id,
    name: agent.name,
    backend: agent.backend,
    available: agent.available === true,
    env: map,
    has_plaintext_secret: hasPlaintextSecret,
  };
}

/**
 * Redact one `getAgentMcpConfigs` source group to presence-only, redacting each
 * server it carries.
 */
export function redactAgentMcpConfig(config: RawAgentMcpConfig): RedactedAgentMcpConfig {
  const servers = Array.isArray(config.servers) ? config.servers.map((s) => redactMcpServerConfig(s)) : [];
  return {
    source: config.source,
    servers,
    has_plaintext_secret: servers.some((s) => s.has_plaintext_secret),
  };
}

/** Redact a full `getAgentMcpConfigs` array (multiple source groups). */
export function redactAgentMcpConfigs(configs: RawAgentMcpConfig[]): RedactedAgentMcpConfig[] {
  return Array.isArray(configs) ? configs.map((c) => redactAgentMcpConfig(c)) : [];
}

/** Redact a full `getAvailableAgents` array. */
export function redactAgentMetadataList(agents: AgentMetadata[]): RedactedAgentIntrospection[] {
  return Array.isArray(agents) ? agents.map((a) => redactAgentMetadata(a)) : [];
}
