/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stable, classified error codes AionCore embeds at the START of remote-agent
 * connection-failure messages in the form `[code:<x>]`. The renderer parses
 * the marker so users see a localized, actionable error instead of the raw
 * upstream string.
 */
export type ConnectErrorCode =
  | 'dns_failure'
  | 'tls_failure'
  | 'auth_failure'
  | 'not_opencode'
  | 'connection_refused'
  | 'timeout'
  | 'server_error'
  | 'workspace_not_on_server'
  | 'unreachable';

/** All known connect-error codes (exposed for tests and consumers). */
export const CONNECT_ERROR_CODES = [
  'dns_failure',
  'tls_failure',
  'auth_failure',
  'not_opencode',
  'connection_refused',
  'timeout',
  'server_error',
  'workspace_not_on_server',
  'unreachable',
] as const satisfies readonly ConnectErrorCode[];

/** Regex used to detect a `[code:<x>]` marker at the start of an error string. */
const CODE_MARKER_RE = /^\s*\[code:([a-z_]+)\]/;

/** Codes we accept from the wire (kept as a Set for O(1) validation). */
const CODES: ReadonlySet<string> = new Set<string>(CONNECT_ERROR_CODES);

/**
 * Parse the stable `[code:<x>]` marker AionCore embeds at the start of
 * connect-failure messages. When no marker is present we fall back to a
 * handful of text heuristics so older cores (which don't emit the marker)
 * still produce a useful classification.
 */
export const parseConnectErrorCode = (error?: string): ConnectErrorCode | undefined => {
  if (typeof error !== 'string') return undefined;

  // 1. Marker parse — must be validated against the known code set so an
  //    unknown `[code:foo]` returns undefined (and we deliberately do NOT
  //    strip it; we only strip recognized markers).
  const match = error.match(CODE_MARKER_RE);
  if (match) {
    const candidate = match[1];
    if (CODES.has(candidate)) {
      return candidate as ConnectErrorCode;
    }
    return undefined;
  }

  // 2. Heuristic fallback for older cores.
  const text = error.toLowerCase();
  if (text.includes('dns')) return 'dns_failure';
  if (text.includes('certificate') || text.includes('tls') || text.includes('ssl')) return 'tls_failure';
  if (text.includes('401') || text.includes('403') || text.includes('unauthorized') || text.includes('forbidden')) {
    return 'auth_failure';
  }
  if (text.includes('connection refused')) return 'connection_refused';
  if (text.includes('timed out') || text.includes('timeout')) return 'timeout';

  return undefined;
};

/**
 * Strip the leading `[code:<x>]` marker for raw-detail display. Only a
 * recognized marker is removed; an unknown marker (e.g. `[code:future]`) is
 * preserved so we don't lose information about an upstream contract change.
 */
export const stripConnectErrorCode = (error: string): string => {
  if (typeof error !== 'string') return error;
  const match = error.match(CODE_MARKER_RE);
  if (match && CODES.has(match[1])) {
    return error.slice(match[0].length);
  }
  return error;
};

/** i18n key for a code (settings.connectError.<code>). */
export const connectErrorI18nKey = (code: ConnectErrorCode): string => `settings.connectError.${code}`;
