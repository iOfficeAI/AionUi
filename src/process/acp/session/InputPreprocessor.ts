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
      for (const filePath of files) {
        if (readPaths.has(filePath)) continue;
        const item = this.tryReadFile(filePath);
        if (item) {
          items.push(item);
          readPaths.add(filePath);
        }
      }
    }

    // 2. Parse @references from text, skipping already-read files
    const matches = text.matchAll(AT_FILE_REGEX);
    for (const match of matches) {
      const filePath = match[1] ?? match[2]; // group 1 = quoted, group 2 = unquoted
      if (!filePath || readPaths.has(filePath)) continue;

      // Also skip if basename matches any uploaded file
      const basename = filePath.split(/[\\/]/).pop();
      if (files?.some((f) => f === filePath || f.endsWith(`/${basename}`) || f.endsWith(`\\${basename}`))) {
        continue;
      }

      const item = this.tryReadFile(filePath);
      if (item) {
        items.push(item);
        readPaths.add(filePath);
      }
    }
    return items;
  }

  private tryReadFile(filePath: string): ContentBlock | null {
    try {
      const content = this.readFile(filePath);
      return { type: 'text', text: `[File: ${filePath}]\n${content}` };
    } catch {
      // Binary files or missing files — skip silently (consistent with V1 behavior)
      return null;
    }
  }
}
