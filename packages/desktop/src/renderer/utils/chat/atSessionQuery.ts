/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `@@` session mentions — the sibling lane to `@` file mentions.
 *
 * `@` hands the agent a file path; `@@` hands it a conversation handle. The two
 * must be mutually exclusive, and `@@` has to win: see the short-circuit in
 * `atFileQuery.ts`, without which the file matcher anchors on the FIRST `@` of a
 * `@@` pair and searches for a file literally named `@auth`.
 */

/**
 * Characters that terminate a `@@` token, as a regex character-class body.
 *
 * The single source for BOTH regexes below, which MUST stay in step. A character
 * that ends a token but is not escaped makes a conversation name containing it
 * parse short: the token stops early, and `reconcileSessionRefs` — which matches
 * a selected conversation by the token's name — no longer recognises it and
 * retracts the reference. Silently, which is this feature's worst failure mode.
 *
 * Kept separate from the `@` lane's set even though the contents match today:
 * the two alphabets answer to different things (filesystem paths vs. names an
 * agent writes), so a change to one should not silently move the other.
 */
const AT_SESSION_BOUNDARY_CHARS = String.raw`\s,;!?()[\]{}`;
const AT_SESSION_BOUNDARY_RE = new RegExp(`[${AT_SESSION_BOUNDARY_CHARS}]`);
/**
 * The boundary characters plus the backslash itself, which is the escape
 * character and deliberately NOT a boundary — treating it as one would end a
 * token at its own escape marker.
 */
const AT_SESSION_ESCAPE_RE = new RegExp(String.raw`([\\${AT_SESSION_BOUNDARY_CHARS}])`, 'g');

export type ActiveAtSessionQuery = {
  start: number;
  end: number;
  query: string;
  rawQuery: string;
  token: string;
};

function isBoundaryChar(char: string): boolean {
  return AT_SESSION_BOUNDARY_RE.test(char);
}

/**
 * Exported for the at-caret insertion path, which has to know this lane's
 * alphabet to decide whether a mention dropped at the caret needs separators
 * around it. Without them the mention does not parse and its reference is
 * retracted by the reconciliation.
 */
export function isAtSessionBoundaryChar(char: string): boolean {
  return isBoundaryChar(char);
}

function isEscaped(value: string, index: number): boolean {
  let backslashCount = 0;
  let cursor = index - 1;
  while (cursor >= 0 && value[cursor] === '\\') {
    backslashCount += 1;
    cursor -= 1;
  }
  return backslashCount % 2 === 1;
}

/**
 * `[\s\S]`, not `.`: `.` does not match a line terminator, so
 * `escapeAtSessionName` would add a backslash before a newline that this could
 * never take back off. The round trip broke, and `reconcileSessionRefs` — which
 * matches a selected conversation by the token's name — then retracted the
 * reference. The `s` flag would say the same thing but needs an ES2018 target;
 * this file compiles at ES6.
 */
function unescape(value: string): string {
  return value.replace(/\\([\s\S])/g, '$1');
}

export function escapeAtSessionName(name: string): string {
  return name.replace(AT_SESSION_ESCAPE_RE, '\\$1');
}

/** Index of the `@@` opening this token, or -1. */
function findSessionTokenStart(value: string, caret: number): number {
  for (let index = caret - 1; index >= 0; index -= 1) {
    const char = value[index];
    // A `@@` is the pair (index, index + 1); anchor on the first of the two.
    if (char === '@' && value[index + 1] === '@' && !isEscaped(value, index)) {
      const previousChar = index > 0 ? value[index - 1] : '';
      if (!previousChar || isBoundaryChar(previousChar)) {
        return index;
      }
      return -1;
    }
    if (isBoundaryChar(char) && !isEscaped(value, index)) {
      return -1;
    }
  }
  return -1;
}

function tokenEndFrom(value: string, from: number): number {
  for (let index = from; index < value.length; index += 1) {
    if (isBoundaryChar(value[index]) && !isEscaped(value, index)) {
      return index;
    }
  }
  return value.length;
}

export function getActiveAtSessionQuery(value: string, caretPosition: number): ActiveAtSessionQuery | null {
  if (!value) return null;
  const safeCaret = Math.max(0, Math.min(caretPosition, value.length));
  const start = findSessionTokenStart(value, safeCaret);
  if (start === -1) return null;

  const end = tokenEndFrom(value, start + 2);
  if (safeCaret < start || safeCaret > end) return null;

  const rawQuery = value.slice(start + 2, end);
  return {
    start,
    end,
    query: unescape(rawQuery),
    rawQuery,
    token: value.slice(start, end),
  };
}

export function getAllAtSessionQueries(value: string): ActiveAtSessionQuery[] {
  if (!value) return [];
  const queries: ActiveAtSessionQuery[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '@' || value[index + 1] !== '@' || isEscaped(value, index)) continue;
    const previousChar = index > 0 ? value[index - 1] : '';
    if (previousChar && !isBoundaryChar(previousChar)) continue;

    const end = tokenEndFrom(value, index + 2);
    const rawQuery = value.slice(index + 2, end);
    queries.push({
      start: index,
      end,
      query: unescape(rawQuery),
      rawQuery,
      token: value.slice(index, end),
    });
    index = end - 1;
  }
  return queries;
}

export function buildAtSessionInsertion(name: string): string {
  return `@@${escapeAtSessionName(name)}`;
}

/** An action the `@@`-mention dropdown takes for a keydown (null = not handled). */
export type AtSessionMenuKeyAction = 'dismiss' | 'up' | 'down' | 'accept' | null;

/**
 * Same contract as `resolveAtFileMenuKey`, kept as a separate pure function so
 * the two dropdowns' keyboard behaviour is unit-tested independently.
 */
export function resolveAtSessionMenuKey(key: string, hasItems: boolean): AtSessionMenuKeyAction {
  if (key === 'Escape') return 'dismiss';
  if (!hasItems) return null;
  if (key === 'ArrowDown') return 'down';
  if (key === 'ArrowUp') return 'up';
  if (key === 'Enter' || key === 'Tab') return 'accept';
  return null;
}
