/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';

import { diffColors } from '@/renderer/styles/colors';

/**
 * Format raw code string, attempting JSON pretty-print.
 * Falls back to stripped trailing newline if parsing fails.
 */
export const formatCode = (code: string): string => {
  const content = String(code).replace(/\n$/, '');
  try {
    return JSON.stringify(
      JSON.parse(content),
      (_key, value) => {
        return value;
      },
      2
    );
  } catch (_error) {
    return content;
  }
};

/**
 * Conditional render helper — returns trueComponent when condition is true,
 * falseComponent otherwise.
 */
export const logicRender = <T, F>(condition: boolean, trueComponent: T, falseComponent?: F): T | F => {
  return condition ? trueComponent : (falseComponent as F);
};

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export type LocalFileLinkReference = {
  filePath: string;
  rawReference: string;
  line?: number;
  column?: number;
};

const normalizeLocalFileHrefToPath = (href: string): string | null => {
  if (/^file:/i.test(href)) {
    try {
      const url = new URL(href);
      const path = safeDecodeURIComponent(url.pathname);
      return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path;
    } catch {
      const path = href.replace(/^file:\/+/i, '');
      return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path;
    }
  }

  if (/^[A-Za-z]:[\\/]/.test(href)) return href;
  if (/^\/[A-Za-z]:[\\/]/.test(href)) return href.slice(1);

  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      const path = safeDecodeURIComponent(url.pathname);
      return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : null;
    } catch {
      return null;
    }
  }

  if (/^\/(Users|home|tmp|private|var|mnt|Volumes)\//.test(href)) return href;
  if (/^\/[^/?#]+\/.+\.[^/?#/.]+(?:[?#].*)?$/.test(href)) return href;

  return null;
};

const splitLocationSuffix = (filePath: string): Omit<LocalFileLinkReference, 'rawReference'> => {
  const lineColumnMatch = /^(.*):(\d+):(\d+)$/.exec(filePath);
  if (lineColumnMatch) {
    const [, pathWithoutLocation, lineText, columnText] = lineColumnMatch;
    if (normalizeLocalFileHrefToPath(pathWithoutLocation)) {
      return {
        filePath: pathWithoutLocation,
        line: Number(lineText),
        column: Number(columnText),
      };
    }
  }

  const lineMatch = /^(.*):(\d+)$/.exec(filePath);
  if (!lineMatch) return { filePath };

  const [, pathWithoutLocation, lineText] = lineMatch;
  if (!normalizeLocalFileHrefToPath(pathWithoutLocation)) return { filePath };

  return {
    filePath: pathWithoutLocation,
    line: Number(lineText),
  };
};

export const resolveLocalFileLinkReference = (
  rawHref: string,
  resolvedHref?: string
): LocalFileLinkReference | null => {
  const href = safeDecodeURIComponent((rawHref || resolvedHref || '').trim());
  if (!href) return null;

  const filePath = normalizeLocalFileHrefToPath(href);
  if (!filePath) return null;

  const reference = splitLocationSuffix(filePath);
  return {
    ...reference,
    rawReference:
      reference.line == null
        ? reference.filePath
        : `${reference.filePath}:${reference.line}${reference.column == null ? '' : `:${reference.column}`}`,
  };
};

export const resolveLocalFileLinkPath = (rawHref: string, resolvedHref?: string): string | null => {
  return resolveLocalFileLinkReference(rawHref, resolvedHref)?.filePath ?? null;
};

export const toLocalFileHref = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  const withScheme = /^[A-Za-z]:\//.test(normalized) ? `file:///${normalized}` : `file://${normalized}`;
  return encodeURI(withScheme);
};

/**
 * Get line background style for diff rendering.
 * Highlights additions (green), deletions (red), and hunk headers (blue).
 */
export const getDiffLineStyle = (line: string, isDark: boolean): React.CSSProperties => {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return { backgroundColor: isDark ? diffColors.additionBgDark : diffColors.additionBgLight };
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return { backgroundColor: isDark ? diffColors.deletionBgDark : diffColors.deletionBgLight };
  }
  if (line.startsWith('@@')) {
    return { backgroundColor: isDark ? diffColors.hunkBgDark : diffColors.hunkBgLight };
  }
  return {};
};
