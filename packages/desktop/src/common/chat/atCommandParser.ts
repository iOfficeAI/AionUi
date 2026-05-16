/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared @ command parser for file references
 * 共享的 @ 命令解析器，用于文件引用
 */

export interface AtCommandPart {
  type: 'text' | 'atPath';
  content: string;
}

/**
 * Simple unescape function for @ paths
 * 简单的转义处理函数
 */
function unescapeAtPath(rawPath: string): string {
  // Remove leading @ if present
  const path = rawPath.startsWith('@') ? rawPath.substring(1) : rawPath;
  // Unescape backslash-escaped characters
  return path.replace(/\\(.)/g, '$1');
}

/**
 * Parses a query string to find all '@<path>' commands and text segments.
 * Handles \ escaped spaces within paths.
 *
 * 解析查询字符串，找出所有 '@<path>' 命令和文本段。
 * 处理路径中的 \ 转义空格。
 *
 * @example
 * parseAllAtCommands('@file.txt hello @dir/path world')
 * // Returns: [
 * //   { type: 'atPath', content: 'file.txt' },
 * //   { type: 'text', content: 'hello' },
 * //   { type: 'atPath', content: 'dir/path' },
 * //   { type: 'text', content: 'world' }
 * // ]
 */
export function parseAllAtCommands(query: string): AtCommandPart[] {
  const parts: AtCommandPart[] = [];
  let currentIndex = 0;

  while (currentIndex < query.length) {
    let atIndex = -1;
    let nextSearchIndex = currentIndex;
    // Find next unescaped '@'
    while (nextSearchIndex < query.length) {
      if (query[nextSearchIndex] === '@' && (nextSearchIndex === 0 || query[nextSearchIndex - 1] !== '\\')) {
        atIndex = nextSearchIndex;
        break;
      }
      nextSearchIndex++;
    }

    if (atIndex === -1) {
      // No more @
      if (currentIndex < query.length) {
        parts.push({ type: 'text', content: query.substring(currentIndex) });
      }
      break;
    }

    // Add text before @
    if (atIndex > currentIndex) {
      parts.push({
        type: 'text',
        content: query.substring(currentIndex, atIndex),
      });
    }

    // Parse @path
    let pathEndIndex = atIndex + 1;
    let inEscape = false;
    while (pathEndIndex < query.length) {
      const char = query[pathEndIndex];
      if (inEscape) {
        inEscape = false;
      } else if (char === '\\') {
        inEscape = true;
      } else if (/[,\s;!?()[\]{}]/.test(char)) {
        // Path ends at first whitespace or punctuation not escaped
        break;
      } else if (char === '.') {
        // For . we need to be more careful - only terminate if followed by whitespace or end of string
        // This allows file extensions like .txt, .js but terminates at sentence endings like "file.txt. Next sentence"
        const nextChar = pathEndIndex + 1 < query.length ? query[pathEndIndex + 1] : '';
        if (nextChar === '' || /\s/.test(nextChar)) {
          break;
        }
      }
      pathEndIndex++;
    }
    const rawAtPath = query.substring(atIndex, pathEndIndex);
    const atPath = unescapeAtPath(rawAtPath);
    parts.push({ type: 'atPath', content: atPath });
    currentIndex = pathEndIndex;
  }
  // Filter out empty text parts that might result from consecutive @paths or leading/trailing spaces
  return parts.filter((part) => !(part.type === 'text' && part.content.trim() === ''));
}

/**
 * Extract all @ file paths from a query string
 * 从查询字符串中提取所有 @ 文件路径
 */
export function extractAtPaths(query: string): string[] {
  const parts = parseAllAtCommands(query);
  return parts.filter((part) => part.type === 'atPath' && part.content !== '').map((part) => part.content);
}

/**
 * Check if a query contains any @ file references
 * 检查查询是否包含任何 @ 文件引用
 */
export function hasAtReferences(query: string): boolean {
  return extractAtPaths(query).length > 0;
}

/**
 * Reconstruct query from parts, optionally replacing @ paths
 * 从部分重建查询，可选择替换 @ 路径
 */
export function reconstructQuery(parts: AtCommandPart[], pathReplacer?: (path: string) => string): string {
  return parts
    .map((part) => {
      if (part.type === 'text') {
        return part.content;
      } else {
        // atPath
        if (pathReplacer) {
          return pathReplacer(part.content);
        }
        return '@' + part.content;
      }
    })
    .join('');
}
