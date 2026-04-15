// src/process/acp/session/adapters/InputPreprocessor.ts
import type { PromptContent, PromptContentItem } from '../../types';

const AT_FILE_REGEX = /@([\w/.~-]+\.\w+)/g;

export class InputPreprocessor {
  constructor(private readonly readFile: (path: string) => string) {}

  process(text: string, files?: string[]): PromptContent {
    const items: PromptContentItem[] = [{ type: 'text', text }];
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

  private tryReadFile(path: string): PromptContentItem | null {
    try {
      const content = this.readFile(path);
      return { type: 'file', path, content };
    } catch {
      return null;
    }
  }
}
