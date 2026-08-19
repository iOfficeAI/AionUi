/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extracts triage-friendly diagnostics from an arbitrary thrown value.
 *
 * The main process swallows `uncaughtException` / `unhandledRejection` so the app keeps
 * running, which used to mean the only record left behind was a bare Node-internal stack
 * (e.g. `TCP.onStreamRead`) with no attribution — impossible to tell which subsystem's
 * socket produced an `ECONNRESET`. This module turns whatever was thrown into a small,
 * fixed set of fields that identify the failure without dumping the raw value.
 *
 * Only an explicit allow-list is read (`name`, `message`, `code`, `syscall`, `errno`,
 * `stack`). Arbitrary properties of the thrown value are never copied out, because a
 * rejected value can carry request bodies, tokens or other sensitive payloads.
 *
 * The function is total: it never throws and never returns a partially built value, so it
 * is safe to call from inside a global error handler where a secondary throw would be fatal.
 */

/** Where the failure came from. Node passes this as the 2nd arg of `uncaughtException`. */
export type UncaughtErrorOrigin = 'uncaughtException' | 'unhandledRejection';

export interface UncaughtErrorDiagnostics {
  /** Which global handler observed the failure. */
  origin: UncaughtErrorOrigin;
  /** Runtime shape of the raw value: 'Error' for Error instances, otherwise `typeof` (or 'null'). */
  valueType: string;
  /** `error.name`, or 'UnknownError' when the value carries no usable name. */
  name: string;
  /** `error.message`, the raw string when a string was thrown, or a non-revealing class tag. */
  message: string;
  /** libuv / Node error code, e.g. 'ECONNRESET', 'ENOSPC'. */
  code?: string;
  /** Failing syscall, e.g. 'read', 'write'. */
  syscall?: string;
  /** Negative libuv errno paired with `code`. */
  errno?: number;
  /** Stack trace, truncated. Paths are kept — they are the attribution signal. */
  stack?: string;
}

const MAX_MESSAGE_LENGTH = 1000;
const MAX_STACK_LENGTH = 4000;
const TRUNCATION_SUFFIX = '... (truncated)';

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}${TRUNCATION_SUFFIX}`;
}

/** Reads a property without letting a throwing getter or exotic proxy escape. */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function readString(value: unknown, key: string): string | undefined {
  const raw = readProperty(value, key);
  if (typeof raw === 'string') return raw.length > 0 ? raw : undefined;
  // Node occasionally surfaces numeric codes (e.g. Windows error numbers) on `code`.
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return undefined;
}

function readNumber(value: unknown, key: string): number | undefined {
  const raw = readProperty(value, key);
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function describeValueType(value: unknown): string {
  if (value === null) return 'null';
  if (value instanceof Error) return 'Error';
  return typeof value;
}

/**
 * Builds a message that is useful but never leaks the raw payload of a rejected object.
 * Primitives are safe to render verbatim; objects fall back to their class tag.
 */
function describeMessage(value: unknown): string {
  if (typeof value === 'string') return value;

  const message = readString(value, 'message');
  if (message !== undefined) return message;

  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  const valueType = typeof value;
  if (valueType === 'number' || valueType === 'boolean' || valueType === 'bigint' || valueType === 'symbol') {
    try {
      return String(value);
    } catch {
      return `[unserializable ${valueType}]`;
    }
  }

  try {
    return Object.prototype.toString.call(value);
  } catch {
    return `[unserializable ${valueType}]`;
  }
}

/**
 * Describes an arbitrary thrown/rejected value using the allow-listed diagnostic fields.
 *
 * @param value  Whatever reached the global handler — an Error, a string, a plain object, or nothing at all.
 * @param origin Which handler observed it.
 */
export function describeUncaughtError(value: unknown, origin: UncaughtErrorOrigin): UncaughtErrorDiagnostics {
  try {
    const diagnostics: UncaughtErrorDiagnostics = {
      origin,
      valueType: describeValueType(value),
      name: readString(value, 'name') ?? 'UnknownError',
      message: truncate(describeMessage(value), MAX_MESSAGE_LENGTH),
    };

    const code = readString(value, 'code');
    if (code !== undefined) diagnostics.code = code;

    const syscall = readString(value, 'syscall');
    if (syscall !== undefined) diagnostics.syscall = syscall;

    const errno = readNumber(value, 'errno');
    if (errno !== undefined) diagnostics.errno = errno;

    const stack = readString(value, 'stack');
    if (stack !== undefined) diagnostics.stack = truncate(stack, MAX_STACK_LENGTH);

    return diagnostics;
  } catch {
    // Never let diagnostics extraction itself become the failure the caller has to handle.
    return {
      origin,
      valueType: 'unknown',
      name: 'UnknownError',
      message: '[failed to describe thrown value]',
    };
  }
}
