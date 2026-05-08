import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

const AT_FILE_BOUNDARY_RE = /[\s,;!?()[\]{}]/;

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

function unescapeAtFileQuery(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

export function escapeAtFilePath(path: string): string {
  return path.replace(/([\\\s,;!?()[\]{}])/g, '\\$1');
}

export function getActiveAtFileQuery(value: string, caretPosition: number): ActiveAtFileQuery | null {
  if (!value) {
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

export function buildAtFileInsertion(item: FileOrFolderItem): string {
  const path = item.relativePath || item.path;
  return `@${escapeAtFilePath(path)}`;
}
