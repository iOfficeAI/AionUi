// src/process/acp/session/InputPreprocessor.ts
import type { PromptContent } from '@process/acp/types';
import type { ContentBlock } from '@agentclientprotocol/sdk';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Match @path or @"path with spaces" (quoted form)
const AT_FILE_REGEX = /@(?:"([^"]+)"|(\S+\.\w+))/g;
const BINARY_EXTENSIONS = new Set([
  '.7z',
  '.avi',
  '.avif',
  '.bmp',
  '.class',
  '.doc',
  '.docm',
  '.docx',
  '.exe',
  '.gif',
  '.gz',
  '.heic',
  '.heif',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.m4a',
  '.mov',
  '.mp3',
  '.mp4',
  '.ogg',
  '.pdf',
  '.png',
  '.ppt',
  '.pptm',
  '.pptx',
  '.rar',
  '.svg',
  '.tar',
  '.tif',
  '.tiff',
  '.wav',
  '.webm',
  '.webp',
  '.xls',
  '.xlsb',
  '.xlsm',
  '.xlsx',
  '.zip',
]);
const MIME_BY_EXTENSION: Record<string, string> = {
  '.bmp': 'image/bmp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
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
    if (this.shouldKeepAsFileReference(filePath)) {
      return this.buildResourceLink(filePath);
    }

    try {
      const content = this.readFile(filePath);
      if (this.isLikelyBinaryContent(content)) {
        return this.buildResourceLink(filePath);
      }
      return { type: 'text', text: `[File: ${filePath}]\n${content}` };
    } catch {
      // Binary files or missing files — skip silently (consistent with V1 behavior)
      return null;
    }
  }

  private shouldKeepAsFileReference(filePath: string): boolean {
    return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  private isLikelyBinaryContent(content: string): boolean {
    if (!content) return false;
    if (content.includes('\u0000') || content.includes('\uFFFD')) {
      return true;
    }

    const suspiciousCharCount = this.countSuspiciousControlChars(content);
    if (suspiciousCharCount >= 3) {
      return true;
    }

    return suspiciousCharCount > 0 && suspiciousCharCount / content.length > 0.01;
  }

  private countSuspiciousControlChars(content: string): number {
    let count = 0;

    for (const char of content) {
      const codePoint = char.codePointAt(0);
      if (codePoint === undefined) continue;
      if (this.isSuspiciousControlCodePoint(codePoint)) {
        count += 1;
      }
    }

    return count;
  }

  private isSuspiciousControlCodePoint(codePoint: number): boolean {
    return (
      (codePoint >= 0x00 && codePoint <= 0x08) ||
      codePoint === 0x0b ||
      codePoint === 0x0c ||
      (codePoint >= 0x0e && codePoint <= 0x1a) ||
      (codePoint >= 0x1c && codePoint <= 0x1f)
    );
  }

  private buildResourceLink(filePath: string): ContentBlock {
    const extension = path.extname(filePath).toLowerCase();
    const resourceLink: Extract<ContentBlock, { type: 'resource_link' }> = {
      type: 'resource_link',
      name: path.basename(filePath) || filePath,
      uri: this.toResourceUri(filePath),
    };

    const mimeType = MIME_BY_EXTENSION[extension];
    if (mimeType) {
      resourceLink.mimeType = mimeType;
    }

    return resourceLink;
  }

  private toResourceUri(filePath: string): string {
    try {
      return pathToFileURL(path.resolve(filePath)).toString();
    } catch {
      return filePath;
    }
  }
}
