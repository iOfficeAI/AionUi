/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { joinPath } from '@/common/chat/chatLib';
import type { PreviewContentType } from '@/common/types/preview';
import {
  LARGE_TEXT_PREVIEW_MAX_LENGTH,
  LARGE_TEXT_PREVIEW_THRESHOLD,
} from '@/renderer/pages/conversation/Preview/constants';
import { getFileTypeInfo } from './fileType';

const EXTERNAL_URL_REGEX = /^(https?:|mailto:|tel:|ftp:|data:|blob:|javascript:|#)/i;
const FILE_URL_REGEX = /^file:\/\//i;
const WINDOWS_ABSOLUTE_PATH_REGEX = /^[A-Za-z]:[\\/]/;
const WINDOWS_NETWORK_PATH_REGEX = /^\\\\/;
const UNIX_ABSOLUTE_PATH_REGEX = /^\//;
const RELATIVE_FILE_HINT_REGEX = /^(?:\.{1,2}[\\/]|[^?#]*[\\/][^?#]*|[^?#]+\.[A-Za-z0-9]+)(?::\d+(?::\d+)?)?$/;
const LINE_SUFFIX_REGEX = /^(.*?)(?::(\d+))(?::(\d+))?$/;
const PREVIEW_READ_TIMEOUT_MS = 5000;

const BINARY_ONLY_PREVIEW_TYPES = new Set<PreviewContentType>(['pdf', 'ppt', 'word', 'excel']);
const LARGE_TEXT_PREVIEW_TYPES = new Set<PreviewContentType>(['code', 'markdown', 'html', 'diff']);

export type MarkdownLinkPreviewContext = {
  workspace?: string;
  baseDir?: string;
};

type MarkdownPreviewMetadata = {
  title?: string;
  fileName?: string;
  filePath?: string;
  workspace?: string;
  editable?: boolean;
  language?: string;
};

export type MarkdownPreviewOpener = (
  content: string,
  contentType: PreviewContentType,
  metadata?: MarkdownPreviewMetadata
) => void;

const decodeHref = (href: string): string => {
  const normalizedHref = href.trim().replace(/^<|>$/g, '');
  try {
    return decodeURIComponent(normalizedHref);
  } catch {
    return normalizedHref;
  }
};

const isAbsoluteLocalPath = (value: string): boolean => {
  return (
    WINDOWS_ABSOLUTE_PATH_REGEX.test(value) ||
    WINDOWS_NETWORK_PATH_REGEX.test(value) ||
    UNIX_ABSOLUTE_PATH_REGEX.test(value)
  );
};

const normalizeLocalHref = (href: string): string => {
  const decodedHref = decodeHref(href);
  if (!FILE_URL_REGEX.test(decodedHref)) {
    return decodedHref;
  }

  const withoutProtocol = decodedHref.replace(FILE_URL_REGEX, '');
  if (/^\/[A-Za-z]:/.test(withoutProtocol)) {
    return withoutProtocol.slice(1);
  }
  return withoutProtocol;
};

const stripLineSuffix = (value: string): string => {
  const match = value.match(LINE_SUFFIX_REGEX);
  if (!match) {
    return value;
  }

  const candidatePath = match[1];
  const looksLikeFilePath =
    isAbsoluteLocalPath(candidatePath) ||
    candidatePath.includes('/') ||
    candidatePath.includes('\\') ||
    /\.[A-Za-z0-9]+$/.test(candidatePath);

  return looksLikeFilePath ? candidatePath : value;
};

const normalizePreviewPath = (value: string): string => {
  return value.replace(/\\/g, '/');
};

const normalizeComparablePath = (value: string): string => {
  const normalized = normalizePreviewPath(value).replace(/\/+$/, '');
  return WINDOWS_ABSOLUTE_PATH_REGEX.test(normalized) ? normalized.toLowerCase() : normalized;
};

const normalizeLargeTextPreview = (
  content: string,
  contentType: PreviewContentType
): { content: string; truncated: boolean } => {
  if (!LARGE_TEXT_PREVIEW_TYPES.has(contentType) || content.length <= LARGE_TEXT_PREVIEW_THRESHOLD) {
    return { content, truncated: false };
  }

  return {
    content: content.slice(0, LARGE_TEXT_PREVIEW_MAX_LENGTH),
    truncated: true,
  };
};

const resolvePreviewWorkspace = (filePath: string, workspace?: string): string | undefined => {
  if (!workspace) {
    return undefined;
  }

  const normalizedWorkspace = normalizeComparablePath(workspace);
  const normalizedFilePath = normalizeComparablePath(filePath);
  if (normalizedFilePath === normalizedWorkspace || normalizedFilePath.startsWith(`${normalizedWorkspace}/`)) {
    return normalizePreviewPath(workspace);
  }

  return undefined;
};

const toFileUrl = (filePath: string): string => {
  const normalizedPath = normalizePreviewPath(filePath);
  if (/^[A-Za-z]:\//.test(normalizedPath)) {
    return `file:///${encodeURI(normalizedPath)}`;
  }
  return `file://${encodeURI(normalizedPath)}`;
};

export const resolveLocalMarkdownLinkPath = (
  href: string,
  { workspace, baseDir }: MarkdownLinkPreviewContext = {}
): string | null => {
  const normalizedHref = normalizeLocalHref(href);
  if (!normalizedHref || EXTERNAL_URL_REGEX.test(normalizedHref)) {
    return null;
  }

  const strippedPath = stripLineSuffix(normalizedHref);
  if (isAbsoluteLocalPath(strippedPath)) {
    return normalizePreviewPath(strippedPath);
  }

  if (!RELATIVE_FILE_HINT_REGEX.test(strippedPath)) {
    return null;
  }

  const basePath = baseDir || workspace;
  if (!basePath) {
    return null;
  }

  return joinPath(basePath, strippedPath);
};

export const resolveMarkdownLinkFallbackHref = (
  href: string,
  currentHref: string,
  context: MarkdownLinkPreviewContext = {}
): string => {
  const filePath = resolveLocalMarkdownLinkPath(href, context);
  if (!filePath) {
    return currentHref || href;
  }
  return toFileUrl(filePath);
};

export const openMarkdownLinkPreview = async ({
  href,
  workspace,
  baseDir,
  openPreview,
}: MarkdownLinkPreviewContext & {
  href: string;
  openPreview?: MarkdownPreviewOpener;
}): Promise<boolean> => {
  const resolvedPath = resolveLocalMarkdownLinkPath(href, { workspace, baseDir });
  if (!resolvedPath || !openPreview) {
    return false;
  }

  try {
    const fileMetadata = await ipcBridge.fs.getFileMetadata.invoke({ path: resolvedPath });
    if (fileMetadata.isDirectory) {
      return false;
    }

    const fileName = fileMetadata.name || resolvedPath.split(/[\\/]/).pop() || resolvedPath;
    const { contentType, editable, language } = getFileTypeInfo(fileName);
    const previewWorkspace = resolvePreviewWorkspace(resolvedPath, workspace);
    const previewEditable = editable && Boolean(previewWorkspace);

    let previewContent = '';
    let truncated = false;

    if (contentType === 'image') {
      previewContent = await ipcBridge.fs.getImageBase64.invoke({ path: resolvedPath });
    } else if (!BINARY_ONLY_PREVIEW_TYPES.has(contentType)) {
      const fileContent = await Promise.race([
        ipcBridge.fs.readFile.invoke({ path: resolvedPath }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('File read timeout')), PREVIEW_READ_TIMEOUT_MS);
        }),
      ]);
      const normalizedContent = normalizeLargeTextPreview(fileContent, contentType);
      previewContent = normalizedContent.content;
      truncated = normalizedContent.truncated;
    }

    openPreview(previewContent, contentType, {
      title: fileName,
      fileName,
      filePath: resolvedPath,
      workspace: previewWorkspace,
      editable: truncated ? false : previewEditable,
      language,
    });
    return true;
  } catch {
    return false;
  }
};
