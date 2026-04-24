// src/process/acp/session/InputPreprocessor.ts
import type { PromptContent } from '@process/acp/types';
import type { ContentBlock } from '@agentclientprotocol/sdk';

// Match @path or @"path with spaces" (quoted form)
const AT_FILE_REGEX = /@(?:"([^"]+)"|(\S+\.\w+))/g;

export class InputPreprocessor {
  constructor(private readonly readFile: (path: string) => string) {}

  process(text: string, files?: string[]): PromptContent {
    const items: ContentBlock[] = [{ type: 'text', text }];

    // Track which files we've already read (for deduplication)
    const readPaths = new Set<string>();

    // 1. Read explicitly uploaded files first
    if (files) {
      for (const file_path of files) {
        if (readPaths.has(file_path)) continue;
        const item = this.tryReadFile(file_path);
        if (item) {
          items.push(item);
          readPaths.add(file_path);
        }
      }
    }

    // 2. Parse @references from text, skipping already-read files
    const matches = text.matchAll(AT_FILE_REGEX);
    for (const match of matches) {
      const file_path = match[1] ?? match[2]; // group 1 = quoted, group 2 = unquoted
      if (!file_path || readPaths.has(file_path)) continue;

      // Also skip if basename matches any uploaded file
      const basename = file_path.split(/[\\/]/).pop();
      if (files?.some((f) => f === file_path || f.endsWith(`/${basename}`) || f.endsWith(`\\${basename}`))) {
        continue;
      }

      const item = this.tryReadFile(file_path);
      if (item) {
        items.push(item);
        readPaths.add(file_path);
      }
    }
    return items;
  }

  private tryReadFile(file_path: string): ContentBlock | null {
    try {
      const content = this.readFile(file_path);
      return { type: 'text', text: `[File: ${file_path}]\n${content}` };
    } catch {
      // Binary files or missing files — skip silently (consistent with V1 behavior)
      return null;
    }
  }
}
