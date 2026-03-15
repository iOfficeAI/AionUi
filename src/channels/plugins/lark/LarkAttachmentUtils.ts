/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

export type LarkMessageReference = {
  key?: string;
  id?: string;
  idType?: string;
  name?: string;
};

export type LarkFetchedMessage = {
  messageId: string;
  chatId: string;
  msgType: string;
  content: string;
  createTime?: number;
  parentId?: string;
  rootId?: string;
  upperMessageId?: string;
  mentions?: LarkMessageReference[];
};

export type LarkResolvedTextSegment = {
  kind: 'text';
  text: string;
};

export type LarkResolvedAttachmentSegment = {
  kind: 'attachment';
  attachmentType: 'image' | 'file';
  fileKey: string;
  fileName?: string;
  localPath?: string;
  downloadError?: string;
};

export type LarkResolvedSegment = LarkResolvedTextSegment | LarkResolvedAttachmentSegment;

export type LarkResolvedMessageContext = {
  messageId: string;
  chatId: string;
  msgType: string;
  createTime?: number;
  segments: LarkResolvedSegment[];
  attachmentPaths: string[];
};

export type LarkConversationContext = {
  current: LarkResolvedMessageContext;
  quoted?: LarkResolvedMessageContext;
  quotedMessageId?: string;
};

type LarkPostNode = {
  tag?: string;
  text?: string;
  href?: string;
  user_id?: string;
  user_name?: string;
  image_key?: string;
  file_key?: string;
  file_name?: string;
  emoji_type?: string;
};

type LarkPostContent = {
  title?: string;
  content?: LarkPostNode[][];
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tif', '.tiff', '.ico', '.avif', '.heic']);

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/zip': '.zip',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/opus': '.opus',
  'audio/wav': '.wav',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/tiff': '.tiff',
  'image/webp': '.webp',
  'text/csv': '.csv',
  'text/markdown': '.md',
  'text/plain': '.txt',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

function safeJsonParse<T>(content: string, fallback: T): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

function decodeMaybeUri(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function normalizeMessageText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function resolveMentionDisplay(rawId: string | undefined, rawName: string | undefined, mentions: LarkMessageReference[] | undefined): string {
  if (rawName && rawName.trim()) {
    return `@${rawName.trim()}`;
  }

  if (rawId === 'all') {
    return '@all';
  }

  const mention = mentions?.find((item) => item.key === rawId || item.id === rawId);
  if (mention?.name) {
    return `@${mention.name}`;
  }

  if (rawId && rawId.startsWith('@_user_')) {
    return '@mentioned-user';
  }

  return rawId ? `@${rawId}` : '@mentioned-user';
}

function flushTextBuffer(segments: LarkResolvedSegment[], buffer: string[], forceNewSegment: boolean = false): void {
  const text = normalizeMessageText(buffer.join(''));
  if (!text) {
    buffer.length = 0;
    return;
  }

  const previous = segments[segments.length - 1];
  if (!forceNewSegment && previous?.kind === 'text') {
    previous.text = normalizeMessageText(`${previous.text}\n${text}`);
  } else {
    segments.push({ kind: 'text', text });
  }
  buffer.length = 0;
}

function parseTextMessage(content: string, mentions?: LarkMessageReference[]): LarkResolvedSegment[] {
  const payload = safeJsonParse<{ text?: string }>(content, {});
  const rawText = payload.text || content;
  const normalized = normalizeMessageText(rawText.replace(/@_user_\d+/g, (match) => resolveMentionDisplay(match, undefined, mentions)));

  return normalized ? [{ kind: 'text', text: normalized }] : [];
}

function parsePostMessage(content: string, mentions?: LarkMessageReference[]): LarkResolvedSegment[] {
  const payload = safeJsonParse<LarkPostContent>(content, {});
  const segments: LarkResolvedSegment[] = [];
  let forceNewTextSegment = false;

  if (payload.title?.trim()) {
    segments.push({ kind: 'text', text: payload.title.trim() });
    forceNewTextSegment = true;
  }

  for (const row of payload.content || []) {
    const textBuffer: string[] = [];

    for (const node of row || []) {
      switch (node.tag) {
        case 'text':
          textBuffer.push(node.text || '');
          break;
        case 'a':
          if (node.href && node.text) {
            textBuffer.push(`${node.text} (${node.href})`);
          } else {
            textBuffer.push(node.text || node.href || '');
          }
          break;
        case 'at':
          textBuffer.push(resolveMentionDisplay(node.user_id, node.user_name, mentions));
          break;
        case 'img':
          flushTextBuffer(segments, textBuffer, forceNewTextSegment);
          forceNewTextSegment = false;
          if (node.image_key) {
            segments.push({
              kind: 'attachment',
              attachmentType: 'image',
              fileKey: node.image_key,
              fileName: node.file_name,
            });
          }
          break;
        case 'file':
        case 'audio':
        case 'media':
        case 'sticker':
          flushTextBuffer(segments, textBuffer, forceNewTextSegment);
          forceNewTextSegment = false;
          if (node.file_key) {
            segments.push({
              kind: 'attachment',
              attachmentType: 'file',
              fileKey: node.file_key,
              fileName: node.file_name,
            });
          }
          break;
        case 'emotion':
          if (node.emoji_type) {
            textBuffer.push(`:${node.emoji_type}:`);
          }
          break;
        default:
          if (node.text) {
            textBuffer.push(node.text);
          }
      }
    }

    flushTextBuffer(segments, textBuffer, forceNewTextSegment);
    forceNewTextSegment = false;
  }

  return segments;
}

function parseAttachmentMessage(content: string, attachmentType: 'image' | 'file'): LarkResolvedSegment[] {
  const payload = safeJsonParse<Record<string, string>>(content, {});
  const fileKey = attachmentType === 'image' ? payload.image_key : payload.file_key;
  if (!fileKey) {
    return [];
  }

  return [
    {
      kind: 'attachment',
      attachmentType,
      fileKey,
      fileName: payload.file_name,
    },
  ];
}

export function normalizeLarkMessage(message: LarkFetchedMessage): LarkResolvedMessageContext {
  let segments: LarkResolvedSegment[] = [];

  switch (message.msgType) {
    case 'text':
      segments = parseTextMessage(message.content, message.mentions);
      break;
    case 'post':
      segments = parsePostMessage(message.content, message.mentions);
      break;
    case 'image':
      segments = parseAttachmentMessage(message.content, 'image');
      break;
    case 'file':
    case 'audio':
    case 'media':
    case 'sticker':
    case 'folder':
      segments = parseAttachmentMessage(message.content, 'file');
      break;
    default:
      segments = parseTextMessage(message.content, message.mentions);
      break;
  }

  return {
    messageId: message.messageId,
    chatId: message.chatId,
    msgType: message.msgType,
    createTime: message.createTime,
    segments,
    attachmentPaths: segments.filter((segment): segment is LarkResolvedAttachmentSegment => segment.kind === 'attachment' && Boolean(segment.localPath)).map((segment) => segment.localPath as string),
  };
}

export function resolveQuotedMessageId(message: Pick<LarkFetchedMessage, 'messageId' | 'parentId' | 'rootId' | 'upperMessageId'>): string | undefined {
  if (message.parentId && message.parentId !== message.messageId) {
    return message.parentId;
  }

  if (message.upperMessageId && message.upperMessageId !== message.messageId) {
    return message.upperMessageId;
  }

  if (message.rootId && message.rootId !== message.messageId) {
    return message.rootId;
  }

  return undefined;
}

export function sanitizeAttachmentName(value: string): string {
  const withoutControlChars = Array.from(value)
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('');
  const normalized = withoutControlChars
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const collapsed = normalized.replace(/_+/g, '_');
  return collapsed || 'attachment';
}

export function inferExtensionFromContentType(contentType?: string): string {
  if (!contentType) return '';
  const [type] = contentType.split(';');
  return CONTENT_TYPE_EXTENSIONS[type.trim().toLowerCase()] || '';
}

export function buildLarkAssetDirectory(workspace: string, chatId: string, createTime?: number): string {
  const date = new Date(createTime || Date.now());
  const dateStamp = Number.isNaN(date.getTime()) ? 'unknown-date' : date.toISOString().slice(0, 10);
  return path.join(workspace, '.aionui', 'channel-assets', 'lark', sanitizeAttachmentName(chatId), dateStamp);
}

export function buildDeterministicAttachmentPath(options: { workspace: string; chatId: string; messageId: string; index: number; originalNameOrKey: string; createTime?: number; contentType?: string }): string {
  const directory = buildLarkAssetDirectory(options.workspace, options.chatId, options.createTime);
  const sanitizedName = sanitizeAttachmentName(options.originalNameOrKey);
  const existingExt = path.extname(sanitizedName);
  const inferredExt = existingExt || inferExtensionFromContentType(options.contentType);
  const basename = existingExt ? path.basename(sanitizedName, existingExt) : sanitizedName;
  const filename = `${sanitizeAttachmentName(options.messageId)}__${String(options.index).padStart(2, '0')}__${basename}${inferredExt}`;
  return path.join(directory, filename);
}

export function attachLocalPathToContext(context: LarkResolvedMessageContext, localPathByFileKey: Map<string, { localPath: string; error?: string }>): LarkResolvedMessageContext {
  const nextSegments = context.segments.map((segment) => {
    if (segment.kind !== 'attachment') return segment;
    const info = localPathByFileKey.get(segment.fileKey);
    return info
      ? {
          ...segment,
          localPath: info.localPath,
          downloadError: info.error,
        }
      : segment;
  });

  return {
    ...context,
    segments: nextSegments,
    attachmentPaths: nextSegments.filter((segment): segment is LarkResolvedAttachmentSegment => segment.kind === 'attachment' && Boolean(segment.localPath)).map((segment) => segment.localPath as string),
  };
}

function segmentToPromptLine(segment: LarkResolvedSegment, index: number): string {
  if (segment.kind === 'text') {
    return `${index + 1}. text: ${segment.text}`;
  }

  if (segment.localPath) {
    return `${index + 1}. attachment: ${segment.localPath}`;
  }

  const fallback = segment.fileName || segment.fileKey;
  return `${index + 1}. attachment unavailable: ${fallback}`;
}

export function buildLarkCodexPrompt(context: LarkConversationContext): string {
  const sections: string[] = ['[Feishu message context]'];

  if (context.quoted) {
    sections.push('Quoted message:\n' + (context.quoted.segments.length > 0 ? context.quoted.segments.map(segmentToPromptLine).join('\n') : '1. text: [quoted message unavailable]'));
  }

  sections.push('Current message:\n' + (context.current.segments.length > 0 ? context.current.segments.map(segmentToPromptLine).join('\n') : '1. text: [empty message]'));
  sections.push('Use the current message as the latest user request. Attachment entries are absolute local file paths when available.');

  return sections.join('\n\n');
}

function collectPathCandidates(text: string): string[] {
  const candidates = new Set<string>();
  const addCandidate = (value?: string) => {
    if (!value) return;
    const cleaned = decodeMaybeUri(
      value
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/[),.;]+$/g, '')
    );
    if (!cleaned || /^(https?:|mailto:|data:)/i.test(cleaned)) return;
    candidates.add(cleaned);
  };

  for (const match of text.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)) {
    addCandidate(match[1]);
  }

  for (const match of text.matchAll(/`([^`\r\n]+)`/g)) {
    addCandidate(match[1]);
  }

  for (const match of text.matchAll(/\b[A-Za-z]:[\\/][^\s<>"'`|?*]+/g)) {
    addCandidate(match[0]);
  }

  for (const match of text.matchAll(/(?:^|[\s(])((?:\.{0,2}[\\/])?[\w.\-\\/]+?\.[A-Za-z0-9]{1,12})(?=$|[\s),.;])/g)) {
    addCandidate(match[1]);
  }

  return Array.from(candidates);
}

export function extractExplicitWorkspaceFilePaths(text: string, workspace: string): string[] {
  const normalizedWorkspace = path.resolve(workspace);
  const results = new Set<string>();

  for (const candidate of collectPathCandidates(text)) {
    const resolvedPath = path.resolve(path.isAbsolute(candidate) ? candidate : path.join(normalizedWorkspace, candidate));
    if (!(resolvedPath === normalizedWorkspace || resolvedPath.startsWith(`${normalizedWorkspace}${path.sep}`))) {
      continue;
    }

    try {
      const stat = fs.statSync(resolvedPath);
      if (stat.isFile()) {
        results.add(resolvedPath);
      }
    } catch {
      // Ignore missing or unreadable files.
    }
  }

  return Array.from(results);
}

export function isImageFilePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
