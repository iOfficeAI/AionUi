import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
import { getActiveAtSessionQuery } from './atSessionQuery';

/**
 * Characters that terminate an `@` token, as a regex character-class body.
 *
 * The single source for BOTH regexes below, which MUST stay in step. A character
 * that ends a token but is not escaped makes a path containing it parse short:
 * the token stops early, and the reconciliation in `SendBox` — which matches a
 * selected file against the token text — no longer recognises it and drops the
 * reference. Silently. These were two hand-aligned literals before, so editing
 * one and not the other was a one-character mistake away.
 */
const AT_FILE_BOUNDARY_CHARS = String.raw`\s,;!?()[\]{}`;
const AT_FILE_BOUNDARY_RE = new RegExp(`[${AT_FILE_BOUNDARY_CHARS}]`);
/**
 * The boundary characters plus the backslash itself, which is the escape
 * character and deliberately NOT a boundary — treating it as one would end a
 * token at its own escape marker.
 */
const AT_FILE_ESCAPE_RE = new RegExp(String.raw`([\\${AT_FILE_BOUNDARY_CHARS}])`, 'g');

export type ActiveAtFileQuery = {
  start: number;
  end: number;
  query: string;
  rawQuery: string;
  token: string;
};

function isBoundaryChar(char: string): boolean {
  return AT_FILE_BOUNDARY_RE.test(char);
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
 * `escapeAtFilePath` would add a backslash before a newline that this could
 * never take back off. The round trip broke, and reconciliation — which matches
 * a selection against the token text — then failed to recognise the path and
 * dropped the reference. The `s` flag would say the same thing but needs an
 * ES2018 target; this file compiles at ES6.
 */
function unescapeAtFileQuery(value: string): string {
  return value.replace(/\\([\s\S])/g, '$1');
}

export function escapeAtFilePath(path: string): string {
  return path.replace(AT_FILE_ESCAPE_RE, '\\$1');
}

export function getActiveAtFileQuery(value: string, caretPosition: number): ActiveAtFileQuery | null {
  if (!value) {
    return null;
  }

  // `@@` is a session mention, not a file mention. It must be decided FIRST and
  // short-circuit this branch: without it, the loop below skips the second `@`
  // (its previous char is `@`, which is not in AT_FILE_BOUNDARY_RE) and anchors
  // on the FIRST `@`, producing the file query `@auth` — a search for a file
  // literally named `@auth`.
  if (getActiveAtSessionQuery(value, caretPosition)) {
    return null;
  }

  const safeCaret = Math.max(0, Math.min(caretPosition, value.length));
  let atIndex = -1;

  for (let index = safeCaret - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char === '@' && !isEscaped(value, index)) {
      const previousChar = index > 0 ? value[index - 1] : '';
      if (!previousChar || isBoundaryChar(previousChar)) {
        atIndex = index;
        break;
      }
    }

    if (isBoundaryChar(char) && !isEscaped(value, index)) {
      return null;
    }
  }

  if (atIndex === -1) {
    return null;
  }

  let tokenEnd = value.length;
  for (let index = atIndex + 1; index < value.length; index += 1) {
    const char = value[index];
    if (isBoundaryChar(char) && !isEscaped(value, index)) {
      tokenEnd = index;
      break;
    }
  }

  if (safeCaret < atIndex || safeCaret > tokenEnd) {
    return null;
  }

  const rawQuery = value.slice(atIndex + 1, tokenEnd);
  return {
    start: atIndex,
    end: tokenEnd,
    query: unescapeAtFileQuery(rawQuery),
    rawQuery,
    token: value.slice(atIndex, tokenEnd),
  };
}

export function getAllAtFileQueries(value: string): ActiveAtFileQuery[] {
  if (!value) {
    return [];
  }

  const queries: ActiveAtFileQuery[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== '@' || isEscaped(value, index)) {
      continue;
    }

    const previousChar = index > 0 ? value[index - 1] : '';
    if (previousChar && !isBoundaryChar(previousChar)) {
      continue;
    }

    // Skip a `@@` pair — it belongs to the session-mention lane. Both halves
    // must be skipped: the first because it opens a session token, the second
    // because its predecessor is that first `@`.
    if (value[index + 1] === '@' || previousChar === '@') {
      continue;
    }

    let tokenEnd = value.length;
    for (let cursor = index + 1; cursor < value.length; cursor += 1) {
      const nextChar = value[cursor];
      if (isBoundaryChar(nextChar) && !isEscaped(value, cursor)) {
        tokenEnd = cursor;
        break;
      }
    }

    const rawQuery = value.slice(index + 1, tokenEnd);
    queries.push({
      start: index,
      end: tokenEnd,
      query: unescapeAtFileQuery(rawQuery),
      rawQuery,
      token: value.slice(index, tokenEnd),
    });

    index = tokenEnd - 1;
  }

  return queries;
}

export function buildAtFileInsertion(item: FileOrFolderItem): string | null {
  const path = item.relativePath || item.path;
  if (!path) {
    return null;
  }
  return `@${escapeAtFilePath(path)}`;
}

/** An action the `@`-mention dropdown takes for a keydown (null = not handled). */
export type AtFileMenuKeyAction = 'dismiss' | 'up' | 'down' | 'accept' | null;

/**
 * Map a keydown to a mention-dropdown action. Escape dismisses regardless;
 * navigation (up/down) and accept require items. Enter and Tab both accept the
 * active item. Pure, so the keyboard contract is unit-tested without rendering
 * the send box.
 */
export function resolveAtFileMenuKey(key: string, hasItems: boolean): AtFileMenuKeyAction {
  if (key === 'Escape') return 'dismiss';
  if (!hasItems) return null;
  if (key === 'ArrowDown') return 'down';
  if (key === 'ArrowUp') return 'up';
  if (key === 'Enter' || key === 'Tab') return 'accept';
  return null;
}
