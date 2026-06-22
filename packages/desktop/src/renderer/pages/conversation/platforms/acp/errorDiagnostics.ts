/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';

/** Redacted summary of an original error, safe to attach to a Sentry report. */
export type RawErrorSummary = {
  name?: string;
  message?: string;
  code?: string;
  status?: number;
  stack?: string;
};

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 1000;

const REDACTION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Provider api keys (OpenAI / Anthropic / generic sk- prefixed secrets).
  [/sk-[a-zA-Z0-9._-]{8,}/g, '[REDACTED_KEY]'],
  // Google API keys (AIza...).
  [/AIza[a-zA-Z0-9_-]{16,}/g, '[REDACTED_KEY]'],
  // AWS access key ids (AKIA / ASIA + 16 uppercase alphanumerics).
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED_KEY]'],
  // JSON Web Tokens (three base64url segments). Runs before the Bearer rule so
  // a bare token is caught even without the prefix.
  [/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED]'],
  // Bearer tokens. Runs before the key=value rule so the "Bearer" keyword is
  // not mistaken for an `authorization` value.
  [/(Bearer\s+)[a-zA-Z0-9._\-+/=]+/gi, '$1[REDACTED]'],
  // Connection-string credentials: scheme://user:password@host -> redact password.
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^:/\s@]+:)[^@\s/]+(@)/gi, '$1[REDACTED]$2'],
  // key=value / "key": "value" secrets (api key, token, password, secret).
  [
    /(["']?(?:api[_-]?key|access[_-]?token|token|password|passwd|secret)["']?\s*[=:]\s*)(["']?)[^\s"',}]+(\2)/gi,
    '$1$2[REDACTED]$3',
  ],
  // Email addresses.
  [/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '[email]'],
  // Unix home directories: keep the path shape, drop the username.
  [/(\/(?:Users|home)\/)[^/\s]+/g, '$1[user]'],
  // Windows home directories.
  [/([A-Za-z]:\\Users\\)[^\\/\s]+/g, '$1[user]'],
];

/**
 * Strip secrets and personally-identifying path segments from free-form error
 * text so it can be safely attached to telemetry.
 */
export const redactErrorText = (text: string): string => {
  let out = text;
  for (const [pattern, replacement] of REDACTION_RULES) {
    out = out.replace(pattern, replacement);
  }
  return out;
};

const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const getStringProp = (value: object, key: string): string | undefined => {
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
};

/**
 * Build a redacted, size-bounded summary of an original error for telemetry.
 * Returns undefined for empty/nullish values so callers can omit the field.
 */
export const buildRawErrorSummary = (error: unknown): RawErrorSummary | undefined => {
  if (error === undefined || error === null) return undefined;

  if (isBackendHttpError(error)) {
    return {
      name: error.name,
      status: error.status,
      ...(error.code ? { code: error.code } : {}),
      ...(error.backendMessage ? { message: truncate(redactErrorText(error.backendMessage), MAX_MESSAGE_LENGTH) } : {}),
    };
  }

  if (error instanceof Error) {
    const code = getStringProp(error, 'code');
    return {
      name: error.name,
      ...(error.message ? { message: truncate(redactErrorText(error.message), MAX_MESSAGE_LENGTH) } : {}),
      ...(code ? { code } : {}),
      ...(error.stack ? { stack: truncate(redactErrorText(error.stack), MAX_STACK_LENGTH) } : {}),
    };
  }

  const text = String(error);
  if (!text) return undefined;
  return { message: truncate(redactErrorText(text), MAX_MESSAGE_LENGTH) };
};
