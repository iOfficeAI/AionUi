// src/process/acp/session/InputPreprocessor.ts
import type { PromptContent } from '@process/acp/types';
import type { ContentBlock } from '@agentclientprotocol/sdk';
const AT_FILE_REGEX = /@([\w/.~-]+\.\w+)/g;

export class InputPreprocessor {
  constructor(private readonly readFile: (path: string) => string) {}

  process(text: string, files?: string[]): PromptContent {
    const items: ContentBlock[] = [{ type: 'text', text }];
    if (files) {
      for (const path of files) {
        const item = this.tryReadFile(path);
        if (item) items.push(item);
      }
    }
    const matches = text.matchAll(AT_FILE_REGEX);
    for (const match of matches) {
      const path = match[1];
      const item = this.tryReadFile(path);
      if (item) items.push(item);
    }
    return items;
  }

  private tryReadFile(path: string): ContentBlock | null {
    try {
      const content = this.readFile(path);
      return { type: 'text', text: `[File: ${path}]\n${content}` };
    } catch {
      return null;
    }
  }
}
