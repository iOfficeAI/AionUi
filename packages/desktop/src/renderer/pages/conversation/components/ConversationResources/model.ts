/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAcpImagePath } from '@/common/chat/acpToolCallOutput';
import type { TMessage } from '@/common/chat/chatLib';
import { AIONUI_FILES_MARKER } from '@/common/config/constants';

export type ConversationFileResourceItem = {
  kind: 'file';
  path: string;
  name: string;
};

export type ConversationUrlResourceItem = {
  kind: 'url';
  url: string;
  name: string;
};

export type ConversationResourceItem = ConversationFileResourceItem | ConversationUrlResourceItem;

export type ConversationResources = {
  outputs: ConversationFileResourceItem[];
  sources: ConversationResourceItem[];
};

export type ParsedMessageFileMarker = {
  text: string;
  files: string[];
};

const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const MARKDOWN_ATTACHMENT_LINE_PATTERN = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|~~~|\|)/;
const MARKDOWN_WRAPPED_PATH_PATTERN = /^(?:!?\[[^\]]*\]\([^)]+\)|`[^`]+`)$/;
const IMAGE_PATH_PATTERN = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;
const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/gi;

const isAbsolutePath = (filePath: string): boolean =>
  filePath.startsWith('/') || filePath.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(filePath);

const isWorkspaceRelativePath = (filePath: string): boolean => {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.startsWith('./') ||
    normalized.startsWith('../') ||
    normalized.includes('/') ||
    /(?:^|\/)[^/]+\.[^./\s][^/]*$/.test(normalized)
  );
};

const isPlainLocalResourcePath = (filePath: string): boolean => {
  const trimmed = filePath.trim();
  if (
    !trimmed ||
    trimmed.includes('\r') ||
    trimmed.includes('\n') ||
    trimmed.includes('\u0000') ||
    URL_SCHEME_PATTERN.test(trimmed) ||
    MARKDOWN_ATTACHMENT_LINE_PATTERN.test(trimmed) ||
    MARKDOWN_WRAPPED_PATH_PATTERN.test(trimmed)
  ) {
    return false;
  }
  return true;
};

const isLocalMessageFilePath = (filePath: string): boolean => {
  const trimmed = filePath.trim();
  if (!isPlainLocalResourcePath(trimmed)) return false;
  return isAbsolutePath(trimmed) || isWorkspaceRelativePath(trimmed);
};

export const parseMessageFileMarker = (content: string, canParse: boolean): ParsedMessageFileMarker => {
  if (!canParse) return { text: content, files: [] };

  const lines = content.split(/\r?\n/);
  let markerLineIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim() === AIONUI_FILES_MARKER) {
      markerLineIndex = index;
      break;
    }
  }

  if (markerLineIndex === -1) return { text: content, files: [] };

  const files = lines
    .slice(markerLineIndex + 1)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!files.length || files.some((filePath) => !isLocalMessageFilePath(filePath))) {
    return { text: content, files: [] };
  }

  return {
    text: lines.slice(0, markerLineIndex).join('\n').trimEnd(),
    files,
  };
};

export const resolveConversationResourcePath = (filePath: string, workspace?: string): string => {
  if (!filePath || isAbsolutePath(filePath) || !workspace) return filePath;

  const normalizedWorkspace = workspace.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const normalizedFilePath = filePath.replace(/^\.?[\\/]+/, '').replace(/\\/g, '/');
  return `${normalizedWorkspace}/${normalizedFilePath}`.replace(/\/+/g, '/');
};

export const conversationResourcesSlotId = (conversationId: string): string =>
  `conversation-resources-${conversationId}`;

const resourceName = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/$/, '');
  return normalized.split('/').pop() || filePath;
};

const firstString = (record: Record<string, unknown> | undefined, keys: string[]): string | undefined => {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

const addFileResource = (items: Map<string, ConversationResourceItem>, filePath: string, workspace?: string): void => {
  const trimmedPath = filePath.trim();
  if (!isPlainLocalResourcePath(trimmedPath)) return;
  const resolvedPath = resolveConversationResourcePath(trimmedPath, workspace);
  if (!resolvedPath) return;
  const key = resolvedPath.replace(/\\/g, '/');
  items.delete(key);
  items.set(key, { kind: 'file', path: resolvedPath, name: resourceName(resolvedPath) });
};

const normalizeHttpUrl = (value: string): string | undefined => {
  const candidate = value.trim().replace(/[.,;:!?]+$/, '');
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
};

const extractHttpUrls = (value: string): string[] =>
  Array.from(value.matchAll(HTTP_URL_PATTERN), (match) => normalizeHttpUrl(match[0])).filter((url): url is string =>
    Boolean(url)
  );

const recordHttpUrls = (record: Record<string, unknown> | undefined): string[] => {
  if (!record) return [];
  const values: string[] = [];
  for (const key of ['url', 'source_url']) {
    if (typeof record[key] === 'string') values.push(record[key]);
  }
  for (const key of ['urls', 'source_urls']) {
    const candidates = record[key];
    if (Array.isArray(candidates)) {
      values.push(...candidates.filter((value): value is string => typeof value === 'string'));
    }
  }
  return values.flatMap(extractHttpUrls);
};

const addUrlResource = (items: Map<string, ConversationResourceItem>, value: string): void => {
  const url = normalizeHttpUrl(value);
  if (!url) return;
  const parsed = new URL(url);
  items.delete(url);
  items.set(url, { kind: 'url', url, name: parsed.hostname.replace(/^www\./i, '') });
};

const collectAcpOutputPaths = (message: Extract<TMessage, { type: 'acp_tool_call' }>): string[] => {
  const update = message.content?.update;
  if (!update || update.status !== 'completed') return [];

  const paths: string[] = [];
  const imagePath = update.kind === 'read' ? undefined : getAcpImagePath(update);
  if (imagePath) paths.push(imagePath);

  if (update.kind === 'edit') {
    const rawInput = (update.rawInput ?? (update as { raw_input?: Record<string, unknown> }).raw_input) as
      | Record<string, unknown>
      | undefined;
    const inputPath = firstString(rawInput, ['file_path', 'path', 'file_name']);
    if (inputPath) paths.push(inputPath);
    for (const item of update.content ?? []) {
      if (item.type === 'diff' && item.path) paths.push(item.path);
    }
    for (const location of update.locations ?? []) {
      if (location.path) paths.push(location.path);
    }
  }

  return paths;
};

const WRITE_TOOL_NAMES = new Set([
  'applypatch',
  'create',
  'createfile',
  'edit',
  'editfile',
  'imagegeneration',
  'patch',
  'replace',
  'write',
  'writefile',
]);

const isWriteToolName = (toolName: string): boolean =>
  WRITE_TOOL_NAMES.has(
    toolName
      .trim()
      .toLowerCase()
      .replace(/[-_\s]/g, '')
  );

const collectToolCallOutputPaths = (message: Extract<TMessage, { type: 'tool_call' }>): string[] => {
  if (message.content.status !== 'completed' || message.content.error) return [];
  if (!isWriteToolName(message.content.name)) return [];

  const args = message.content.args as Record<string, unknown> | undefined;
  const input = message.content.input as Record<string, unknown> | undefined;
  const filePath =
    firstString(input, ['file_path', 'path', 'file_name']) ?? firstString(args, ['file_path', 'path', 'file_name']);
  return filePath ? [filePath] : [];
};

const collectAcpSourceUrls = (message: Extract<TMessage, { type: 'acp_tool_call' }>): string[] => {
  const update = message.content?.update;
  if (!update || update.status !== 'completed') return [];
  const rawInput = update.rawInput ?? (update as { raw_input?: Record<string, unknown> }).raw_input;
  const rawOutput = update.rawOutput ?? update.raw_output;
  return [...recordHttpUrls(rawInput), ...recordHttpUrls(rawOutput)];
};

const collectToolCallSourceUrls = (message: Extract<TMessage, { type: 'tool_call' }>): string[] => {
  if (message.content.status !== 'completed' || message.content.error) return [];
  return [
    ...recordHttpUrls(message.content.input as Record<string, unknown> | undefined),
    ...recordHttpUrls(message.content.args as Record<string, unknown> | undefined),
  ];
};

const collectToolGroupSourceUrls = (message: Extract<TMessage, { type: 'tool_group' }>): string[] => {
  if (!Array.isArray(message.content)) return [];
  return message.content.flatMap((tool) =>
    tool.status === 'Success' && tool.confirmationDetails?.type === 'info'
      ? (tool.confirmationDetails.urls ?? []).flatMap(extractHttpUrls)
      : []
  );
};

const collectToolGroupOutputPaths = (message: Extract<TMessage, { type: 'tool_group' }>): string[] => {
  if (!Array.isArray(message.content)) return [];
  return message.content.flatMap((tool) => {
    if (tool.status !== 'Success') return [];
    const paths: string[] = [];
    if (tool.confirmationDetails?.type === 'edit') paths.push(tool.confirmationDetails.file_name);
    if (isWriteToolName(tool.name) && tool.result_display && typeof tool.result_display !== 'string') {
      if ('file_diff' in tool.result_display) paths.push(tool.result_display.file_name);
      if ('img_url' in tool.result_display) paths.push(tool.result_display.relative_path);
    }
    return paths;
  });
};

export const isImageResource = (filePath: string): boolean => IMAGE_PATH_PATTERN.test(filePath);

export const collectConversationResources = (messages: TMessage[], workspace?: string): ConversationResources => {
  const sourceItems = new Map<string, ConversationResourceItem>();
  const outputItems = new Map<string, ConversationResourceItem>();

  for (const message of messages) {
    if (message.type === 'text') {
      if (message.position === 'right') {
        const { files } = parseMessageFileMarker(message.content.content, true);
        for (const filePath of files) addFileResource(sourceItems, filePath, workspace);
      } else if (message.position === 'left') {
        for (const url of extractHttpUrls(message.content.content)) addUrlResource(sourceItems, url);
      }
      continue;
    }

    const sourceUrls =
      message.type === 'acp_tool_call'
        ? collectAcpSourceUrls(message)
        : message.type === 'tool_call'
          ? collectToolCallSourceUrls(message)
          : message.type === 'tool_group'
            ? collectToolGroupSourceUrls(message)
            : [];
    for (const url of sourceUrls) addUrlResource(sourceItems, url);

    const outputPaths =
      message.type === 'acp_tool_call'
        ? collectAcpOutputPaths(message)
        : message.type === 'tool_call'
          ? collectToolCallOutputPaths(message)
          : message.type === 'tool_group'
            ? collectToolGroupOutputPaths(message)
            : [];
    for (const filePath of outputPaths) addFileResource(outputItems, filePath, workspace);
  }

  return {
    sources: Array.from(sourceItems.values()),
    outputs: Array.from(outputItems.values())
      .filter((item): item is ConversationFileResourceItem => item.kind === 'file')
      .toReversed(),
  };
};
