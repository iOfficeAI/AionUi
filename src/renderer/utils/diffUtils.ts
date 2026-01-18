/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 从 diff 内容中解析文件路径
 * Parse file path from diff content
 *
 * 支持多种 diff 格式：
 * - Index: path/to/file.tsx
 * - --- a/path/to/file.tsx
 * - +++ b/path/to/file.tsx
 *
 * @param diffContent diff 内容
 * @returns 文件相对路径，如果无法解析则返回 null
 */
export function parseFilePathFromDiff(diffContent: string): string | null {
  const lines = diffContent.split('\n');

  // 尝试 Index: 格式（SVN 风格）
  for (const line of lines) {
    if (line.startsWith('Index: ')) {
      return line.substring(7).trim();
    }
  }

  // 尝试 git diff 格式 (+++ b/ 优先，因为它指向新文件)
  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      return line.substring(6).trim();
    }
  }

  // 回退到 --- a/ 格式
  for (const line of lines) {
    if (line.startsWith('--- a/')) {
      return line.substring(6).trim();
    }
  }

  return null;
}

/**
 * 从 diff 中提取实际文件内容（去除元数据）
 * Extract actual file content from diff (remove metadata)
 *
 * @param diffContent diff 内容
 * @returns 提取后的纯净文件内容
 */
export function extractContentFromDiff(diffContent: string): string {
  const lines = diffContent.split('\n');
  const contentLines: string[] = [];
  let inDiffBlock = false;

  for (const line of lines) {
    // 跳过 diff 元数据行 / Skip diff metadata lines
    if (line.startsWith('Index:') || line.match(/^={3,}/) || line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      inDiffBlock = true;
      continue;
    }

    if (inDiffBlock) {
      // 提取新增行（去掉开头的 + 号）/ Extract added lines (remove leading +)
      if (line.startsWith('+')) {
        contentLines.push(line.substring(1));
      }
      // 跳过删除行和上下文标记 / Skip deleted lines and context markers
      else if (line.startsWith('-') || line.startsWith('\\')) {
        continue;
      }
      // 空行也保留 / Keep empty lines too
      else {
        contentLines.push(line);
      }
    }
  }

  return contentLines.join('\n').trim();
}
