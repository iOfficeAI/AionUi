/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelMediaAction } from '../types';
import path from 'path';
import { existsSync, lstatSync, realpathSync, statSync } from 'fs';
import { getDatabase } from '@process/services/database';
import { getConfigPath, getDataPath } from '@process/utils';

const CHANNEL_SEND_BLOCK_RE = /\[AIONUI_CHANNEL_SEND\]\s*([\s\S]*?)\s*\[\/AIONUI_CHANNEL_SEND\]/g;
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
// Any `-temp-<id>` segment marks an auto-provisioned workspace. Covers:
//   - Legacy `{dataRoot}/<backend>-temp-<ts>/...` (digit suffix)
//   - Current `{dataRoot}/conversations/<backend>-temp-<shortid>/...`
// Alphanumeric id captures both timestamps and the 8-char short ids minted
// by `uuid()` / `generate_short_id()`.
const TEMP_SEGMENT_REGEX = /-temp-[A-Za-z0-9_-]+$/;

type RawChannelMediaAction = {
  type: 'image' | 'file';
  path: string;
  file_name?: string;
  caption?: string;
};

export type ChannelSendRejectReason =
  | 'workspace_unavailable'
  | 'not_found'
  | 'outside_allowed'
  | 'not_file'
  | 'too_large';

export type RejectedChannelMediaAction = {
  type: 'image' | 'file';
  path: string;
  file_name?: string;
  reason: ChannelSendRejectReason;
};

function normalizeVisibleText(content: string): string {
  return content.replace(/\n{3,}/g, '\n\n').trim();
}

function parseRawChannelMediaAction(jsonText: string): RawChannelMediaAction | null {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const type = parsed.type;
    const actionPath = parsed.path;
    if ((type !== 'image' && type !== 'file') || typeof actionPath !== 'string' || !actionPath.trim()) {
      return null;
    }

    return {
      type,
      path: actionPath.trim(),
      ...(typeof parsed.file_name === 'string' && parsed.file_name.trim()
        ? { file_name: parsed.file_name.trim() }
        : {}),
      ...(typeof parsed.caption === 'string' && parsed.caption.trim() ? { caption: parsed.caption.trim() } : {}),
    };
  } catch {
    return null;
  }
}

function isPathInsideDirectory(candidatePath: string, directory: string): boolean {
  const relative = path.relative(directory, candidatePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isPathInsideManagedTempWorkspace(candidatePath: string, dataRoot: string): boolean {
  const relative = path.relative(dataRoot, candidatePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }

  const segments = relative.split(/[\\/]+/).filter(Boolean);
  const firstSegment = segments[0];
  if (!firstSegment) return false;

  // Legacy: `{dataRoot}/<backend>-temp-<ts>/...`
  if (TEMP_SEGMENT_REGEX.test(firstSegment)) {
    return true;
  }

  // Current: `{dataRoot}/conversations/<backend>-temp-<id>/...` or the
  // brief transitional `{dataRoot}/conversations/<uuid>/...` layout. Anything
  // directly under `conversations/` was auto-provisioned by the backend.
  return firstSegment === 'conversations' && !!segments[1];
}

function getCanonicalRoot(rootPath: string): string | null {
  if (!existsSync(rootPath)) {
    return null;
  }

  try {
    return realpathSync(rootPath);
  } catch {
    return null;
  }
}

function isAllowedChannelSendPath(candidatePath: string, workspaceRoot: string): boolean {
  if (isPathInsideDirectory(candidatePath, workspaceRoot)) {
    return true;
  }

  const managedDataRoot = getCanonicalRoot(getDataPath());
  if (managedDataRoot && isPathInsideManagedTempWorkspace(candidatePath, managedDataRoot)) {
    return true;
  }

  const managedConfigTempRoot = getCanonicalRoot(path.join(getConfigPath(), 'temp'));
  if (managedConfigTempRoot && isPathInsideDirectory(candidatePath, managedConfigTempRoot)) {
    return true;
  }

  const weixinUploadsRoot = managedDataRoot ? getCanonicalRoot(path.join(managedDataRoot, 'weixin-uploads')) : null;
  if (weixinUploadsRoot && isPathInsideDirectory(candidatePath, weixinUploadsRoot)) {
    return true;
  }

  return false;
}

export function extractChannelSendProtocol(content: string): {
  visibleText: string;
  actions: RawChannelMediaAction[];
} {
  const actions: RawChannelMediaAction[] = [];

  const visibleText = normalizeVisibleText(
    content.replace(CHANNEL_SEND_BLOCK_RE, (fullMatch, jsonText: string) => {
      const parsed = parseRawChannelMediaAction(jsonText);
      if (!parsed) return fullMatch;
      actions.push(parsed);
      return '';
    })
  );

  return { visibleText, actions };
}

export async function resolveChannelSendProtocol(
  content: string,
  conversation_id: string
): Promise<{
  visibleText: string;
  mediaActions: IChannelMediaAction[];
  rejectedActions: RejectedChannelMediaAction[];
}> {
  const extracted = extractChannelSendProtocol(content);
  if (extracted.actions.length === 0) {
    return { visibleText: extracted.visibleText, mediaActions: [], rejectedActions: [] };
  }

  const rejectAll = (
    reason: ChannelSendRejectReason
  ): { visibleText: string; mediaActions: IChannelMediaAction[]; rejectedActions: RejectedChannelMediaAction[] } => {
    return {
      visibleText: extracted.visibleText,
      mediaActions: [],
      rejectedActions: extracted.actions.map((action) => ({
        type: action.type,
        path: action.path,
        file_name: action.file_name,
        reason,
      })),
    };
  };

  const db = await getDatabase();
  const conversation = db.getConversation(conversation_id);
  const workspace = conversation.success ? conversation.data?.extra?.workspace : undefined;
  if (!workspace || !existsSync(workspace)) {
    return rejectAll('workspace_unavailable');
  }

  let workspaceRoot: string;
  try {
    workspaceRoot = realpathSync(workspace);
  } catch {
    return rejectAll('workspace_unavailable');
  }

  const mediaActions: IChannelMediaAction[] = [];
  const rejectedActions: RejectedChannelMediaAction[] = [];
  for (const action of extracted.actions) {
    const resolvedPath = path.isAbsolute(action.path)
      ? path.resolve(action.path)
      : path.resolve(workspaceRoot, action.path);

    if (!resolvedPath) continue;
    if (!existsSync(resolvedPath)) {
      rejectedActions.push({
        type: action.type,
        path: action.path,
        file_name: action.file_name,
        reason: 'not_found',
      });
      continue;
    }

    try {
      const pathInfo = lstatSync(resolvedPath);
      const canonicalPath = realpathSync(resolvedPath);
      if (!isAllowedChannelSendPath(canonicalPath, workspaceRoot)) {
        rejectedActions.push({
          type: action.type,
          path: action.path,
          file_name: action.file_name,
          reason: 'outside_allowed',
        });
        continue;
      }

      const stats = pathInfo.isSymbolicLink() ? statSync(canonicalPath) : pathInfo;
      if (!stats.isFile()) {
        rejectedActions.push({
          type: action.type,
          path: action.path,
          file_name: action.file_name,
          reason: 'not_file',
        });
        continue;
      }
      if (stats.size > MAX_MEDIA_BYTES) {
        rejectedActions.push({
          type: action.type,
          path: action.path,
          file_name: action.file_name,
          reason: 'too_large',
        });
        continue;
      }

      mediaActions.push({
        ...action,
        path: canonicalPath,
      });
    } catch {
      continue;
    }
  }

  return {
    visibleText: extracted.visibleText,
    mediaActions,
    rejectedActions,
  };
}
