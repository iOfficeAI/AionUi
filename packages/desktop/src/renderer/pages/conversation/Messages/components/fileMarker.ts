/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `[[AION_FILES]]` parsing, extracted from `MessageText.tsx` so it can be unit
 * tested without pulling in React and the whole message renderer.
 *
 * Behaviour is unchanged from the inline version apart from the marker-block
 * terminator documented on `parseFileMarker`.
 */

import { AIONUI_FILES_MARKER } from '@/common/config/constants';

export type ParsedFileMarker = {
  text: string;
  files: string[];
};

const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const MARKDOWN_ATTACHMENT_LINE_PATTERN = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|~~~|\|)/;
/** Any other `[[…]]` marker line — the end of this block's path list. */
const MARKER_LINE_PATTERN = /^\[\[/;

export const isAbsoluteMessageFilePath = (file_path: string): boolean =>
  file_path.startsWith('/') || file_path.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(file_path);

const isWorkspaceRelativeMessageFilePath = (file_path: string): boolean => {
  const normalizedFilePath = file_path.replace(/\\/g, '/');
  return (
    normalizedFilePath.startsWith('./') ||
    normalizedFilePath.startsWith('../') ||
    normalizedFilePath.includes('/') ||
    /(?:^|\/)[^/]+\.[^./\s][^/]*$/.test(normalizedFilePath)
  );
};

const isLocalMessageFilePath = (file_path: string): boolean => {
  const trimmedFilePath = file_path.trim();
  if (
    !trimmedFilePath ||
    URL_SCHEME_PATTERN.test(trimmedFilePath) ||
    MARKDOWN_ATTACHMENT_LINE_PATTERN.test(trimmedFilePath)
  ) {
    return false;
  }

  return isAbsoluteMessageFilePath(trimmedFilePath) || isWorkspaceRelativeMessageFilePath(trimmedFilePath);
};

/**
 * Split a user message into its display text and its attachment paths.
 *
 * Every non-empty line after the `[[AION_FILES]]` marker is taken as a path,
 * and a single non-path line abandons the whole parse — deliberately, so a
 * message that merely mentions the marker is rendered verbatim rather than
 * having its tail eaten.
 *
 * That all-or-nothing rule is why the path list stops at the next `[[…]]`
 * marker line. The backend keeps `[[AION_FILES]]` last (see
 * `ConversationService::send_message`), but when a second block did follow it,
 * the block's own delimiter counted as a candidate path, failed the check, and
 * a message carrying both `@` files and `@@` session references lost its file
 * chips and rendered the raw marker as text. Stopping here makes the parse
 * independent of block order instead of relying on the backend's.
 */
export const parseFileMarker = (content: string, canParseFileMarker: boolean): ParsedFileMarker => {
  if (!canParseFileMarker) {
    return { text: content, files: [] };
  }

  const lines = content.split(/\r?\n/);
  let markerLineIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim() === AIONUI_FILES_MARKER) {
      markerLineIndex = index;
      break;
    }
  }

  if (markerLineIndex === -1) {
    return { text: content, files: [] };
  }

  let blockEndIndex = lines.length;
  for (let index = markerLineIndex + 1; index < lines.length; index += 1) {
    if (MARKER_LINE_PATTERN.test(lines[index].trim())) {
      blockEndIndex = index;
      break;
    }
  }

  const files = lines
    .slice(markerLineIndex + 1, blockEndIndex)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!files.length || files.some((file_path) => !isLocalMessageFilePath(file_path))) {
    return { text: content, files: [] };
  }

  // Whatever followed the block is still the user's content, so it is kept —
  // dropping it would silently swallow text. With nothing after the block this
  // is byte-identical to the original `slice(0, markerLineIndex).trimEnd()`.
  const before = lines.slice(0, markerLineIndex);
  const after = lines.slice(blockEndIndex);
  const text = after.length > 0 ? [...before, ...after].join('\n').trim() : before.join('\n').trimEnd();
  return { text, files };
};

export const resolveMessageFilePath = (file_path: string, workspace?: string): string => {
  if (!file_path || isAbsoluteMessageFilePath(file_path) || !workspace) {
    return file_path;
  }

  const normalizedWorkspace = workspace.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const normalizedFilePath = file_path.replace(/^\.?[\\/]+/, '').replace(/\\/g, '/');
  return `${normalizedWorkspace}/${normalizedFilePath}`.replace(/\/+/g, '/');
};
